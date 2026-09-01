import "server-only";

import { prisma } from "@/core/database/prisma";
import { AppError } from "@/core/auth/errors";
import { normalizeRestaurantCatalogLabel } from "@movendi/contracts";
import { getRestaurantConfiguration } from "@/modules/restaurant/server/configuration";
import type { CatalogWorkbookDraft, RestaurantMasterWorkbookDraft } from "./catalog-workbook";

function objectValue(value: string | null | undefined) {
  try {
    const parsed = JSON.parse(value ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch { return {}; }
}

function catalogDraft(value: unknown): CatalogWorkbookDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const draft = value as Partial<CatalogWorkbookDraft>;
  if (!Array.isArray(draft.categories) || !Array.isArray(draft.products) || !Array.isArray(draft.addons)) return null;
  return { categories: draft.categories, products: draft.products, addons: draft.addons };
}

export async function loadRestaurantCatalogWorkbookContext(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, include: { setup: true, branches: { where: { active: true }, orderBy: { createdAt: "asc" }, take: 1 } } });
  if (!tenant) throw new AppError("TENANT_NOT_FOUND", 404, "El negocio no existe.");
  if (tenant.type !== "RESTAURANT") throw new AppError("INVALID_BUSINESS_TYPE", 409, "La plantilla de Carta solo corresponde a restaurantes.");
  const branch = tenant.branches[0];
  if (!branch) throw new AppError("BRANCH_NOT_FOUND", 409, "El restaurante necesita una sede activa.");
  const setupData = objectValue(tenant.setup?.data);
  const savedCatalog = catalogDraft(setupData.CATALOG);
  const savedCatalogStep = setupData.CATALOG && typeof setupData.CATALOG === "object" && !Array.isArray(setupData.CATALOG) ? setupData.CATALOG as { masterData?: Partial<RestaurantMasterWorkbookDraft>; importedUsers?: RestaurantMasterWorkbookDraft["users"]; importedZones?: RestaurantMasterWorkbookDraft["zones"] } : null;
  const [storedAreas, storedCategories, storedProducts, roles, memberships, customers, inventoryItems, recipes, promotions, configuration, diningAreas] = await Promise.all([
    prisma.preparationArea.findMany({ where: { tenantId, branchId: branch.id, active: true }, orderBy: { createdAt: "asc" }, select: { name: true } }),
    prisma.category.findMany({ where: { tenantId, branchId: branch.id, active: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, preparationArea: { select: { name: true } } } }),
    prisma.product.findMany({ where: { tenantId, branchId: branch.id, active: true }, orderBy: { createdAt: "asc" }, select: { name: true, description: true, priceCents: true, costCents: true, productType: true, areaAssignmentMode: true, preparationArea: { select: { name: true } }, category: { select: { name: true } } } }),
    prisma.role.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" }, select: { key: true, name: true } }),
    prisma.membership.findMany({ where: { tenantId, active: true }, orderBy: { createdAt: "asc" }, select: { user: { select: { name: true, email: true } }, role: { select: { key: true } } } }),
    prisma.customer.findMany({ where: { tenantId, OR: [{ branchId: branch.id }, { branchId: null }], active: true }, orderBy: { createdAt: "asc" }, select: { name: true, documentType: true, dni: true, segment: true, phone: true, email: true, notes: true } }),
    prisma.inventoryItem.findMany({ where: { tenantId, OR: [{ branchId: branch.id }, { branchId: null }], active: true }, orderBy: { createdAt: "asc" }, select: { sku: true, barcode: true, name: true, kind: true, unit: true, stock: true, minimumStock: true, unitCostCents: true, trackStock: true, notes: true } }),
    prisma.productRecipe.findMany({ where: { product: { tenantId, branchId: branch.id, active: true } }, orderBy: { createdAt: "asc" }, select: { yieldQuantity: true, product: { select: { name: true } }, ingredients: { select: { quantity: true, wastePercent: true, item: { select: { sku: true } } } } } }),
    prisma.promotion.findMany({ where: { tenantId, branchId: branch.id, active: true }, orderBy: { createdAt: "asc" }, select: { name: true, code: true, kind: true, value: true, buyQuantity: true, freeQuantity: true, scope: true, minSubtotalCents: true, maxDiscountCents: true, automatic: true, weekdays: true, startTime: true, endTime: true, category: { select: { name: true } }, product: { select: { name: true } } } }),
    getRestaurantConfiguration(tenantId, branch.id),
    prisma.diningArea.findMany({ where: { tenantId, branchId: branch.id, active: true }, orderBy: { createdAt: "asc" }, select: { name: true, tables: { where: { active: true }, select: { name: true, seats: true } } } }),
  ]);
  const operation = setupData.OPERATIONS && typeof setupData.OPERATIONS === "object" && !Array.isArray(setupData.OPERATIONS) ? setupData.OPERATIONS as { preparationAreas?: unknown[] } : null;
  const setupAreas = Array.isArray(operation?.preparationAreas) ? operation.preparationAreas.flatMap((item) => {
    if (typeof item === "string") return item.trim() ? [item.trim()] : [];
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const area = item as { name?: unknown; enabled?: unknown };
    return area.enabled !== false && typeof area.name === "string" && area.name.trim() ? [area.name.trim()] : [];
  }) : [];
  const areas = [...new Set((setupAreas.length ? setupAreas : storedAreas.map((area) => area.name)).filter(Boolean))];
  if (!areas.length) throw new AppError("PREPARATION_AREA_REQUIRED", 409, "Guarda al menos un área operativa antes de descargar la plantilla de Carta.");
  const databaseCatalog: CatalogWorkbookDraft = {
    categories: storedCategories.filter((category) => normalizeRestaurantCatalogLabel(category.name).key !== "ADICIONALES").map((category) => ({ name: category.name, preparationArea: category.preparationArea?.name ?? "" })),
    products: storedProducts.filter((product) => product.productType !== "ADDON").map((product) => ({ name: product.name, category: product.category.name, description: product.description ?? "", price: product.priceCents / 100, cost: product.costCents / 100, preparationArea: product.preparationArea?.name ?? "" })),
    addons: storedProducts.filter((product) => product.productType === "ADDON").map((product) => ({ name: product.name, price: product.priceCents / 100, cost: product.costCents / 100, preparationArea: product.preparationArea?.name ?? "", areaAssignmentMode: product.areaAssignmentMode === "SPECIFIC_AREA" ? "SPECIFIC_AREA" : "INHERIT_FROM_PRODUCT" })),
  };
  const catalog = savedCatalog && (savedCatalog.categories.length || savedCatalog.products.length || savedCatalog.addons.length) ? savedCatalog : databaseCatalog;
  const teamStep = setupData.TEAM && typeof setupData.TEAM === "object" && !Array.isArray(setupData.TEAM) ? setupData.TEAM as { roles?: Array<{ key: string; name: string }>; users?: Array<{ name: string; email: string; roleKey: string }> } : null;
  const tableStep = setupData.TABLES && typeof setupData.TABLES === "object" && !Array.isArray(setupData.TABLES) ? setupData.TABLES as { zones?: RestaurantMasterWorkbookDraft["zones"] } : null;
  const fallbackRoles = [{ key: "WAITER", name: "Mesero" }, { key: "KITCHEN", name: "Cocina" }, { key: "CASHIER", name: "Caja" }, { key: "MANAGER", name: "Administrador de local" }];
  const workbookRoles = teamStep?.roles?.length ? teamStep.roles : roles.length ? roles : fallbackRoles;
  const databaseZones = diningAreas.map((area) => {
    const first = area.tables[0]?.name ?? "Mesa 1";
    const prefix = first.replace(/\s+\d+$/, "") || "Mesa";
    return { name: area.name, prefix, count: Math.max(1, area.tables.length), seats: area.tables[0]?.seats ?? configuration.floor.defaultSeats };
  });
  const masterData: RestaurantMasterWorkbookDraft = {
    users: teamStep?.users?.length ? teamStep.users : savedCatalogStep?.importedUsers?.length ? savedCatalogStep.importedUsers : memberships.map((membership) => ({ name: membership.user.name, email: membership.user.email, roleKey: membership.role.key })),
    zones: tableStep?.zones?.length ? tableStep.zones : savedCatalogStep?.importedZones?.length ? savedCatalogStep.importedZones : databaseZones,
    customers: savedCatalogStep?.masterData?.customers?.length ? savedCatalogStep.masterData.customers : customers.map((item) => ({ name: item.name, documentType: item.documentType ?? "", documentNumber: item.dni ?? "", segment: item.segment ?? "", phone: item.phone ?? "", email: item.email ?? "", notes: item.notes ?? "" })),
    inventoryItems: savedCatalogStep?.masterData?.inventoryItems?.length ? savedCatalogStep.masterData.inventoryItems : inventoryItems.map((item) => ({ sku: item.sku, barcode: item.barcode ?? "", name: item.name, kind: item.kind, unit: item.unit, openingStock: item.stock, minimumStock: item.minimumStock, unitCost: item.unitCostCents / 100, trackStock: item.trackStock, notes: item.notes ?? "" })),
    recipes: savedCatalogStep?.masterData?.recipes?.length ? savedCatalogStep.masterData.recipes : recipes.flatMap((recipe) => recipe.ingredients.map((ingredient) => ({ product: recipe.product.name, yieldQuantity: recipe.yieldQuantity, ingredientSku: ingredient.item.sku, quantity: ingredient.quantity, wastePercent: ingredient.wastePercent }))),
    promotions: savedCatalogStep?.masterData?.promotions?.length ? savedCatalogStep.masterData.promotions : promotions.map((item) => ({ name: item.name, code: item.code ?? "", kind: item.kind, value: item.kind === "FIXED" ? item.value / 100 : item.value, buyQuantity: item.buyQuantity, freeQuantity: item.freeQuantity, scope: item.scope, target: item.category?.name ?? item.product?.name ?? "", minSubtotal: item.minSubtotalCents / 100, maxDiscount: (item.maxDiscountCents ?? 0) / 100, automatic: item.automatic, weekdays: item.weekdays, startTime: item.startTime ?? "", endTime: item.endTime ?? "" })),
  };
  return { tenantId, tenantName: tenant.name, tenantSlug: tenant.slug, branchId: branch.id, areas, catalog, masterData, lists: { roles: workbookRoles, documentTypes: configuration.customers.documentTypes.filter((item) => item.active).map((item) => item.key), customerSegments: configuration.customers.segments.filter((item) => item.active).map((item) => item.key), inventoryUnits: configuration.inventory.units.filter((item) => item.active).map((item) => item.key), promotionKinds: configuration.promotions.kinds.filter((item) => item.active).map((item) => item.key), promotionScopes: configuration.promotions.scopes.filter((item) => item.active).map((item) => item.key) } };
}
