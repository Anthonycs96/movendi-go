import "server-only";
import { z } from "zod";
import type { TenantScope } from "@/core/auth/types";
import { AppError } from "@/core/auth/errors";
import { applyInventoryMovement } from "@/modules/inventory/server/service";
import { retailOperation, scoped, businessDate } from "./service";
import { allocateLots, lineAmounts, quantity } from "../domain/retail";
import { key, amount } from "./schemas";

export const transferSchema = z.object({ idempotencyKey: key, destinationBranchId: z.string().min(1), notes: z.string().trim().max(500).optional(), lines: z.array(z.object({ presentationId: z.string().min(1), quantity: amount })).min(1).max(100) });
type TransferLine = { presentationId: string; sourceProductId: string; destinationProductId: string; name: string; sku: string; quantity: number; factor: number; baseQuantity: number; unitCostCents: number; lots: Array<{ code: string; expiresOn: string; quantity: number }> };
const invalid = (message: string) => new AppError("TRANSFER_INVALID", 409, message);

export function createTransfer(scope: TenantScope, input: z.infer<typeof transferSchema>) {
  return retailOperation(scope, "TRANSFER_CREATE", input, async (tx) => {
    if (input.destinationBranchId === scope.branchId) throw invalid("Selecciona otra sucursal de este negocio.");
    const destination = await tx.branch.findFirst({ where: { id: input.destinationBranchId, tenantId: scope.tenantId, active: true } });
    if (!destination) throw new AppError("NOT_FOUND", 404, "Sucursal destino no encontrada.");
    if (new Set(input.lines.map((l) => l.presentationId)).size !== input.lines.length) throw invalid("Combina las cantidades de las presentaciones repetidas.");
    const lines: TransferLine[] = [];
    for (const line of input.lines) {
      const presentation = await tx.retailPresentation.findFirst({ where: { id: line.presentationId, ...scoped(scope), active: true, product: { ...scoped(scope), item: { active: true } } }, include: { product: { include: { item: true } } } });
      if (!presentation) throw new AppError("NOT_FOUND", 404, "Presentación no encontrada en la sucursal de origen.");
      const source = presentation.product;
      const dest = await tx.retailProduct.findFirst({ where: { tenantId: scope.tenantId, branchId: destination.id, item: { sku: source.item.sku, active: true } }, include: { item: true } });
      if (!dest || dest.item.unit !== source.item.unit || dest.trackExpiry !== source.trackExpiry) throw invalid(`Prepara ${source.item.sku} en ${destination.name} con la misma unidad y control de lotes antes de transferir.`);
      lines.push({ presentationId: presentation.id, sourceProductId: source.id, destinationProductId: dest.id, name: `${source.item.name} · ${presentation.name}`, sku: source.item.sku, quantity: line.quantity, factor: presentation.factor, baseQuantity: lineAmounts(presentation, line.quantity).baseQuantity, unitCostCents: 0, lots: [] });
    }
    const transfer = await tx.retailTransfer.create({ data: { tenantId: scope.tenantId, sourceBranchId: scope.branchId, destinationBranchId: destination.id, createdById: scope.actorId, lines: JSON.stringify(lines), notes: input.notes } });
    return { id: transfer.id, status: transfer.status };
  });
}

export function transitionTransfer(scope: TenantScope, id: string, action: "dispatch" | "receive" | "cancel", input: { idempotencyKey: string }) {
  return retailOperation(scope, `TRANSFER_${action.toUpperCase()}`, { ...input, id }, async (tx) => {
    const transfer = await tx.retailTransfer.findFirst({ where: { id, tenantId: scope.tenantId, ...(action === "receive" ? { destinationBranchId: scope.branchId } : { sourceBranchId: scope.branchId }) } });
    if (!transfer) throw new AppError("NOT_FOUND", 404, "Transferencia no encontrada en esta sucursal.");
    const expected = action === "receive" ? "DISPATCHED" : "DRAFT";
    if (transfer.status !== expected) throw invalid(action === "cancel" ? "Solo se cancela un borrador. Recibe una transferencia despachada antes de organizar su devolución." : "La transferencia ya cambió de estado. Actualiza la pantalla.");
    const today = await businessDate(tx, scope), lines = JSON.parse(transfer.lines) as TransferLine[];
    if (action === "dispatch") {
      for (const line of lines) {
        const product = await tx.retailProduct.findFirst({ where: { id: line.sourceProductId, ...scoped(scope), item: { active: true } }, include: { item: true, lots: true } });
        if (!product) throw invalid("Uno de los productos de origen está inactivo.");
        line.unitCostCents = product.item.unitCostCents;
        if (product.trackExpiry) {
          const allocations = allocateLots(product.lots, line.baseQuantity, today);
          for (const allocation of allocations) {
            const lot = product.lots.find((l) => l.id === allocation.lotId)!;
            await tx.retailLot.update({ where: { id: lot.id }, data: { stock: Math.round((lot.stock - allocation.quantity) * 1e6) / 1e6 } });
            line.lots.push({ code: lot.code, expiresOn: lot.expiresOn, quantity: allocation.quantity });
          }
        }
        await applyInventoryMovement(tx, scope, { itemId: product.itemId, type: "TRANSFER", direction: "OUT", quantity: line.baseQuantity, originType: "RETAIL_TRANSFER", originId: id, reference: id, preventNegativeStock: true });
      }
    }
    if (action === "receive") {
      for (const line of lines) {
        const product = await tx.retailProduct.findFirst({ where: { id: line.destinationProductId, ...scoped(scope), item: { active: true } }, include: { item: true } });
        if (!product) throw invalid("Activa los productos del destino antes de recibir.");
        for (const allocation of line.lots) {
          const where = { productId_code: { productId: product.id, code: allocation.code } };
          const lot = await tx.retailLot.findUnique({ where });
          if (lot && lot.expiresOn !== allocation.expiresOn) throw invalid(`El lote ${allocation.code} tiene un vencimiento diferente en destino.`);
          // Expired-in-transit goods retain their expiry; FEFO prevents their sale.
          await tx.retailLot.upsert({ where, create: { productId: product.id, code: allocation.code, expiresOn: allocation.expiresOn, stock: allocation.quantity }, update: { stock: quantity((lot?.stock ?? 0) + allocation.quantity) } });
        }
        await applyInventoryMovement(tx, scope, { itemId: product.itemId, type: "TRANSFER", direction: "IN", quantity: line.baseQuantity, unitCostCents: line.unitCostCents, originType: "RETAIL_TRANSFER", originId: id, reference: id });
      }
    }
    const status = action === "dispatch" ? "DISPATCHED" : action === "receive" ? "RECEIVED" : "CANCELLED";
    await tx.retailTransfer.update({ where: { id }, data: { status, lines: JSON.stringify(lines), ...(action === "dispatch" ? { dispatchedAt: new Date(), dispatchedById: scope.actorId } : action === "receive" ? { receivedAt: new Date(), receivedById: scope.actorId } : {}) } });
    return { id, status };
  });
}
