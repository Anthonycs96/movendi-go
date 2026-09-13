import "server-only";
import { prisma } from "@/core/database/prisma";
import { withSerializableTransaction } from "@/core/database/transactions";
import { AppError } from "@/core/auth/errors";
import { audit } from "@/core/audit/audit";
import type { TenantScope } from "@/core/auth/types";
import { parseInput as parse } from "@/core/validation/parse-input";
import { inventoryRecipeSchema, inventoryReturnSchema } from "./inventory-schemas";
import { reverseRestaurantSaleInventory } from "./sale-inventory";

function ensureUniqueIds(ids: string[], label: string) {
  if (new Set(ids).size !== ids.length) throw new AppError("DUPLICATE_LINES", 400, `${label} contiene artículos repetidos.`);
}

export async function handleRestaurantInventoryCommand(method: string, segments: string[], body: unknown, scope: TenantScope) {
  const [resource, id] = segments;
  if (method === "POST" && resource === "recipes" && id) {
    const input = parse(inventoryRecipeSchema, body);
    ensureUniqueIds(input.ingredients.map((ingredient) => ingredient.itemId), "La receta");
    const product = await prisma.product.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId, active: true } });
    if (!product) throw new AppError("PRODUCT_NOT_FOUND", 404, "El producto vendido no existe en esta sede.");
    const validItems = await prisma.inventoryItem.count({ where: { id: { in: input.ingredients.map((ingredient) => ingredient.itemId) }, tenantId: scope.tenantId, OR: [{ branchId: scope.branchId }, { branchId: null }], active: true, trackStock: true } });
    if (validItems !== input.ingredients.length) throw new AppError("INVALID_RECIPE_ITEMS", 400, "La receta contiene insumos inválidos o de otra sede.");
    const recipe = await prisma.productRecipe.upsert({ where: { productId: product.id }, update: { yieldQuantity: input.yieldQuantity, active: input.active, ingredients: { deleteMany: {}, create: input.ingredients } }, create: { productId: product.id, yieldQuantity: input.yieldQuantity, active: input.active, ingredients: { create: input.ingredients } } });
    await audit(scope, "UPSERT", "ProductRecipe", recipe.id, { productId: product.id, ingredients: input.ingredients.length });
    return { ok: true, id: recipe.id, message: "Receta guardada. Las ventas descontarán sus insumos automáticamente." };
  }

  if (method === "POST" && resource === "returns") {
    const input = parse(inventoryReturnSchema, body);
    const sale = await prisma.sale.findFirst({ where: { id: input.saleId, tenantId: scope.tenantId, branchId: scope.branchId } });
    if (!sale) throw new AppError("SALE_NOT_FOUND", 404, "La venta no existe en esta sede.");
    const restored = await withSerializableTransaction((tx) => reverseRestaurantSaleInventory(tx, scope, sale.id, input.reason));
    await audit(scope, "RETURN", "SaleInventory", sale.id, { restored, reason: input.reason });
    return { ok: true, id: sale.id, message: `Inventario devuelto: ${restored} artículo(s).` };
  }

  throw new AppError("NOT_FOUND", 404, "Operación de inventario no encontrada.");
}
