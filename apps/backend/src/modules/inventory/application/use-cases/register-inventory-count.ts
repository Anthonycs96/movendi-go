import { InventoryError } from "../../domain/stock-movement";
import type { InventoryCountRepository, InventoryOnHandReservations } from "../ports/inventory-count-repository";
import type { InventoryRepository, InventoryScope } from "../ports/inventory-repository";
import { applyInventoryMovementUseCase } from "./apply-inventory-movement";

export type InventoryCountInput = {
  countedAt?: Date;
  notes?: string;
  idempotencyKey?: string;
  lines: Array<{ itemId: string; countedQuantity: number }>;
};

/** The caller owns one transaction for the document, lines and stock adjustments. */
export async function registerInventoryCountUseCase(
  counts: InventoryCountRepository,
  stock: InventoryRepository,
  reservations: InventoryOnHandReservations,
  scope: InventoryScope,
  input: InventoryCountInput,
  code: string,
) {
  if (!input.lines.length || input.lines.some((line) => !Number.isFinite(line.countedQuantity) || line.countedQuantity < 0)) {
    throw new InventoryError("INVALID_QUANTITY", "El conteo debe contener cantidades finitas no negativas.");
  }
  const itemIds = input.lines.map((line) => line.itemId);
  if (new Set(itemIds).size !== itemIds.length) throw new InventoryError("DUPLICATE_LINES", "El conteo contiene artículos repetidos.");
  if (input.idempotencyKey) {
    const existing = await counts.findByCode(code);
    if (existing) {
      // Preserve the existing contract: replay compares quantities, not notes/date.
      const matches = existing.lines.length === input.lines.length && input.lines.every((line) => existing.lines.some((stored) => stored.itemId === line.itemId && stored.countedQuantity === line.countedQuantity));
      if (!matches) throw new InventoryError("IDEMPOTENCY_CONFLICT", "Esta solicitud ya se utilizó para otro conteo.");
      return existing;
    }
  }
  const count = await counts.create({ code, notes: input.notes || null, countedAt: input.countedAt ?? new Date() });
  const reservedOnHand = await reservations.quantitiesFor(itemIds);
  for (const line of input.lines) {
    const item = await stock.findActiveItem(line.itemId);
    if (!item) throw new InventoryError("INVENTORY_ITEM_NOT_FOUND", "Uno de los artículos del conteo ya no existe.");
    const expectedQuantity = item.stock + (reservedOnHand.get(item.id) ?? 0);
    const difference = line.countedQuantity - expectedQuantity;
    await counts.recordLine(count.id, { itemId: item.id, expectedQuantity, countedQuantity: line.countedQuantity, difference });
    if (Math.abs(difference) > 1e-9) {
      const movement = await applyInventoryMovementUseCase(stock, scope, {
        itemId: item.id, type: "COUNT_ADJUSTMENT", direction: difference > 0 ? "IN" : "OUT", quantity: Math.abs(difference),
        originType: "COUNT", originId: count.id, countId: count.id,
        // The document already deduplicates requests within the branch. Its ID
        // keeps movement keys distinct when two branches use the same request key.
        idempotencyKey: `COUNT:${count.id}:${item.id}`, reference: code, notes: input.notes || null, occurredAt: input.countedAt,
      });
      if (movement.countId !== count.id) throw new InventoryError("IDEMPOTENCY_CONFLICT", "La clave del ajuste ya pertenece a otro conteo.");
    }
  }
  return count;
}
