export type InventoryPurchaseLine = { itemId: string; quantity: number; unitCostCents: number; totalCents: number };

export type InventoryPurchaseDraft = {
  supplierId?: string | null;
  code: string;
  supplierName: string;
  documentNumber: string | null;
  totalCents: number;
  notes: string | null;
  purchasedAt: Date;
  lines: InventoryPurchaseLine[];
};

export type InventoryPurchaseRecord = InventoryPurchaseDraft & {
  id: string;
  tenantId: string;
  branchId: string;
  createdById: string;
  status: string;
  createdAt: Date;
};

/** Bound to the same tenant and transaction as the movement repository. */
export interface InventoryPurchaseRepository {
  findByMovementKey(key: string): Promise<InventoryPurchaseRecord | null>;
  create(purchase: InventoryPurchaseDraft): Promise<InventoryPurchaseRecord>;
}
