import "server-only";
import type { Prisma } from "@prisma/client";
import { AppError } from "@/core/auth/errors";
import type { TenantScope } from "@/core/auth/types";
import { applyInventoryMovement } from "@/modules/inventory/server/service";

export async function consumeRestaurantSaleInventory(transaction: Prisma.TransactionClient, scope: TenantScope, orderId: string, saleId: string, preventNegativeStock = true, consumeLegacy = true) {
  const snapshots = await transaction.orderItem.findMany({ where: { orderId, tenantId: scope.tenantId, status: { not: "CANCELLED" } }, select: { recipeSnapshot: true } });
  if (snapshots.length && snapshots.every((line) => line.recipeSnapshot !== null)) {
    const result = await transaction.inventoryMovement.updateMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId, orderId, type: "ORDER_RESERVATION" }, data: { type: "SALE_CONSUMPTION", saleId } });
    return result.count;
  }
  if (!consumeLegacy) return 0;
  const order = await transaction.restaurantOrder.findFirst({
    where: { id: orderId, tenantId: scope.tenantId, branchId: scope.branchId },
    select: { code: true, items: { where: { status: { not: "CANCELLED" } }, select: { quantity: true, product: { select: { recipe: { select: { active: true, yieldQuantity: true, ingredients: { select: { itemId: true, quantity: true, wastePercent: true } } } } } } } } },
  });
  if (!order) throw new AppError("ORDER_NOT_FOUND", 404, "El pedido no existe para descontar inventario.");
  const totals = new Map<string, number>();
  for (const line of order.items) {
    const recipe = line.product.recipe;
    if (!recipe?.active) continue;
    for (const ingredient of recipe.ingredients) {
      const quantity = (ingredient.quantity * line.quantity / recipe.yieldQuantity) * (1 + ingredient.wastePercent / 100);
      totals.set(ingredient.itemId, (totals.get(ingredient.itemId) ?? 0) + quantity);
    }
  }
  for (const [itemId, quantity] of totals) {
    await applyInventoryMovement(transaction, scope, { itemId, type: "SALE_CONSUMPTION", direction: "OUT", quantity, originType: "SALE", originId: saleId, idempotencyKey: `SALE:${saleId}:ITEM:${itemId}`, orderId, saleId, reference: order.code, preventNegativeStock });
  }
  return totals.size;
}

export async function reverseRestaurantSaleInventory(transaction: Prisma.TransactionClient, scope: TenantScope, saleId: string, reason: string) {
  const movements = await transaction.inventoryMovement.findMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId, saleId, type: "SALE_CONSUMPTION", direction: "OUT" } });
  if (!movements.length) throw new AppError("SALE_WITHOUT_INVENTORY", 409, "La venta no tiene consumos de inventario para devolver.");
  for (const movement of movements) {
    await applyInventoryMovement(transaction, scope, { itemId: movement.itemId, type: "SALE_RETURN", direction: "IN", quantity: movement.quantity, unitCostCents: movement.unitCostCents, originType: "SALE_RETURN", originId: saleId, idempotencyKey: `SALE_RETURN:${saleId}:${movement.id}`, orderId: movement.orderId, saleId, reference: movement.reference, notes: reason });
  }
  return movements.length;
}
