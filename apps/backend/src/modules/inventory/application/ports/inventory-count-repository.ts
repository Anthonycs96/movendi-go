export type InventoryCountLine = {
  itemId: string;
  expectedQuantity: number;
  countedQuantity: number;
  difference: number;
};

export type InventoryCountDraft = { code: string; notes: string | null; countedAt: Date };
export type InventoryCountRecord = InventoryCountDraft & {
  id: string; tenantId: string; branchId: string; createdById: string; status: string; createdAt: Date;
};

/** All operations share the scope and transaction of the stock repository. */
export interface InventoryCountRepository {
  findByCode(code: string): Promise<(InventoryCountRecord & { lines: InventoryCountLine[] }) | null>;
  create(count: InventoryCountDraft): Promise<InventoryCountRecord>;
  recordLine(countId: string, line: InventoryCountLine): Promise<void>;
}

/** Reserved quantities still physically present, already excluded from available stock. */
export interface InventoryOnHandReservations {
  quantitiesFor(itemIds: string[]): Promise<ReadonlyMap<string, number>>;
}
