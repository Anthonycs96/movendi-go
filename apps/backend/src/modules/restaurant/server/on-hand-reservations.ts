import "server-only";
import type { Prisma } from "@prisma/client";
import type { InventoryOnHandReservations, InventoryScope } from "@/modules/inventory/public";

/** Restaurant preparation states stay outside the inventory application. */
export class RestaurantOnHandReservations implements InventoryOnHandReservations {
  constructor(private readonly transaction: Prisma.TransactionClient, private readonly scope: InventoryScope) {}

  async quantitiesFor(itemIds: string[]) {
    const reservations = await this.transaction.inventoryMovement.findMany({
      where: { tenantId: this.scope.tenantId, branchId: this.scope.branchId, itemId: { in: itemIds }, type: "ORDER_RESERVATION" },
      select: { itemId: true, originId: true, quantity: true },
    });
    const unprepared = new Set((await this.transaction.orderItem.findMany({
      where: { tenantId: this.scope.tenantId, order: { branchId: this.scope.branchId }, id: { in: reservations.flatMap((movement) => movement.originId ? [movement.originId] : []) }, status: { in: ["PENDING", "HELD"] } },
      select: { id: true },
    })).map((line) => line.id));
    const quantities = new Map<string, number>();
    for (const movement of reservations) if (movement.originId && unprepared.has(movement.originId)) quantities.set(movement.itemId, (quantities.get(movement.itemId) ?? 0) + movement.quantity);
    return quantities;
  }
}
