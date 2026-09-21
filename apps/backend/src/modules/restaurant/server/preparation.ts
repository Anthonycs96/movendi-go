import "server-only";
import type { Prisma } from "@prisma/client";
import type { TenantScope } from "@/core/auth/types";
import { AppError } from "@/core/auth/errors";
import { applyInventoryMovement } from "@/modules/inventory/server/service";

// Snapshots are written inside the order transaction, before any kitchen work.
export async function reserveOrderIngredients(tx: Prisma.TransactionClient, scope: TenantScope, orderId: string, reserve: boolean, preventNegativeStock: boolean) {
  const lines = await tx.orderItem.findMany({ where: { orderId, tenantId: scope.tenantId, recipeSnapshot: null }, include: { product: { include: { inventoryItem: true, preparationArea: true, category: { include: { preparationArea: true } }, recipe: { include: { ingredients: { include: { item: { select: { unitCostCents: true } } } } } } } }, parentProduct: { include: { preparationArea: true, category: { include: { preparationArea: true } } } } } });
  for (const line of lines) {
    const routed = line.product.areaAssignmentMode === "INHERIT_FROM_PRODUCT" && line.parentProduct ? line.parentProduct : line.product;
    const area = routed.preparationArea ?? routed.category.preparationArea;
    const recipe = line.product.recipe;
    // Freeze recipe cost at order time. Later purchases must not rewrite historical margins.
    const direct = line.product.stockMode === "RESALE" ? line.product.inventoryItem : null;
    if (line.product.stockMode === "RESALE" && (!direct || !direct.active || direct.tenantId !== scope.tenantId || direct.branchId !== scope.branchId)) throw new AppError("INVALID_STOCK_LINK", 409, "El artículo de reventa no está disponible en esta sede.");
    const unitCostCents = direct ? direct.unitCostCents : line.product.stockMode === "RECIPE" && recipe?.active && recipe.ingredients.length
      ? Math.round(recipe.ingredients.reduce((sum, ingredient) => sum + ingredient.quantity * (1 + ingredient.wastePercent / 100) * ingredient.item.unitCostCents, 0) / recipe.yieldQuantity)
      : line.product.costCents;
    const ingredients = direct?.trackStock ? [{ itemId: direct.id, quantity: line.quantity }] : reserve && line.product.stockMode === "RECIPE" && recipe?.active ? recipe.ingredients.map((ingredient) => ({ itemId: ingredient.itemId, quantity: Math.round(ingredient.quantity * line.quantity / recipe.yieldQuantity * (1 + ingredient.wastePercent / 100) * 1e6) / 1e6 })) : [];
    await tx.orderItem.update({ where: { id: line.id }, data: { stockModeSnapshot: line.product.stockMode, unitCostCents, taxCategory: line.product.taxCategory, preparationAreaKey: area?.id ?? routed.kitchenArea ?? "GENERAL", preparationAreaName: area?.name ?? routed.kitchenArea ?? "General", recipeSnapshot: JSON.stringify(ingredients) } });
    for (const ingredient of ingredients) {
      await applyInventoryMovement(tx, scope, { ...ingredient, type: "ORDER_RESERVATION", direction: "OUT", originType: "ORDER_ITEM", originId: line.id, orderId, idempotencyKey: `RESERVE:${line.id}:${ingredient.itemId}`, preventNegativeStock, notes: `Reserva para ${line.name}` });
    }
  }
}

export async function cancelOrderIngredients(tx: Prisma.TransactionClient, scope: TenantScope, orderId: string, reason: string) {
  const lines = await tx.orderItem.findMany({ where: { orderId, tenantId: scope.tenantId }, select: { id: true, status: true } });
  const prepared = new Set(lines.filter((line) => ["PREPARING", "READY", "SERVED"].includes(line.status)).map((line) => line.id));
  const reservations = await tx.inventoryMovement.findMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId, orderId, type: "ORDER_RESERVATION" } });
  for (const movement of reservations) {
    if (prepared.has(movement.originId ?? "")) {
      await tx.inventoryMovement.update({ where: { id: movement.id }, data: { type: "WASTE", notes: reason } });
    } else {
      await applyInventoryMovement(tx, scope, { itemId: movement.itemId, quantity: movement.quantity, unitCostCents: movement.unitCostCents, direction: "IN", type: "RESERVATION_RELEASE", originType: "ORDER", originId: orderId, orderId, idempotencyKey: `RELEASE:${movement.id}`, notes: reason });
      await tx.inventoryMovement.update({ where: { id: movement.id }, data: { type: "RELEASED_RESERVATION" } });
    }
  }
}

export { aggregatePreparationStatus } from "../domain/preparation-transition";

export function assertDiscountLimit(subtotal: number, discount: number, maximumPct: number) {
  if (discount > Math.round(subtotal * maximumPct / 100)) throw new AppError("DISCOUNT_LIMIT", 409, `La promoción supera el descuento máximo autorizado de ${maximumPct}%. Ajusta la promoción o el límite de ventas.`);
}
