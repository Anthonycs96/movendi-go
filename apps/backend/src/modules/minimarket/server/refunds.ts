import { assertRetailCash } from "./cash-access";
import { queueRefundDocument } from "@/modules/invoicing/server/outbox";
import type { RefundFiscalLine } from "@/modules/invoicing/domain/partial-credit";
import { validateSalePayments } from "@/modules/sales/server/service";
import "server-only";
import type { z } from "zod";
import { AppError } from "@/core/auth/errors";
import type { TenantScope } from "@/core/auth/types";
import { applyInventoryMovement } from "@/modules/inventory/server/service";
import { applyCashEffect, registerCashMovement } from "@/modules/cash/server/service";
import { TransactionConflictError } from "@/core/database/transactions";
import { refundAmount, quantity, type Allocation } from "../domain/retail";
import { retailOperation, scoped, businessDate } from "./service";
import type { refundSchema } from "./schemas";

export function refundRetail(scope: TenantScope, saleId: string, input: z.infer<typeof refundSchema>) {
  return retailOperation(scope, "REFUND", { ...input, saleId }, async (tx, operationId) => {
    await assertRetailCash(tx, scope, input.cashSessionId);
    if (new Set(input.lines.map((line) => line.lineId)).size !== input.lines.length) throw new AppError("DUPLICATE_LINES", 400, "Hay líneas repetidas.");
    const sale = await tx.sale.findFirst({ where: { id: saleId, ...scoped(scope), retailSaleId: { not: null } }, include: { payments: true, retailSale: { include: { lines: true } } } });
    if (!sale?.retailSale) throw new AppError("NOT_FOUND", 404, "Venta no encontrada en esta sucursal.");
    const retail = sale.retailSale;
    const claimed = await tx.retailSale.updateMany({ where: { id: retail.id, ...scoped(scope), version: retail.version }, data: { version: { increment: 1 } } });
    if (claimed.count !== 1) throw new TransactionConflictError("La venta cambió durante la devolución.");
    const today = await businessDate(tx, scope);
    let totalCents = 0;
    const fiscalLines: RefundFiscalLine[] = [];
    for (const selected of input.lines) {
      const line = retail.lines.find((line) => line.id === selected.lineId);
      if (!line) throw new AppError("NOT_FOUND", 404, "La línea no pertenece a esta venta.");
      const presentation = await tx.retailPresentation.findFirst({ where: { id: line.presentationId, ...scoped(scope) } });
      if (!presentation || (!presentation.weighted && !Number.isInteger(selected.quantity))) throw new AppError("WHOLE_UNITS_REQUIRED", 400, "Esta presentación debe devolverse en cantidades enteras.");
      const baseQuantity = quantity(selected.quantity * line.factor);
      const result = refundAmount(line, selected.quantity);
      totalCents += result.amountCents;
      fiscalLines.push({ lineId: line.id, quantity: presentation.weighted ? baseQuantity : selected.quantity, refundedBefore: line.refundedCents, amountCents: result.amountCents });
      if (selected.restock) {
        // Return only the original allocation slice; damaged returns also advance the slice.
        const allocations = JSON.parse(line.allocations) as Allocation[];
        let skip = Math.round(line.returnedQuantity * line.factor * 1e6);
        let remaining = Math.round(selected.quantity * line.factor * 1e6);
        for (const allocation of allocations) {
          const units = Math.round(allocation.quantity * 1e6);
          const offset = Math.min(skip, units); skip -= offset;
          const take = Math.min(remaining, units - offset);
          if (take > 0) {
            const lot = await tx.retailLot.findFirst({ where: { id: allocation.lotId, product: { ...scoped(scope), itemId: line.itemId } } });
            if (!lot || lot.expiresOn < today) throw new AppError("EXPIRED_RETURN", 409, "El lote venció. Registra la devolución sin reponer stock vendible.");
            await tx.retailLot.update({ where: { id: lot.id }, data: { stock: (Math.round(lot.stock * 1e6) + take) / 1e6 } });
            remaining -= take;
          }
        }
        if (allocations.length && remaining !== 0) throw new AppError("RETURN_ALLOCATION_INVALID", 409, "No se pudo reconstruir el lote de origen.");
        await applyInventoryMovement(tx, scope, { itemId: line.itemId, type: "RETURN", direction: "IN", quantity: baseQuantity, unitCostCents: line.unitCostCents, originType: "RETAIL_REFUND", originId: retail.id, saleId: sale.id, notes: input.reason });
      }
      await tx.retailSaleLine.update({ where: { id: line.id }, data: { returnedQuantity: result.returnedQuantity, refundedCents: line.refundedCents + result.amountCents } });
    }
    const refunded = JSON.parse(retail.refundedPayments) as Array<{ method: string; amountCents: number }>;
    const allocation = validateSalePayments(totalCents, input.payments);
    for (const method of new Set(input.payments.map((p) => p.method))) {
      const paid = sale.payments.filter((p) => p.method === method).reduce((sum, p) => sum + p.amountCents, 0);
      const previous = refunded.filter((p) => p.method === method).reduce((sum, p) => sum + p.amountCents, 0);
      const requested = input.payments.filter((p) => p.method === method).reduce((sum, p) => sum + p.amountCents, 0);
      if (previous + requested > paid) throw new AppError("REFUND_METHOD_LIMIT", 409, "La devolución supera lo cobrado por uno de los métodos originales.");
    }
    if (allocation.cashCents > 0) await registerCashMovement(tx, scope, { cashSessionId: input.cashSessionId, type: "OUT", amountCents: allocation.cashCents, reason: `Devolución ${sale.code}`, notes: input.reason });
    else await applyCashEffect(tx, scope, input.cashSessionId, 0);
    refunded.push(...input.payments);
    await tx.retailSale.update({ where: { id: retail.id }, data: { refundedPayments: JSON.stringify(refunded) } });
    const pending = await tx.retailSaleLine.findMany({ where: { retailSaleId: retail.id } });
    const full = pending.every((line) => line.returnedQuantity === line.quantity);
    await tx.sale.update({ where: { id: sale.id }, data: { status: full ? "REFUNDED" : "PARTIALLY_REFUNDED" } });
    await queueRefundDocument(tx, scope, saleId, operationId, fiscalLines, input.reason);
    return { saleId, code: sale.code, totalCents, payments: input.payments, reason: input.reason, lines: input.lines, full };
  });
}
