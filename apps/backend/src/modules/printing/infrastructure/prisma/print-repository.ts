import type { Prisma } from "@prisma/client";
import type { PrintRepository } from "../../application/change-delivery";
import type { PrintState, PrintChange } from "../../domain/delivery";

export type PrintScope = { tenantId: string; branchId: string; actorId?: string; printerId?: string };
export class PrismaPrintRepository implements PrintRepository {
  constructor(private readonly tx: Prisma.TransactionClient, private readonly scope: PrintScope) {}
  private where() { return { tenantId: this.scope.tenantId, branchId: this.scope.branchId, ...(this.scope.printerId ? { printerId: this.scope.printerId } : {}) }; }
  find(id: string) { return this.tx.restaurantPrintJob.findFirst({ where: { id, ...this.where() } }); }
  async save(before: PrintState, change: PrintChange, action: string) {
    const changed = await this.tx.restaurantPrintJob.updateMany({ where: { id: before.id, ...this.where(), status: before.status, attempts: before.attempts, deliveryAttempt: before.deliveryAttempt, stationId: before.stationId, leaseExpiresAt: before.leaseExpiresAt }, data: change });
    if (!changed.count) return false;
    await this.tx.auditLog.create({ data: { tenantId: this.scope.tenantId, branchId: this.scope.branchId, userId: this.scope.actorId, entityType: "RestaurantPrintJob", entityId: before.id, action, metadata: JSON.stringify({ attempt: change.attempts ?? before.attempts, status: change.status, printerId: this.scope.printerId }) } });
    return true;
  }
}
