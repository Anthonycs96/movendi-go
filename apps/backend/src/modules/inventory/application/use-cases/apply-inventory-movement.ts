import { calculateStockMovement, InventoryError, normalizeMovementQuantity } from "../../domain/stock-movement";
import { InventoryConcurrencyError, type InventoryRepository, type InventoryScope } from "../ports/inventory-repository";

export type InventoryMovementInput = {
  itemId: string;
  type: string;
  direction: "IN" | "OUT";
  quantity: number;
  unitCostCents?: number;
  originType: string;
  originId?: string | null;
  idempotencyKey?: string | null;
  orderId?: string | null;
  saleId?: string | null;
  purchaseId?: string | null;
  countId?: string | null;
  reference?: string | null;
  notes?: string | null;
  occurredAt?: Date;
  preventNegativeStock?: boolean;
};

/** The caller owns the transaction; this use case never commits independently. */
export async function applyInventoryMovementUseCase(repository: InventoryRepository, scope: InventoryScope, input: InventoryMovementInput) {
  const quantity = normalizeMovementQuantity(input.quantity);
  if (input.idempotencyKey) {
    const existing = await repository.findMovementByKey(input.idempotencyKey);
    if (existing) {
      if (existing.branchId !== scope.branchId || existing.itemId !== input.itemId || existing.type !== input.type || existing.direction !== input.direction || Math.abs(existing.quantity - quantity) > 1e-9) {
        throw new InventoryError("IDEMPOTENCY_CONFLICT", "Esta solicitud ya se utilizó para otro movimiento de inventario.");
      }
      return existing;
    }
  }
  const item = await repository.findActiveItem(input.itemId);
  if (!item) throw new InventoryError("INVENTORY_ITEM_NOT_FOUND", "El producto o insumo no existe en esta sede.");
  const calculation = calculateStockMovement(item, { ...input, quantity });
  const { nextUnitCostCents, ...movement } = calculation;
  if (!await repository.updateStockIfUnchanged(item, movement.stockAfter, nextUnitCostCents)) throw new InventoryConcurrencyError();
  return repository.recordMovement({
    itemId: item.id, type: input.type, direction: input.direction, ...movement,
    originType: input.originType, originId: input.originId ?? null, idempotencyKey: input.idempotencyKey ?? null,
    orderId: input.orderId ?? null, saleId: input.saleId ?? null, purchaseId: input.purchaseId ?? null, countId: input.countId ?? null,
    reference: input.reference ?? null, notes: input.notes ?? null, occurredAt: input.occurredAt ?? new Date(),
  });
}
