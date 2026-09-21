import { hasPermission } from "@/core/auth/permissions";
import { withSerializableTransaction } from "@/core/database/transactions";
import { z } from "zod";
import "server-only";
import { parseInput as parse } from "@/core/validation/parse-input";
import type { InventoryCommandPolicies } from "./policies";
import { audit } from "@/core/audit/audit";
import { AppError } from "@/core/auth/errors";
import { prisma } from "@/core/database/prisma";
import type { TenantScope } from "@/core/auth/types";
import { applyInventoryMovement, registerInventoryCount, registerInventoryPurchase } from "./service";
import { inventoryCountSchema, inventoryItemSchema, inventoryItemUpdateSchema, inventoryMovementSchema, inventoryPurchaseSchema } from "./schemas";

export async function handleInventoryCommand(method: string, segments: string[], body: unknown, scope: TenantScope, policies: InventoryCommandPolicies = {}) {
  const [resource, id] = segments;
  if (resource === "suppliers" && ((method === "POST" && !id) || (method === "PATCH" && id))) {
    const input = parse(z.object({ name: z.string().trim().min(2).max(160), documentType: z.enum(["RUC", "DNI", "OTHER"]), documentNumber: z.string().trim().min(1).max(30), phone: z.string().trim().max(30).optional(), email: z.string().email().or(z.literal("")).optional(), address: z.string().trim().max(200).optional(), contact: z.string().trim().max(120).optional(), active: z.boolean().default(true) }).refine((v) => v.documentType === "OTHER" || (v.documentType === "RUC" ? /^\d{11}$/ : /^\d{8}$/).test(v.documentNumber), "Revisa el número de documento."), body);
    const entity = await withSerializableTransaction(async (tx) => {
      if (id && !await tx.inventorySupplier.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId } })) throw new AppError("NOT_FOUND", 404, "Proveedor no encontrado.");
      const result = id ? await tx.inventorySupplier.update({ where: { id }, data: input }) : await tx.inventorySupplier.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, ...input } });
      await tx.auditLog.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, userId: scope.actorId, action: id ? "UPDATE" : "CREATE", entityType: "InventorySupplier", entityId: result.id } });
      return result;
    });
    return { ok: true, id: entity.id, message: "Proveedor guardado." };
  }

  if (method === "POST" && resource === "presentations") {
    const input = parse(z.object({ itemId: z.string().min(1), name: z.string().trim().min(2).max(80), factor: z.coerce.number().positive().max(1000000) }), body);
    const item = await prisma.inventoryItem.findFirst({ where: { id: input.itemId, tenantId: scope.tenantId, branchId: scope.branchId, active: true } });
    if (!item) throw new AppError("NOT_FOUND", 404, "Artículo no encontrado en esta sede.");
    const presentation = await prisma.inventoryPresentation.create({ data: input });
    await audit(scope, "CREATE", "InventoryPresentation", presentation.id, input);
    return { ok: true, id: presentation.id, message: "Presentación guardada. El costo de compra se ingresa por pack o caja." };
  }
  if (method === "POST" && resource === "items" && !id) {
    const input = parse(inventoryItemSchema, body);
    if (input.unitCost > 0 && !hasPermission(scope.permissions, "inventory:costs:write")) throw new AppError("FORBIDDEN", 403, "No tienes permiso para modificar costos.");
    if (input.openingStock > 0 && !hasPermission(scope.permissions, "inventory:adjust:write")) throw new AppError("FORBIDDEN", 403, "No tienes permiso para ingresar existencias.");
    await policies.validateUnit?.(input.unit);
    const entity = await withSerializableTransaction(async (tx) => {
      const item = await tx.inventoryItem.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, inventoryCategory: input.inventoryCategory || null, sku: input.sku, barcode: input.barcode || null, name: input.name, kind: input.kind, unit: input.unit, minimumStock: input.minimumStock, unitCostCents: input.unitCost, trackStock: input.trackStock, notes: input.notes || null } });
      const openingStock = input.openingStock ?? 0;
      if (openingStock > 0) await applyInventoryMovement(tx, scope, { itemId: item.id, type: "OPENING_BALANCE", direction: "IN", quantity: openingStock, unitCostCents: input.unitCost, originType: "OPENING_BALANCE", originId: item.id, idempotencyKey: `OPENING:${item.id}` });
      return item;
    });
    await audit(scope, "CREATE", "InventoryItem", entity.id, { sku: entity.sku, openingStock: input.openingStock });
    return { ok: true, id: entity.id, message: "Artículo de inventario registrado." };
  }

  if (method === "PATCH" && resource === "items" && id) {
    const input = parse(inventoryItemUpdateSchema, body);
    await policies.validateUnit?.(input.unit);
    const existing = await prisma.inventoryItem.findFirst({ where: { id, tenantId: scope.tenantId, OR: [{ branchId: scope.branchId }, { branchId: null }] } });
    if (!existing) throw new AppError("INVENTORY_ITEM_NOT_FOUND", 404, "El artículo no existe en esta sede.");
    if (input.unitCost !== existing.unitCostCents && !hasPermission(scope.permissions, "inventory:costs:write")) throw new AppError("FORBIDDEN", 403, "No tienes permiso para modificar costos.");
    const entity = await withSerializableTransaction(async tx => {
      const current = await tx.inventoryItem.findUniqueOrThrow({ where: { id } });
      if (input.unit !== current.unit && await tx.inventoryMovement.count({ where: { itemId: id } })) throw new AppError("UNIT_HAS_HISTORY", 409, "La unidad base tiene movimientos; conserva su equivalencia y utiliza presentaciones para packs o cajas.");
      if ((!input.active || !input.trackStock) && await tx.inventoryMovement.count({ where: { itemId: id, type: "ORDER_RESERVATION" } })) throw new AppError("ITEM_RESERVED", 409, "Finaliza los pedidos reservados antes de desactivar el artículo o su stock.");
      return tx.inventoryItem.update({ where: { id }, data: { branchId: existing.branchId ?? scope.branchId, inventoryCategory: input.inventoryCategory || null, sku: input.sku, barcode: input.barcode || null, name: input.name, kind: input.kind, unit: input.unit, minimumStock: input.minimumStock, unitCostCents: input.unitCost, trackStock: input.trackStock, notes: input.notes || null, active: input.active } });
    });
    await audit(scope, "UPDATE", "InventoryItem", entity.id, { sku: entity.sku });
    return { ok: true, id: entity.id, message: "Artículo actualizado." };
  }

  if (method === "POST" && resource === "movements") {
    const input = parse(inventoryMovementSchema, body);
    if (input.unitCost !== undefined && !hasPermission(scope.permissions, "inventory:costs:write")) throw new AppError("FORBIDDEN", 403, "No tienes permiso para modificar costos.");
    const direction = ["PURCHASE", "RESTOCK", "RETURN_IN", "ADJUSTMENT_IN"].includes(input.type) ? "IN" : "OUT";
    const preventNegativeStock = await policies.preventNegativeStock?.() ?? true;
    const entity = await withSerializableTransaction((tx) => applyInventoryMovement(tx, scope, { itemId: input.itemId, type: input.type, direction, quantity: input.quantity, unitCostCents: direction === "IN" ? input.unitCost : undefined, originType: "MANUAL", idempotencyKey: input.idempotencyKey, reference: input.reference || null, notes: input.notes || null, occurredAt: input.occurredAt, preventNegativeStock }));
    await audit(scope, "MOVE", "InventoryItem", input.itemId, { movementId: entity.id, type: input.type, quantity: input.quantity });
    return { ok: true, id: entity.id, message: "Movimiento aplicado y stock actualizado." };
  }

  if (method === "POST" && resource === "purchases") {
    const input = parse(inventoryPurchaseSchema, body);
    const entity = await withSerializableTransaction(async (tx) => {
      const supplier = input.supplierId ? await tx.inventorySupplier.findFirst({ where: { id: input.supplierId, tenantId: scope.tenantId, branchId: scope.branchId, active: true } }) : null;
      if (input.supplierId && !supplier) throw new AppError("NOT_FOUND", 404, "Proveedor no disponible en esta sucursal.");
      const lines = await Promise.all(input.lines.map(async line => {
        if (!line.presentationId) return line;
        const presentation = await tx.inventoryPresentation.findFirst({ where: { id: line.presentationId, itemId: line.itemId, active: true, item: { tenantId: scope.tenantId, branchId: scope.branchId, active: true } } });
        if (!presentation) throw new AppError("INVALID_PRESENTATION", 400, "La presentación no pertenece al artículo de esta sede.");
        return { ...line, presentationName: presentation.name, presentationFactor: presentation.factor };
      }));
      return registerInventoryPurchase(tx, scope, { ...input, lines, supplierName: supplier?.name ?? input.supplierName });
    });
    await audit(scope, "CREATE", "InventoryPurchase", entity.id, { code: entity.code, totalCents: entity.totalCents });
    return { ok: true, id: entity.id, message: `Compra ${entity.code} registrada y stock actualizado.` };
  }

  if (method === "POST" && resource === "counts") {
    const input = parse(inventoryCountSchema, body);
    const entity = await withSerializableTransaction((tx) => registerInventoryCount(tx, scope, input, policies.onHandReservations?.(tx, scope)));
    await audit(scope, "CREATE", "InventoryCount", entity.id, { code: entity.code, lines: input.lines.length });
    return { ok: true, id: entity.id, message: `Conteo ${entity.code} aplicado al stock.` };
  }

  throw new AppError("NOT_FOUND", 404, "Operación de inventario no encontrada.");
}
