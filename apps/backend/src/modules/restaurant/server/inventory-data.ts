import "server-only";
import { prisma } from "@/core/database/prisma";
import type { TenantScope } from "@/core/auth/types";

export async function getRestaurantInventoryData(scope: TenantScope) {
  const [products, sales, categories, preparationAreas] = await Promise.all([
    prisma.product.findMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId, active: true, stockMode: "RECIPE" }, select: { id: true, name: true, recipe: { select: { id: true, active: true, yieldQuantity: true, ingredients: { include: { item: { select: { id: true, name: true, sku: true, unit: true } } } } } } }, orderBy: { name: "asc" } }),
    prisma.sale.findMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId, orderId: { not: null } }, select: { id: true, code: true, createdAt: true, totalCents: true, inventoryMovements: { select: { id: true, type: true, itemId: true, originId: true, quantity: true, item: { select: { name: true, unit: true } } } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.category.findMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId, active: true }, select: { id: true, name: true } }),
    prisma.preparationArea.findMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId, active: true }, select: { id: true, name: true } }),
  ]);
  return {
    products,
    menuSetup: { categories, preparationAreas },
    sales: sales.map((sale) => ({ id: sale.id, code: sale.code, createdAt: sale.createdAt, totalCents: sale.totalCents, hasInventory: sale.inventoryMovements.some((movement) => movement.type === "SALE_CONSUMPTION"), inventoryReturned: sale.inventoryMovements.filter(m => m.type === "SALE_CONSUMPTION").every(m => sale.inventoryMovements.filter(r => r.type === "SALE_RETURN" && r.itemId === m.itemId).reduce((sum,r) => sum+r.quantity,0) >= sale.inventoryMovements.filter(r => r.type === "SALE_CONSUMPTION" && r.itemId === m.itemId).reduce((sum,r) => sum+r.quantity,0)), consumptions: sale.inventoryMovements.filter(m => m.type === "SALE_CONSUMPTION").map(m => ({ id: m.id, name: m.item.name, unit: m.item.unit, remaining: Math.max(0, m.quantity - sale.inventoryMovements.filter(r => r.type === "SALE_RETURN" && (r.originId === m.id || r.originId === sale.id && r.itemId === m.itemId)).reduce((sum,r) => sum+r.quantity,0)) })) })),
  };
}
