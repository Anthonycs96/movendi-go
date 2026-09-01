import "server-only";

import { prisma } from "@/core/database/prisma";
import { AppError } from "@/core/auth/errors";
import { normalizeRestaurantCatalogLabel } from "@movendi/contracts";
import type { CatalogWorkbookDraft } from "./catalog-workbook";

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
  const [storedAreas, storedCategories, storedProducts] = await Promise.all([
    prisma.preparationArea.findMany({ where: { tenantId, branchId: branch.id, active: true }, orderBy: { createdAt: "asc" }, select: { name: true } }),
    prisma.category.findMany({ where: { tenantId, branchId: branch.id, active: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, preparationArea: { select: { name: true } } } }),
    prisma.product.findMany({ where: { tenantId, branchId: branch.id, active: true }, orderBy: { createdAt: "asc" }, select: { name: true, description: true, priceCents: true, costCents: true, productType: true, areaAssignmentMode: true, preparationArea: { select: { name: true } }, category: { select: { name: true } } } }),
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
  return { tenantId, tenantName: tenant.name, tenantSlug: tenant.slug, branchId: branch.id, areas, catalog };
}
