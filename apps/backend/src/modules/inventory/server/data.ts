import "server-only";
import { prisma } from "@/core/database/prisma";
import type { TenantScope } from "@/core/auth/types";

export async function getInventoryData(scope: TenantScope, tenantType: string) {
  const where = { tenantId: scope.tenantId, OR: [{ branchId: scope.branchId }, { branchId: null }] };
  const [items, movements, purchases, counts, products, sales] = await Promise.all([
    prisma.inventoryItem.findMany({ where, orderBy: [{ active: "desc" }, { name: "asc" }], take: 1000 }),
    prisma.inventoryMovement.findMany({ where, include: { item: { select: { name: true, sku: true, unit: true } }, actor: { select: { name: true, email: true } } }, orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }], take: 300 }),
    prisma.inventoryPurchase.findMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId }, include: { createdBy: { select: { name: true, email: true } }, lines: { include: { item: { select: { name: true, sku: true, unit: true } } } } }, orderBy: { purchasedAt: "desc" }, take: 100 }),
    prisma.inventoryCount.findMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId }, include: { createdBy: { select: { name: true, email: true } }, lines: { include: { item: { select: { name: true, sku: true, unit: true } } } } }, orderBy: { countedAt: "desc" }, take: 100 }),
    tenantType === "RESTAURANT" ? prisma.product.findMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId, active: true }, select: { id: true, name: true, recipe: { select: { id: true, active: true, yieldQuantity: true, ingredients: { include: { item: { select: { id: true, name: true, sku: true, unit: true } } } } } } }, orderBy: { name: "asc" } }) : Promise.resolve([]),
    tenantType === "RESTAURANT" ? prisma.sale.findMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId, orderId: { not: null } }, select: { id: true, code: true, createdAt: true, totalCents: true, inventoryMovements: { select: { type: true } } }, orderBy: { createdAt: "desc" }, take: 100 }) : Promise.resolve([]),
  ]);
  const activeItems = items.filter((item) => item.active && item.trackStock);
  const consumption = new Map<string, number>();
  for (const movement of movements) if (movement.direction === "OUT" && ["SALE_CONSUMPTION", "CONSUMPTION", "WASTE", "LOSS"].includes(movement.type)) consumption.set(movement.itemId, (consumption.get(movement.itemId) ?? 0) + movement.quantity);
  const topConsumption = [...consumption.entries()].map(([itemId, quantity]) => ({ itemId, quantity, item: items.find((item) => item.id === itemId) })).filter((entry) => entry.item).sort((a, b) => b.quantity - a.quantity).slice(0, 10);
  return {
    items,
    movements,
    purchases,
    counts,
    products,
    sales: sales.map((sale) => ({ id: sale.id, code: sale.code, createdAt: sale.createdAt, totalCents: sale.totalCents, hasInventory: sale.inventoryMovements.some((movement) => movement.type === "SALE_CONSUMPTION"), inventoryReturned: sale.inventoryMovements.some((movement) => movement.type === "SALE_RETURN") })),
    topConsumption,
    metrics: {
      activeItems: activeItems.length,
      totalStock: activeItems.reduce((sum, item) => sum + item.stock, 0),
      lowStock: activeItems.filter((item) => item.stock > 0 && item.stock <= item.minimumStock).length,
      outOfStock: activeItems.filter((item) => item.stock <= 0).length,
      valuationCents: activeItems.reduce((sum, item) => sum + Math.round(item.stock * item.unitCostCents), 0),
    },
  };
}
