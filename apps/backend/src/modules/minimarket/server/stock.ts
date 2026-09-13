import "server-only";
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
    const purchase = await registerInventoryPurchase(tx, scope, { supplierName: input.supplierName, documentNumber: input.documentNumber, notes: input.notes, lines });
    return { id: purchase.id, code: purchase.code, totalCents: purchase.totalCents };
  });
}

export function countStock(scope: TenantScope, input: z.infer<typeof countSchema>) {
  return retailOperation(scope, "COUNT", input, async (tx) => {
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
    if (delta !== 0) await applyInventoryMovement(tx, scope, { itemId: product.itemId, type: "COUNT", direction: delta > 0 ? "IN" : "OUT", quantity: Math.abs(delta), originType: "RETAIL_COUNT", notes: input.reason, preventNegativeStock: true });
    if (lot) await tx.retailLot.update({ where: { id: lot.id }, data: { stock: input.countedStock } });
    return { productId: product.id, lotId: lot?.id ?? null, before, after: input.countedStock, reason: input.reason };
  });
}
