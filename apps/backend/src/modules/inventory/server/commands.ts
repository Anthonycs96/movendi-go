import "server-only";
import { randomUUID } from "node:crypto";
import { ZodError, type ZodType } from "zod";
import { audit } from "@/core/audit/audit";
import { AppError } from "@/core/auth/errors";
import { prisma } from "@/core/database/prisma";
import type { TenantScope } from "@/core/auth/types";
import { applyInventoryMovement, reverseRestaurantSaleInventory, withInventoryTransaction } from "./service";
import { inventoryCountSchema, inventoryItemSchema, inventoryItemUpdateSchema, inventoryMovementSchema, inventoryPurchaseSchema, inventoryRecipeSchema, inventoryReturnSchema } from "./schemas";
import { assertRestaurantConfigured, getRestaurantConfiguration, hasStoredRestaurantConfiguration } from "@/modules/restaurant/server/configuration";

function parse<T>(schema: ZodType<T>, body: unknown): T {
  try { return schema.parse(body); }
  catch (error) { if (error instanceof ZodError) throw new AppError("VALIDATION_ERROR", 400, error.issues[0]?.message ?? "Datos inválidos.", error.flatten()); throw error; }
}

function operationCode(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`;
}

function ensureUniqueIds(ids: string[], label: string) {
  if (new Set(ids).size !== ids.length) throw new AppError("DUPLICATE_LINES", 400, `${label} contiene artículos repetidos.`);
}

export async function handleInventoryCommand(method: string, segments: string[], body: unknown, scope: TenantScope) {
  const [resource, id] = segments;

  if (method === "POST" && resource === "items" && !id) {
    const input = parse(inventoryItemSchema, body);
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: scope.tenantId }, select: { type: true } });
    if (tenant.type === "RESTAURANT" && await hasStoredRestaurantConfiguration(scope.tenantId)) assertRestaurantConfigured((await getRestaurantConfiguration(scope.tenantId, scope.branchId)).inventory.units, input.unit, "La unidad de inventario");
    const entity = await withInventoryTransaction(async (tx) => {
      const item = await tx.inventoryItem.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, sku: input.sku, barcode: input.barcode || null, name: input.name, kind: input.kind, unit: input.unit, minimumStock: input.minimumStock, unitCostCents: input.unitCost, trackStock: input.trackStock, notes: input.notes || null } });
      const openingStock = input.openingStock ?? 0;
      if (openingStock > 0) await applyInventoryMovement(tx, scope, { itemId: item.id, type: "OPENING_BALANCE", direction: "IN", quantity: openingStock, unitCostCents: input.unitCost, originType: "OPENING_BALANCE", originId: item.id, idempotencyKey: `OPENING:${item.id}` });
      return item;
    });
    await audit(scope, "CREATE", "InventoryItem", entity.id, { sku: entity.sku, openingStock: input.openingStock });
    return { ok: true, id: entity.id, message: "Artículo de inventario registrado." };
  }

  if (method === "PATCH" && resource === "items" && id) {
    const input = parse(inventoryItemUpdateSchema, body);
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: scope.tenantId }, select: { type: true } });
    if (tenant.type === "RESTAURANT" && await hasStoredRestaurantConfiguration(scope.tenantId)) assertRestaurantConfigured((await getRestaurantConfiguration(scope.tenantId, scope.branchId)).inventory.units, input.unit, "La unidad de inventario");
    const existing = await prisma.inventoryItem.findFirst({ where: { id, tenantId: scope.tenantId, OR: [{ branchId: scope.branchId }, { branchId: null }] } });
    if (!existing) throw new AppError("INVENTORY_ITEM_NOT_FOUND", 404, "El artículo no existe en esta sede.");
    const entity = await prisma.inventoryItem.update({ where: { id }, data: { branchId: existing.branchId ?? scope.branchId, sku: input.sku, barcode: input.barcode || null, name: input.name, kind: input.kind, unit: input.unit, minimumStock: input.minimumStock, unitCostCents: input.unitCost, trackStock: input.trackStock, notes: input.notes || null, active: input.active } });
    await audit(scope, "UPDATE", "InventoryItem", entity.id, { sku: entity.sku });
    return { ok: true, id: entity.id, message: "Artículo actualizado." };
  }

  if (method === "POST" && resource === "movements") {
    const input = parse(inventoryMovementSchema, body);
    const direction = ["PURCHASE", "RESTOCK", "RETURN_IN", "ADJUSTMENT_IN"].includes(input.type) ? "IN" : "OUT";
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: scope.tenantId }, select: { type: true } });
    const restaurantConfiguration = tenant.type === "RESTAURANT" ? await getRestaurantConfiguration(scope.tenantId, scope.branchId) : null;
    const entity = await withInventoryTransaction((tx) => applyInventoryMovement(tx, scope, { itemId: input.itemId, type: input.type, direction, quantity: input.quantity, unitCostCents: direction === "IN" ? input.unitCost : undefined, originType: "MANUAL", idempotencyKey: input.idempotencyKey, reference: input.reference || null, notes: input.notes || null, occurredAt: input.occurredAt, preventNegativeStock: restaurantConfiguration?.inventory.preventNegativeStock ?? true }));
    await audit(scope, "MOVE", "InventoryItem", input.itemId, { movementId: entity.id, type: input.type, quantity: input.quantity });
    return { ok: true, id: entity.id, message: "Movimiento aplicado y stock actualizado." };
  }

  if (method === "POST" && resource === "purchases") {
    const input = parse(inventoryPurchaseSchema, body);
    ensureUniqueIds(input.lines.map((line) => line.itemId), "La compra");
    const entity = await withInventoryTransaction(async (tx) => {
      if (input.idempotencyKey) {
        const existingMovement = await tx.inventoryMovement.findFirst({ where: { tenantId: scope.tenantId, idempotencyKey: `PURCHASE:${input.idempotencyKey}:0` }, select: { purchaseId: true } });
        if (existingMovement?.purchaseId) return tx.inventoryPurchase.findUniqueOrThrow({ where: { id: existingMovement.purchaseId } });
      }
      const code = operationCode("COM");
      const purchase = await tx.inventoryPurchase.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, createdById: scope.actorId, code, supplierName: input.supplierName, documentNumber: input.documentNumber || null, totalCents: input.lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unitCost), 0), notes: input.notes || null, purchasedAt: input.purchasedAt ?? new Date(), lines: { create: input.lines.map((line) => ({ itemId: line.itemId, quantity: line.quantity, unitCostCents: line.unitCost, totalCents: Math.round(line.quantity * line.unitCost) })) } } });
      for (const [index, line] of input.lines.entries()) await applyInventoryMovement(tx, scope, { itemId: line.itemId, type: "PURCHASE", direction: "IN", quantity: line.quantity, unitCostCents: line.unitCost, originType: "PURCHASE", originId: purchase.id, purchaseId: purchase.id, idempotencyKey: input.idempotencyKey ? `PURCHASE:${input.idempotencyKey}:${index}` : `PURCHASE:${purchase.id}:${line.itemId}`, reference: input.documentNumber || code, notes: input.notes || null, occurredAt: input.purchasedAt });
      return purchase;
    });
    await audit(scope, "CREATE", "InventoryPurchase", entity.id, { code: entity.code, totalCents: entity.totalCents });
    return { ok: true, id: entity.id, message: `Compra ${entity.code} registrada y stock actualizado.` };
  }

  if (method === "POST" && resource === "counts") {
    const input = parse(inventoryCountSchema, body);
    ensureUniqueIds(input.lines.map((line) => line.itemId), "El conteo");
    const entity = await withInventoryTransaction(async (tx) => {
      const code = operationCode("CNT");
      const count = await tx.inventoryCount.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, createdById: scope.actorId, code, notes: input.notes || null, countedAt: input.countedAt ?? new Date() } });
      for (const [index, line] of input.lines.entries()) {
        const item = await tx.inventoryItem.findFirst({ where: { id: line.itemId, tenantId: scope.tenantId, OR: [{ branchId: scope.branchId }, { branchId: null }], active: true } });
        if (!item) throw new AppError("INVENTORY_ITEM_NOT_FOUND", 404, "Uno de los artículos del conteo ya no existe.");
        const difference = line.countedQuantity - item.stock;
        await tx.inventoryCountLine.create({ data: { countId: count.id, itemId: item.id, expectedQuantity: item.stock, countedQuantity: line.countedQuantity, difference } });
        if (Math.abs(difference) > 1e-9) await applyInventoryMovement(tx, scope, { itemId: item.id, type: "COUNT_ADJUSTMENT", direction: difference > 0 ? "IN" : "OUT", quantity: Math.abs(difference), originType: "COUNT", originId: count.id, countId: count.id, idempotencyKey: input.idempotencyKey ? `COUNT:${input.idempotencyKey}:${index}` : `COUNT:${count.id}:${item.id}`, reference: code, notes: input.notes || null, occurredAt: input.countedAt });
      }
      return count;
    });
    await audit(scope, "CREATE", "InventoryCount", entity.id, { code: entity.code, lines: input.lines.length });
    return { ok: true, id: entity.id, message: `Conteo ${entity.code} aplicado al stock.` };
  }

  if (method === "POST" && resource === "recipes" && id) {
    const input = parse(inventoryRecipeSchema, body);
    ensureUniqueIds(input.ingredients.map((ingredient) => ingredient.itemId), "La receta");
    const product = await prisma.product.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId, active: true } });
    if (!product) throw new AppError("PRODUCT_NOT_FOUND", 404, "El producto vendido no existe en esta sede.");
    const validItems = await prisma.inventoryItem.count({ where: { id: { in: input.ingredients.map((ingredient) => ingredient.itemId) }, tenantId: scope.tenantId, OR: [{ branchId: scope.branchId }, { branchId: null }], active: true, trackStock: true } });
    if (validItems !== input.ingredients.length) throw new AppError("INVALID_RECIPE_ITEMS", 400, "La receta contiene insumos inválidos o de otra sede.");
    const recipe = await prisma.productRecipe.upsert({ where: { productId: product.id }, update: { yieldQuantity: input.yieldQuantity, active: input.active, ingredients: { deleteMany: {}, create: input.ingredients } }, create: { productId: product.id, yieldQuantity: input.yieldQuantity, active: input.active, ingredients: { create: input.ingredients } } });
    await audit(scope, "UPSERT", "ProductRecipe", recipe.id, { productId: product.id, ingredients: input.ingredients.length });
    return { ok: true, id: recipe.id, message: "Receta guardada. Las ventas descontarán sus insumos automáticamente." };
  }

  if (method === "POST" && resource === "returns") {
    const input = parse(inventoryReturnSchema, body);
    const sale = await prisma.sale.findFirst({ where: { id: input.saleId, tenantId: scope.tenantId, branchId: scope.branchId } });
    if (!sale) throw new AppError("SALE_NOT_FOUND", 404, "La venta no existe en esta sede.");
    const restored = await withInventoryTransaction((tx) => reverseRestaurantSaleInventory(tx, scope, sale.id, input.reason));
    await audit(scope, "RETURN", "SaleInventory", sale.id, { restored, reason: input.reason });
    return { ok: true, id: sale.id, message: `Inventario devuelto: ${restored} artículo(s).` };
  }

  throw new AppError("NOT_FOUND", 404, "Operación de inventario no encontrada.");
}
