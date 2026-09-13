import "server-only";
import { prisma } from "@/core/database/prisma";
import type { TenantScope } from "@/core/auth/types";

export async function getRestaurantInventoryData(scope: TenantScope) {
  const [products, sales] = await Promise.all([
    prisma.product.findMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId, active: true }, select: { id: true, name: true, recipe: { select: { id: true, active: true, yieldQuantity: true, ingredients: { include: { item: { select: { id: true, name: true, sku: true, unit: true } } } } } } }, orderBy: { name: "asc" } }),
    prisma.sale.findMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId, orderId: { not: null } }, select: { id: true, code: true, createdAt: true, totalCents: true, inventoryMovements: { select: { type: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  return {
    products,
    sales: sales.map((sale) => ({ id: sale.id, code: sale.code, createdAt: sale.createdAt, totalCents: sale.totalCents, hasInventory: sale.inventoryMovements.some((movement) => movement.type === "SALE_CONSUMPTION"), inventoryReturned: sale.inventoryMovements.some((movement) => movement.type === "SALE_RETURN") })),
  };
}
