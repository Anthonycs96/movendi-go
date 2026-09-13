import type { StockState } from "../../domain/stock-movement";

export type InventoryScope = { tenantId: string; branchId: string; actorId: string };
export type InventoryStockItem = StockState & { id: string; branchId: string | null };

export type InventoryMovementRecord = {
  id: string;
  tenantId: string;
  branchId: string | null;
  itemId: string;
  actorId: string | null;
  type: string;
  direction: string;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  unitCostCents: number;
  totalCostCents: number;
  originType: string;
  originId: string | null;
  idempotencyKey: string | null;
  orderId: string | null;
  saleId: string | null;
  purchaseId: string | null;
  countId: string | null;
  reference: string | null;
  notes: string | null;
  occurredAt: Date;
  createdAt: Date;
};

export type InventoryMovementDraft = Omit<InventoryMovementRecord, "id" | "createdAt" | "tenantId" | "branchId" | "actorId">;

/** Implementations must bind every operation to the same scope and transaction. */
export interface InventoryRepository {
  findMovementByKey(key: string): Promise<InventoryMovementRecord | null>;
  findActiveItem(itemId: string): Promise<InventoryStockItem | null>;
  updateStockIfUnchanged(item: InventoryStockItem, stockAfter: number, unitCostCents: number): Promise<boolean>;
  recordMovement(movement: InventoryMovementDraft): Promise<InventoryMovementRecord>;
}

/** Signals that the caller must retry the complete transaction, not one write. */
export class InventoryConcurrencyError extends Error {
  constructor() {
    super("El inventario cambió mientras se procesaba la operación.");
    this.name = "InventoryConcurrencyError";
  }
}
