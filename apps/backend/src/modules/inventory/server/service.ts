import "server-only";
import { Prisma } from "@prisma/client";
import { AppError } from "@/core/auth/errors";
import { prisma } from "@/core/database/prisma";
import type { TenantScope } from "@/core/auth/types";

class InventoryConcurrencyError extends Error {
  constructor() {
    super("El inventario cambió mientras se procesaba la operación.");
    this.name = "InventoryConcurrencyError";
  }
}

export type InventoryMovementInput = {
  itemId: string;
  type: string;
  direction: "IN" | "OUT";
  quantity: number;
  unitCostCents?: number;
  originType: string;
  originId?: string | null;
  idempotencyKey?: string | null;
  orderId?: string | null;
  saleId?: string | null;
  purchaseId?: string | null;
  countId?: string | null;
  reference?: string | null;
  notes?: string | null;
  occurredAt?: Date;
  preventNegativeStock?: boolean;
};

export async function withInventoryTransaction<T>(operation: (transaction: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
    } catch (error) {
      lastError = error;
      const retriable = error instanceof InventoryConcurrencyError
        || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034");
      if (!retriable) throw error;
      if (attempt === 2) throw new AppError("INVENTORY_BUSY", 409, "El inventario cambió durante la operación. Inténtalo nuevamente.");
    }
  }
  throw lastError;
}

export async function applyInventoryMovement(transaction: Prisma.TransactionClient, scope: TenantScope, input: InventoryMovementInput) {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new AppError("INVALID_QUANTITY", 400, "La cantidad del movimiento debe ser mayor que cero.");
  const quantity = Math.round(input.quantity * 1_000_000) / 1_000_000;
  if (quantity <= 0) throw new AppError("INVALID_QUANTITY", 400, "La cantidad es menor que la precisión admitida.");
  if (input.idempotencyKey) {
    const existing = await transaction.inventoryMovement.findFirst({ where: { tenantId: scope.tenantId, idempotencyKey: input.idempotencyKey } });
    if (existing) {
      if (existing.branchId !== scope.branchId || existing.itemId !== input.itemId || existing.type !== input.type || existing.direction !== input.direction || Math.abs(existing.quantity - quantity) > 1e-9) {
        throw new AppError("IDEMPOTENCY_CONFLICT", 409, "Esta solicitud ya se utilizó para otro movimiento de inventario.");
      }
      return existing;
    }
  }
  const item = await transaction.inventoryItem.findFirst({ where: { id: input.itemId, tenantId: scope.tenantId, OR: [{ branchId: scope.branchId }, { branchId: null }], active: true } });
  if (!item) throw new AppError("INVENTORY_ITEM_NOT_FOUND", 404, "El producto o insumo no existe en esta sede.");
  if (!item.trackStock) throw new AppError("STOCK_NOT_TRACKED", 409, "Este artículo no controla existencias.");
  const stockBefore = item.stock;
  const stockAfter = Math.round((input.direction === "IN" ? stockBefore + quantity : stockBefore - quantity) * 1_000_000) / 1_000_000;
  if (stockAfter < -1e-9 && input.preventNegativeStock !== false) throw new AppError("INSUFFICIENT_STOCK", 409, `${item.name} no tiene stock suficiente. Disponible: ${item.stock} ${item.unit}.`);
  const unitCostCents = input.unitCostCents ?? item.unitCostCents;
  const nextUnitCost = input.direction === "IN" && input.unitCostCents !== undefined && stockAfter > 0
    ? Math.round(((Math.max(0, stockBefore) * item.unitCostCents) + (quantity * input.unitCostCents)) / stockAfter)
    : item.unitCostCents;
  const updated = await transaction.inventoryItem.updateMany({
    where: { id: item.id, tenantId: scope.tenantId, stock: stockBefore },
    data: { stock: stockAfter, unitCostCents: nextUnitCost, branchId: item.branchId ?? scope.branchId },
  });
  if (updated.count !== 1) throw new InventoryConcurrencyError();
  return transaction.inventoryMovement.create({ data: {
    tenantId: scope.tenantId, branchId: scope.branchId, itemId: item.id, actorId: scope.actorId,
    type: input.type, direction: input.direction, quantity, stockBefore, stockAfter,
    unitCostCents, totalCostCents: Math.round(quantity * unitCostCents), originType: input.originType,
    originId: input.originId ?? null, idempotencyKey: input.idempotencyKey ?? null, orderId: input.orderId ?? null,
    saleId: input.saleId ?? null, purchaseId: input.purchaseId ?? null, countId: input.countId ?? null,
    reference: input.reference ?? null, notes: input.notes ?? null, occurredAt: input.occurredAt ?? new Date(),
  } });
}

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
