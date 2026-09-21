import { InventoryError, normalizeMovementQuantity } from "../../domain/stock-movement";
import type { InventoryPurchaseRepository } from "../ports/inventory-purchase-repository";
import type { InventoryRepository, InventoryScope } from "../ports/inventory-repository";
import { applyInventoryMovementUseCase } from "./apply-inventory-movement";

export type InventoryPurchaseInput = {
  supplierId?: string;
  supplierName: string;
  documentNumber?: string;
  purchasedAt?: Date;
  notes?: string;
  idempotencyKey?: string;
  /** Costs are already in cents, converted at the HTTP boundary. */
  lines: Array<{ itemId: string; quantity: number; unitCost: number }>;
};

/** Purchase, lines and stock must commit or roll back in the caller's transaction. */
export async function registerInventoryPurchaseUseCase(
  purchases: InventoryPurchaseRepository,
  movements: InventoryRepository,
  scope: InventoryScope,
  input: InventoryPurchaseInput,
  createCode: () => string,
) {
  if (!input.lines.length) throw new InventoryError("INVALID_PURCHASE", "La compra debe contener artículos.");
  if (new Set(input.lines.map((line) => line.itemId)).size !== input.lines.length) {
    throw new InventoryError("DUPLICATE_LINES", "La compra contiene artículos repetidos.");
  }
  const lines = input.lines.map((line) => {
    normalizeMovementQuantity(line.quantity);
    if (!Number.isSafeInteger(line.unitCost) || line.unitCost < 0) throw new InventoryError("INVALID_PURCHASE", "El costo debe ser un entero no negativo en céntimos.");
    return { itemId: line.itemId, quantity: line.quantity, unitCostCents: line.unitCost, totalCents: Math.round(line.quantity * line.unitCost) };
  });
  if (input.idempotencyKey) {
    const existing = await purchases.findByMovementKey(`PURCHASE:${input.idempotencyKey}:0`);
    if (existing) {
      const matches = existing.branchId === scope.branchId
        && (existing.supplierId ?? null) === (input.supplierId ?? null)
        && existing.supplierName === input.supplierName
        && existing.documentNumber === (input.documentNumber || null)
        && existing.notes === (input.notes || null)
        && (!input.purchasedAt || existing.purchasedAt.getTime() === input.purchasedAt.getTime())
        && existing.lines.length === lines.length
        && lines.every((line) => existing.lines.some((stored) => stored.itemId === line.itemId && stored.quantity === line.quantity && stored.unitCostCents === line.unitCostCents));
      if (!matches) throw new InventoryError("IDEMPOTENCY_CONFLICT", "Esta solicitud ya se utilizó para otra compra de inventario.");
      return existing;
    }
  }
  const code = createCode();
  const purchase = await purchases.create({
    supplierId: input.supplierId ?? null,
    code, supplierName: input.supplierName, documentNumber: input.documentNumber || null,
    totalCents: lines.reduce((sum, line) => sum + line.totalCents, 0),
    notes: input.notes || null, purchasedAt: input.purchasedAt ?? new Date(), lines,
  });
  for (const [index, line] of input.lines.entries()) {
    const movement = await applyInventoryMovementUseCase(movements, scope, {
      itemId: line.itemId, type: "PURCHASE", direction: "IN", quantity: line.quantity, unitCostCents: line.unitCost,
      originType: "PURCHASE", originId: purchase.id, purchaseId: purchase.id,
      idempotencyKey: input.idempotencyKey ? `PURCHASE:${input.idempotencyKey}:${index}` : `PURCHASE:${purchase.id}:${line.itemId}`,
      reference: input.documentNumber || code, notes: input.notes || null, occurredAt: input.purchasedAt,
    });
    if (movement.purchaseId !== purchase.id) throw new InventoryError("IDEMPOTENCY_CONFLICT", "La clave de una línea ya pertenece a otra operación de inventario.");
  }
  return purchase;
}
