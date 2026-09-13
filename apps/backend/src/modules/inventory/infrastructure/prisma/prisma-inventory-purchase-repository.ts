import "server-only";
import type { Prisma } from "@prisma/client";
import type { InventoryPurchaseDraft, InventoryPurchaseRepository } from "../../application/ports/inventory-purchase-repository";
import type { InventoryScope } from "../../application/ports/inventory-repository";

export class PrismaInventoryPurchaseRepository implements InventoryPurchaseRepository {
  constructor(private readonly transaction: Prisma.TransactionClient, private readonly scope: InventoryScope) {}

  async findByMovementKey(key: string) {
    // Tenant-wide keys: a replay from another branch must produce a conflict.
    const movement = await this.transaction.inventoryMovement.findFirst({
      where: { tenantId: this.scope.tenantId, idempotencyKey: key }, select: { purchaseId: true },
    });
    if (!movement?.purchaseId) return null;
    return this.transaction.inventoryPurchase.findFirst({
      where: { id: movement.purchaseId, tenantId: this.scope.tenantId }, include: { lines: true },
    });
  }

  create({ lines, ...purchase }: InventoryPurchaseDraft) {
    return this.transaction.inventoryPurchase.create({
      data: { ...purchase, tenantId: this.scope.tenantId, branchId: this.scope.branchId, createdById: this.scope.actorId, lines: { create: lines } },
      include: { lines: true },
    });
  }
}
