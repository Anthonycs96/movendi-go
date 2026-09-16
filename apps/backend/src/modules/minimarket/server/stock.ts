import { hasPermission } from "@/core/auth/permissions";
import "server-only";
import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { AppError } from "@/core/auth/errors";
import type { TenantScope } from "@/core/auth/types";
import { applyInventoryMovement, registerInventoryPurchase } from "@/modules/inventory/server/service";
import { retailOperation, scoped, businessDate } from "./service";
import type { countSchema, purchaseSchema } from "./schemas";
import { money, quantity } from "../domain/retail";

export function receivePurchase(scope: TenantScope, input: z.infer<typeof purchaseSchema>) {
  return retailOperation(scope, "PURCHASE", input, async (tx) => {
    if (new Set(input.lines.map((line) => line.productId)).size !== input.lines.length) throw new AppError("DUPLICATE_LINES", 400, "Separa las recepciones con varios lotes del mismo producto.");
    const supplier = input.supplierId ? await tx.inventorySupplier.findFirst({ where: { id: input.supplierId, ...scoped(scope), active: true } }) : null;
    if (input.supplierId && !supplier) throw new AppError("NOT_FOUND", 404, "Proveedor no encontrado en esta sucursal.");
    if (input.credit && !hasPermission(scope.permissions, "minimarket:payables:write")) throw new AppError("FORBIDDEN", 403, "No tienes permiso para registrar cuentas por pagar.");
    if (input.credit && (!supplier || !input.dueOn)) throw new AppError("SUPPLIER_REQUIRED", 400, "Selecciona proveedor y vencimiento para la compra al crédito.");
    const today = await businessDate(tx, scope);
    const lines = [];
    for (const line of input.lines) {
      const product = await tx.retailProduct.findFirst({ where: { id: line.productId, ...scoped(scope), item: { active: true } }, include: { item: true } });
      if (!product) throw new AppError("NOT_FOUND", 404, "Producto no encontrado en esta sucursal.");
      if (product.item.unit === "UND" && !Number.isInteger(line.quantity)) throw new AppError("WHOLE_UNITS_REQUIRED", 400, "Recibe unidades enteras para este producto.");
      if (product.trackExpiry) {
        if (!line.lotCode || !line.expiresOn || line.expiresOn < today) throw new AppError("LOT_REQUIRED", 409, "Indica un lote y un vencimiento vigente.");
        const existing = await tx.retailLot.findUnique({ where: { productId_code: { productId: product.id, code: line.lotCode } } });
        if (existing && existing.expiresOn !== line.expiresOn) throw new AppError("LOT_CONFLICT", 409, "El lote ya tiene otra fecha de vencimiento.");
        const nextStock = quantity((Math.round((existing?.stock ?? 0) * 1e6) + Math.round(line.quantity * 1e6)) / 1e6);
        await tx.retailLot.upsert({ where: { productId_code: { productId: product.id, code: line.lotCode } }, create: { productId: product.id, code: line.lotCode, expiresOn: line.expiresOn, stock: nextStock }, update: { stock: nextStock } });
      } else if (line.lotCode || line.expiresOn) throw new AppError("LOT_NOT_ENABLED", 409, "Este producto no controla lotes.");
      money(Math.round(line.quantity * line.unitCostCents));
      lines.push({ itemId: product.itemId, quantity: line.quantity, unitCost: line.unitCostCents });
    }
    money(lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unitCost), 0));
    const purchase = await registerInventoryPurchase(tx, scope, { supplierName: supplier?.name ?? input.supplierName, documentNumber: input.documentNumber, notes: input.notes, lines });
    if (supplier) await tx.inventoryPurchase.update({ where: { id: purchase.id }, data: { supplierId: supplier.id } });
    if (input.credit) {
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: scope.tenantId }, select: { currency: true } });
      await tx.inventoryPayable.create({ data: { ...scoped(scope), supplierId: supplier!.id, purchaseId: purchase.id, currency: tenant.currency, totalCents: purchase.totalCents, dueOn: input.dueOn! } });
    }
    return { id: purchase.id, code: purchase.code, totalCents: purchase.totalCents };
  });
}

export function countStock(scope: TenantScope, input: z.infer<typeof countSchema>) {
  return retailOperation(scope, "COUNT", input, (tx) => countStockWithin(tx, scope, input));
}

async function countStockWithin(tx: Prisma.TransactionClient, scope: TenantScope, input: Omit<z.infer<typeof countSchema>, "idempotencyKey">, countId?: string) {
    if (input.countedStock > 0) quantity(input.countedStock);
    const product = await tx.retailProduct.findFirst({ where: { id: input.productId, ...scoped(scope), item: { active: true } }, include: { item: true } });
    if (!product) throw new AppError("NOT_FOUND", 404, "Producto no encontrado.");
    if (product.item.unit === "UND" && !Number.isInteger(input.countedStock)) throw new AppError("WHOLE_UNITS_REQUIRED", 400, "Cuenta unidades enteras para este producto.");
    const lot = input.lotId ? await tx.retailLot.findFirst({ where: { id: input.lotId, productId: product.id } }) : null;
    if (product.trackExpiry !== Boolean(lot)) throw new AppError("LOT_REQUIRED", 409, "Selecciona el lote correcto para contar este producto.");
    if (!product.trackExpiry && input.lotId) throw new AppError("LOT_NOT_ENABLED", 409, "Este producto no controla lotes.");
    const before = lot?.stock ?? product.item.stock;
    if (Math.abs(before - input.expectedStock) > 1e-9) throw new AppError("STOCK_CHANGED", 409, "El stock cambió. Actualiza antes de confirmar el conteo.");
    const delta = Math.round((input.countedStock - before) * 1e6) / 1e6;
    if (delta !== 0) await applyInventoryMovement(tx, scope, { itemId: product.itemId, type: "COUNT", direction: delta > 0 ? "IN" : "OUT", quantity: Math.abs(delta), originType: "RETAIL_COUNT", originId: countId, countId, notes: input.reason, preventNegativeStock: true });
    if (lot) await tx.retailLot.update({ where: { id: lot.id }, data: { stock: input.countedStock } });
    return { productId: product.id, lotId: lot?.id ?? null, before, after: input.countedStock, reason: input.reason };
}

export function countStockBatch(scope: TenantScope, input: { idempotencyKey: string; lines: Array<Omit<z.infer<typeof countSchema>, "idempotencyKey">> }) {
  return retailOperation(scope, "COUNT_BATCH", input, async (tx, operationId) => {
    const keys = input.lines.map((line) => line.productId + ":" + (line.lotId ?? ""));
    if (new Set(keys).size !== keys.length) throw new AppError("DUPLICATE_LINES", 400, "No repitas el mismo artículo/lote en el conteo.");
    const count = await tx.inventoryCount.create({ data: { ...scoped(scope), createdById: scope.actorId, code: "MC-" + operationId.slice(-20), notes: "Conteo confirmado desde Minimarket" } });
    for (const line of input.lines) {
      const result = await countStockWithin(tx, scope, line, count.id);
      const product = await tx.retailProduct.findFirstOrThrow({ where: { id: line.productId, ...scoped(scope) } });
      // Shared count summaries are unique per item; lot detail stays in the immutable operation/audit result.
      const difference = Math.round((result.after - result.before) * 1e6) / 1e6;
      await tx.inventoryCountLine.upsert({ where: { countId_itemId: { countId: count.id, itemId: product.itemId } }, create: { countId: count.id, itemId: product.itemId, expectedQuantity: result.before, countedQuantity: result.after, difference }, update: { expectedQuantity: { increment: result.before }, countedQuantity: { increment: result.after }, difference: { increment: difference } } });
    }
    return { id: count.id, code: count.code, lines: input.lines };
  });
}
