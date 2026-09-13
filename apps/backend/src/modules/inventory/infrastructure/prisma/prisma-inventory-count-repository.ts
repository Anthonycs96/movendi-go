import "server-only";
import type { Prisma } from "@prisma/client";
import type { InventoryCountDraft, InventoryCountLine, InventoryCountRepository } from "../../application/ports/inventory-count-repository";
import type { InventoryScope } from "../../application/ports/inventory-repository";

export class PrismaInventoryCountRepository implements InventoryCountRepository {
  constructor(private readonly transaction: Prisma.TransactionClient, private readonly scope: InventoryScope) {}

  findByCode(code: string) {
    return this.transaction.inventoryCount.findFirst({ where: { tenantId: this.scope.tenantId, branchId: this.scope.branchId, code }, include: { lines: true } });
  }

  create(count: InventoryCountDraft) {
    return this.transaction.inventoryCount.create({ data: { ...count, tenantId: this.scope.tenantId, branchId: this.scope.branchId, createdById: this.scope.actorId } });
  }

  async recordLine(countId: string, line: InventoryCountLine) {
    await this.transaction.inventoryCountLine.create({ data: { ...line, countId } });
  }
}
