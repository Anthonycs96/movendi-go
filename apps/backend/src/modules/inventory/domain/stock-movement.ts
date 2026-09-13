export type InventoryErrorCode = "INVALID_QUANTITY" | "INVALID_PURCHASE" | "DUPLICATE_LINES" | "INVENTORY_ITEM_NOT_FOUND" | "STOCK_NOT_TRACKED" | "INSUFFICIENT_STOCK" | "IDEMPOTENCY_CONFLICT";

export class InventoryError extends Error {
  constructor(public readonly code: InventoryErrorCode, message: string) {
    super(message);
    this.name = "InventoryError";
  }
}

export type StockState = {
  name: string;
  unit: string;
  stock: number;
  unitCostCents: number;
  trackStock: boolean;
};

export type StockMovement = {
  direction: "IN" | "OUT";
  quantity: number;
  unitCostCents?: number;
  preventNegativeStock?: boolean;
};

export function normalizeMovementQuantity(value: number): number {
  if (!Number.isFinite(value) || value <= 0) throw new InventoryError("INVALID_QUANTITY", "La cantidad del movimiento debe ser mayor que cero.");
  const quantity = Math.round(value * 1_000_000) / 1_000_000;
  if (quantity <= 0) throw new InventoryError("INVALID_QUANTITY", "La cantidad es menor que la precisión admitida.");
  return quantity;
}

/** Calculate balances and valuation without mutating the item or doing I/O. */
export function calculateStockMovement(item: StockState, input: StockMovement) {
  const quantity = normalizeMovementQuantity(input.quantity);
  if (!item.trackStock) throw new InventoryError("STOCK_NOT_TRACKED", "Este artículo no controla existencias.");
  const stockBefore = item.stock;
  const stockAfter = Math.round((input.direction === "IN" ? stockBefore + quantity : stockBefore - quantity) * 1_000_000) / 1_000_000;
  if (stockAfter < -1e-9 && input.preventNegativeStock !== false) throw new InventoryError("INSUFFICIENT_STOCK", `${item.name} no tiene stock suficiente. Disponible: ${item.stock} ${item.unit}.`);
  const unitCostCents = input.unitCostCents ?? item.unitCostCents;
  const nextUnitCostCents = input.direction === "IN" && input.unitCostCents !== undefined && stockAfter > 0
    ? Math.round(((Math.max(0, stockBefore) * item.unitCostCents) + (quantity * input.unitCostCents)) / stockAfter)
    : item.unitCostCents;
  return { quantity, stockBefore, stockAfter, unitCostCents, totalCostCents: Math.round(quantity * unitCostCents), nextUnitCostCents };
}
