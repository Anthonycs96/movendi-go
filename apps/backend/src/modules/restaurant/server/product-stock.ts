import "server-only";
import type { Prisma, Product } from "@prisma/client";
import type { TenantScope } from "@/core/auth/types";
import { hasPermission } from "@/core/auth/permissions";
import { AppError } from "@/core/auth/errors";

export type ProductStockInput = {
  name: string; cost: number; stockMode?: "RECIPE" | "RESALE" | "NONE";
  inventoryItemId?: string; sku?: string; barcode?: string; unit?: string;
  inventoryCategory?: string; showInMenu?: boolean; imageUrl?: string; sortOrder?: number;
};

export async function productStockData(tx: Prisma.TransactionClient, scope: TenantScope, input: ProductStockInput, before?: Product) {
  const stockMode = input.stockMode ?? before?.stockMode ?? "RECIPE";
  let inventoryItemId = input.inventoryItemId || before?.inventoryItemId || null;
  if (before && stockMode !== before.stockMode && await tx.orderItem.count({ where: { productId: before.id, order: { status: { notIn: ["COMPLETED", "CANCELLED"] } } } })) {
    throw new AppError("PRODUCT_IN_USE", 409, "Finaliza los pedidos abiertos antes de cambiar el control de stock.");
  }
  if (stockMode === "RESALE") {
    if (!inventoryItemId) {
      if (!hasPermission(scope.permissions, "inventory:items:create")) throw new AppError("FORBIDDEN", 403, "Necesitas permiso para crear el artículo de inventario.");
      const item = await tx.inventoryItem.create({ data: {
        tenantId: scope.tenantId, branchId: scope.branchId, name: input.name,
        sku: input.sku || `REV-${crypto.randomUUID().slice(0, 12).toUpperCase()}`,
        barcode: input.barcode || null, unit: input.unit || "UND", kind: "PRODUCT",
        inventoryCategory: input.inventoryCategory || null, unitCostCents: Math.round(input.cost * 100), trackStock: true,
      } });
      inventoryItemId = item.id;
      await tx.auditLog.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, userId: scope.actorId, action: "CREATE", entityType: "InventoryItem", entityId: item.id } });
    }
    const item = await tx.inventoryItem.findFirst({ where: { id: inventoryItemId, tenantId: scope.tenantId, branchId: scope.branchId, active: true }, include: { restaurantProduct: { select: { id: true } } } });
    if (!item || (item.restaurantProduct && item.restaurantProduct.id !== before?.id)) throw new AppError("INVALID_STOCK_LINK", 409, "Selecciona un artículo de esta sede que no esté vinculado a otro producto.");
    if (before && await tx.productRecipe.count({ where: { productId: before.id, active: true } })) throw new AppError("RECIPE_EXISTS", 409, "Desactiva la receta antes de convertir este producto en reventa.");
  } else if (input.inventoryItemId) {
    throw new AppError("INVALID_STOCK_LINK", 400, "El vínculo directo a inventario corresponde a productos de reventa.");
  }
  if (before && (before.stockMode !== stockMode || before.inventoryItemId !== (stockMode === "RESALE" ? inventoryItemId : null))) await tx.auditLog.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, userId: scope.actorId, action: "STOCK_CONFIGURATION", entityType: "Product", entityId: before.id, metadata: JSON.stringify({ before: { stockMode: before.stockMode, inventoryItemId: before.inventoryItemId }, after: { stockMode, inventoryItemId } }) } });
  return { stockMode, inventoryItemId: stockMode === "RESALE" ? inventoryItemId : null,
    showInMenu: input.showInMenu ?? before?.showInMenu ?? true,
    imageUrl: input.imageUrl === undefined ? before?.imageUrl : input.imageUrl || null,
    sortOrder: input.sortOrder ?? before?.sortOrder ?? 0,
  };
}
