import "server-only";
import type { Prisma } from "@prisma/client";
import type { InventoryMovementDraft, InventoryRepository, InventoryScope, InventoryStockItem } from "../../application/ports/inventory-repository";

export class PrismaInventoryRepository implements InventoryRepository {
  constructor(private readonly transaction: Prisma.TransactionClient, private readonly scope: InventoryScope) {}

  findMovementByKey(key: string) {
    // Search across the tenant so a key reused by another branch remains a conflict.
    return this.transaction.inventoryMovement.findFirst({ where: { tenantId: this.scope.tenantId, idempotencyKey: key } });
  }

  findActiveItem(itemId: string) {
    return this.transaction.inventoryItem.findFirst({ where: {
      id: itemId, tenantId: this.scope.tenantId, OR: [{ branchId: this.scope.branchId }, { branchId: null }], active: true,
    } });
  }

  async updateStockIfUnchanged(item: InventoryStockItem, stockAfter: number, unitCostCents: number) {
    const updated = await this.transaction.inventoryItem.updateMany({
      where: { id: item.id, tenantId: this.scope.tenantId, stock: item.stock },
      data: { stock: stockAfter, unitCostCents, branchId: item.branchId ?? this.scope.branchId },
    });
    return updated.count === 1;
  }

  recordMovement(movement: InventoryMovementDraft) {
    return this.transaction.inventoryMovement.create({ data: {
      ...movement, tenantId: this.scope.tenantId, branchId: this.scope.branchId, actorId: this.scope.actorId,
    } });
  }
}
