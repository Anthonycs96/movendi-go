import "server-only";

import { z } from "zod";
import { normalizeRestaurantCatalogLabel } from "@movendi/contracts";
import { prisma } from "@/core/database/prisma";
import { AppError } from "@/core/auth/errors";
import { getRestaurantConfiguration } from "@/modules/restaurant/server/configuration";

const optionalText = (max: number) => z.string().trim().max(max).default("");
const customer = z.object({ name: z.string().trim().min(2).max(120), documentType: optionalText(80), documentNumber: optionalText(20), segment: optionalText(80), phone: optionalText(30), email: z.union([z.string().email(), z.literal("")]).default(""), notes: optionalText(500) });
const inventoryItem = z.object({ sku: z.string().trim().toUpperCase().regex(/^[A-Z0-9._-]{2,40}$/), barcode: optionalText(80), name: z.string().trim().min(2).max(160), kind: z.enum(["PRODUCT", "INPUT", "MATERIAL", "SUPPLY", "PART"]), unit: z.string().trim().toUpperCase().min(1).max(20), openingStock: z.number().min(0).max(1_000_000_000), minimumStock: z.number().min(0).max(1_000_000_000), unitCost: z.number().min(0).max(100_000), trackStock: z.boolean(), notes: optionalText(500) });
const recipeLine = z.object({ product: z.string().trim().min(2).max(140), yieldQuantity: z.number().positive().max(1_000_000), ingredientSku: z.string().trim().toUpperCase().regex(/^[A-Z0-9._-]{2,40}$/), quantity: z.number().positive().max(1_000_000_000), wastePercent: z.number().min(0).max(100) });
const promotion = z.object({ name: z.string().trim().min(2).max(120), code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,40}$/).or(z.literal("")), kind: z.string().trim().toUpperCase().min(1).max(80), value: z.number().positive().max(100_000), buyQuantity: z.number().int().min(2).max(100), freeQuantity: z.number().int().min(1).max(99), scope: z.string().trim().toUpperCase().min(1).max(80), target: optionalText(140), minSubtotal: z.number().min(0).max(1_000_000), maxDiscount: z.number().min(0).max(1_000_000), automatic: z.boolean(), weekdays: z.string().regex(/^[0-6](,[0-6])*$/), startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).or(z.literal("")), endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).or(z.literal("")) });

export const restaurantControlMasterDataSchema = z.object({ customers: z.array(customer).max(500).default([]), inventoryItems: z.array(inventoryItem).max(500).default([]), recipes: z.array(recipeLine).max(1000).default([]) }).superRefine((data, context) => {
  const skus = new Set<string>();
  data.inventoryItems.forEach((item, index) => { if (skus.has(item.sku)) context.addIssue({ code: "custom", path: ["inventoryItems", index, "sku"], message: `El SKU ${item.sku} está repetido.` }); skus.add(item.sku); });
  const recipePairs = new Set<string>();
  data.recipes.forEach((item, index) => { const pair = `${normalizeRestaurantCatalogLabel(item.product).key}:${item.ingredientSku}`; if (recipePairs.has(pair)) context.addIssue({ code: "custom", path: ["recipes", index, "ingredientSku"], message: "El ingrediente está repetido en la receta." }); recipePairs.add(pair); });
});
export const restaurantSalesMasterDataSchema = z.object({ promotions: z.array(promotion).max(200).default([]) }).superRefine((data, context) => {
  const codes = new Set<string>();
  data.promotions.forEach((item, index) => { if (item.code && codes.has(item.code)) context.addIssue({ code: "custom", path: ["promotions", index, "code"], message: `El código ${item.code} está repetido.` }); if (item.code) codes.add(item.code); if (item.kind === "QUANTITY" && item.freeQuantity >= item.buyQuantity) context.addIssue({ code: "custom", path: ["promotions", index, "freeQuantity"], message: "Las unidades gratuitas deben ser menores que las unidades requeridas." }); });
});

export async function persistRestaurantControlMasterData(tenantId: string, branchId: string, actorId: string, raw: unknown) {
  const parsed = restaurantControlMasterDataSchema.safeParse(raw);
  if (!parsed.success) throw new AppError("MASTER_DATA_INVALID", 400, "La carga maestra de clientes, inventario o recetas contiene datos inválidos.", parsed.error.flatten());
  const data = parsed.data;
  const configuration = await getRestaurantConfiguration(tenantId, branchId);
  const documentTypes = new Set(configuration.customers.documentTypes.filter((item) => item.active).map((item) => item.key));
  const segments = new Set(configuration.customers.segments.filter((item) => item.active).map((item) => item.key));
  const units = new Set(configuration.inventory.units.filter((item) => item.active).map((item) => item.key));
  await prisma.$transaction(async (tx) => {
    for (const item of data.customers) {
      if (item.documentType && !documentTypes.has(item.documentType)) throw new AppError("CUSTOMER_DOCUMENT_TYPE_INVALID", 409, `El tipo de documento ${item.documentType} no está configurado.`);
      if (item.segment && !segments.has(item.segment)) throw new AppError("CUSTOMER_SEGMENT_INVALID", 409, `El segmento ${item.segment} no está configurado.`);
      const existing = await tx.customer.findFirst({ where: { tenantId, OR: [item.documentNumber ? { dni: item.documentNumber } : undefined, item.phone ? { phone: item.phone } : undefined, { branchId, name: item.name }].filter(Boolean) as Array<Record<string, unknown>> } });
      const values = { branchId, name: item.name, documentType: item.documentType || null, dni: item.documentNumber || null, segment: item.segment || null, phone: item.phone || null, email: item.email || null, notes: item.notes || null, active: true };
      if (existing) await tx.customer.update({ where: { id: existing.id }, data: values });
      else await tx.customer.create({ data: { tenantId, ...values } });
    }

    for (const item of data.inventoryItems) {
      if (!units.has(item.unit)) throw new AppError("INVENTORY_UNIT_INVALID", 409, `La unidad ${item.unit} no está configurada.`);
      const existing = await tx.inventoryItem.findFirst({ where: { tenantId, sku: item.sku, OR: [{ branchId }, { branchId: null }] }, orderBy: { branchId: "desc" } });
      const values = { barcode: item.barcode || null, name: item.name, kind: item.kind, unit: item.unit, minimumStock: item.minimumStock, unitCostCents: Math.round(item.unitCost * 100), trackStock: item.trackStock, notes: item.notes || null, active: true };
      if (existing) await tx.inventoryItem.update({ where: { id: existing.id }, data: values });
      else {
        const created = await tx.inventoryItem.create({ data: { tenantId, branchId, sku: item.sku, stock: item.openingStock, ...values } });
        if (item.openingStock > 0) await tx.inventoryMovement.create({ data: { tenantId, branchId, itemId: created.id, actorId, type: "OPENING_BALANCE", direction: "IN", quantity: item.openingStock, stockBefore: 0, stockAfter: item.openingStock, unitCostCents: Math.round(item.unitCost * 100), totalCostCents: Math.round(item.openingStock * item.unitCost * 100), originType: "ONBOARDING", originId: created.id, idempotencyKey: `ONBOARDING:OPENING:${branchId}:${item.sku}` } });
      }
    }

    const [products, storedItems] = await Promise.all([
      tx.product.findMany({ where: { tenantId, branchId, active: true, productType: { not: "ADDON" } }, select: { id: true, name: true } }),
      tx.inventoryItem.findMany({ where: { tenantId, OR: [{ branchId }, { branchId: null }], active: true }, select: { id: true, sku: true } }),
    ]);
    const productByKey = new Map(products.map((item) => [normalizeRestaurantCatalogLabel(item.name).key, item]));
    const itemBySku = new Map(storedItems.map((item) => [item.sku.toUpperCase(), item]));
    const recipeGroups = new Map<string, typeof data.recipes>();
    for (const line of data.recipes) {
      const key = normalizeRestaurantCatalogLabel(line.product).key;
      recipeGroups.set(key, [...(recipeGroups.get(key) ?? []), line]);
    }
    for (const [productKey, lines] of recipeGroups) {
      const product = productByKey.get(productKey);
      if (!product) throw new AppError("RECIPE_PRODUCT_NOT_FOUND", 409, `El producto de receta “${lines[0]?.product}” no existe en la carta.`);
      const recipe = await tx.productRecipe.upsert({ where: { productId: product.id }, create: { productId: product.id, yieldQuantity: lines[0]?.yieldQuantity ?? 1 }, update: { yieldQuantity: lines[0]?.yieldQuantity ?? 1, active: true } });
      await tx.productRecipeIngredient.deleteMany({ where: { recipeId: recipe.id } });
      for (const line of lines) {
        const ingredient = itemBySku.get(line.ingredientSku);
        if (!ingredient) throw new AppError("RECIPE_INGREDIENT_NOT_FOUND", 409, `El SKU “${line.ingredientSku}” no existe en inventario.`);
        await tx.productRecipeIngredient.create({ data: { recipeId: recipe.id, itemId: ingredient.id, quantity: line.quantity, wastePercent: line.wastePercent } });
      }
    }
  });
  return { customers: data.customers.length, inventoryItems: data.inventoryItems.length, recipes: new Set(data.recipes.map((item) => normalizeRestaurantCatalogLabel(item.product).key)).size };
}

export async function persistRestaurantSalesMasterData(tenantId: string, branchId: string, raw: unknown) {
  const parsed = restaurantSalesMasterDataSchema.safeParse(raw);
  if (!parsed.success) throw new AppError("MASTER_DATA_INVALID", 400, "La carga maestra de promociones contiene datos inválidos.", parsed.error.flatten());
  const data = parsed.data;
  const [categories, products, configuration] = await Promise.all([
    prisma.category.findMany({ where: { tenantId, branchId, active: true }, select: { id: true, name: true } }),
    prisma.product.findMany({ where: { tenantId, branchId, active: true }, select: { id: true, name: true } }),
    getRestaurantConfiguration(tenantId, branchId),
  ]);
  const categoryByKey = new Map(categories.map((item) => [normalizeRestaurantCatalogLabel(item.name).key, item.id]));
  const productByKey = new Map(products.map((item) => [normalizeRestaurantCatalogLabel(item.name).key, item.id]));
  await prisma.$transaction(async (tx) => {
    for (const item of data.promotions) {
      if (!configuration.promotions.kinds.some((option) => option.active && option.key === item.kind)) throw new AppError("PROMOTION_KIND_INVALID", 409, `El tipo de promoción ${item.kind} no está configurado.`);
      if (!configuration.promotions.scopes.some((option) => option.active && option.key === item.scope)) throw new AppError("PROMOTION_SCOPE_INVALID", 409, `El alcance de promoción ${item.scope} no está configurado.`);
      if (item.kind === "PERCENT" && item.value > configuration.promotions.maxPercent) throw new AppError("INVALID_PROMOTION", 400, `El descuento porcentual no puede superar ${configuration.promotions.maxPercent}%.`);
      const targetKey = normalizeRestaurantCatalogLabel(item.target).key;
      const categoryId = item.scope === "CATEGORY" ? categoryByKey.get(targetKey) ?? null : null;
      const productId = item.scope === "PRODUCT" ? productByKey.get(targetKey) ?? null : null;
      if (item.scope === "CATEGORY" && !categoryId) throw new AppError("PROMOTION_CATEGORY_NOT_FOUND", 409, `La categoría “${item.target}” no existe.`);
      if (item.scope === "PRODUCT" && !productId) throw new AppError("PROMOTION_PRODUCT_NOT_FOUND", 409, `El producto “${item.target}” no existe.`);
      if (item.kind === "QUANTITY" && item.freeQuantity >= item.buyQuantity) throw new AppError("INVALID_PROMOTION", 400, "Las unidades gratuitas deben ser menores que las unidades requeridas.");
      const existing = item.code ? await tx.promotion.findUnique({ where: { tenantId_branchId_code: { tenantId, branchId, code: item.code } } }) : await tx.promotion.findFirst({ where: { tenantId, branchId, name: item.name } });
      const values = { name: item.name, code: item.code || null, kind: item.kind, value: item.kind === "FIXED" ? Math.round(item.value * 100) : item.kind === "PERCENT" ? Math.round(item.value) : 0, buyQuantity: item.buyQuantity, freeQuantity: item.freeQuantity, scope: item.scope, categoryId, productId, minSubtotalCents: Math.round(item.minSubtotal * 100), maxDiscountCents: item.maxDiscount > 0 ? Math.round(item.maxDiscount * 100) : null, automatic: item.automatic, weekdays: item.weekdays, startTime: item.startTime || null, endTime: item.endTime || null, active: true };
      if (existing) await tx.promotion.update({ where: { id: existing.id }, data: values });
      else await tx.promotion.create({ data: { tenantId, branchId, ...values } });
    }
  });
  return { promotions: data.promotions.length };
}
