import "server-only";
import type { Prisma, Product } from "@prisma/client";
import { AppError } from "@/core/auth/errors";

export type MenuScope = { tenantId: string; branchId: string; actorId: string };
export const menuFields = ["name", "description", "categoryId", "priceCents", "costCents", "taxCategory", "kitchenArea", "productType", "areaAssignmentMode", "detectedAreaKey", "preparationAreaId", "active"] as const;
export type MenuSnapshot = Pick<Product, typeof menuFields[number]>;
export type MenuChange = { productId: string; before: MenuSnapshot | null; after: MenuSnapshot; afterUpdatedAt: string };
export type MenuHistory = { version: 1; source: "MANUAL" | "PDF" | "REVERT"; importId?: string; filename?: string; reason?: string; changes: MenuChange[] };
export function menuSnapshot(product: Product): MenuSnapshot {
  return Object.fromEntries(menuFields.map((field) => [field, product[field]])) as MenuSnapshot;
}
export function menuChange(before: Product | null, after: Product): MenuChange {
  return { productId: after.id, before: before ? menuSnapshot(before) : null, after: menuSnapshot(after), afterUpdatedAt: after.updatedAt.toISOString() };
}
export async function recordMenuHistory(tx: Prisma.TransactionClient, scope: MenuScope, history: MenuHistory, revertedId?: string) {
  return tx.auditLog.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, userId: scope.actorId, entityType: "RestaurantMenuHistory", entityId: revertedId ?? history.importId, action: revertedId ? "MENU_REVERT" : "MENU_CHANGE", metadata: JSON.stringify(history) } });
}
export function parseMenuHistory(metadata: string | null): MenuHistory | null {
  try { const value = JSON.parse(metadata ?? "null"); return value?.version === 1 && Array.isArray(value.changes) ? value : null; } catch { return null; }
}
export async function revertMenuHistory(tx: Prisma.TransactionClient, scope: MenuScope, id: string, reason: string) {
  const where = { tenantId: scope.tenantId, branchId: scope.branchId, entityType: "RestaurantMenuHistory" };
  const entry = await tx.auditLog.findFirst({ where: { ...where, id, action: "MENU_CHANGE" } });
  if (!entry) throw new AppError("NOT_FOUND", 404, "Este cambio no tiene una versión restaurable.");
  const previous = await tx.auditLog.findFirst({ where: { ...where, action: "MENU_REVERT", entityId: id } });
  if (previous) return { ok: true, message: "El cambio ya fue revertido." };
  const history = parseMenuHistory(entry.metadata);
  if (!history?.changes.length) throw new AppError("NO_SNAPSHOT", 409, "Este registro antiguo no conserva los valores anteriores.");
  const changes: MenuChange[] = [];
  for (const change of history.changes) {
    const product = await tx.product.findFirst({ where: { id: change.productId, tenantId: scope.tenantId, branchId: scope.branchId } });
    if (!product || product.updatedAt.toISOString() !== change.afterUpdatedAt || menuFields.some((field) => product[field] !== change.after[field])) {
      throw new AppError("MENU_HISTORY_CONFLICT", 409, `${change.after.name} tiene cambios posteriores. No se revirtió ningún producto; revisa su versión actual.`);
    }
    // Only restore fields changed by this operation. New products remain referenced by sales.
    const restore = change.before ? Object.fromEntries(menuFields.filter((field) => change.before![field] !== change.after[field]).map((field) => [field, change.before![field]])) : { active: false };
    if (change.before && ("categoryId" in restore || (restore.active === true))) {
      const category = await tx.category.findFirst({ where: { id: change.before.categoryId, tenantId: scope.tenantId, branchId: scope.branchId, active: true } });
      if (!category) throw new AppError("MENU_HISTORY_CONFLICT", 409, "La categoría anterior ya no está activa. Revisa el producto manualmente.");
    }
    if (change.before?.preparationAreaId && "preparationAreaId" in restore && !await tx.preparationArea.findFirst({ where: { id: change.before.preparationAreaId, tenantId: scope.tenantId, branchId: scope.branchId, active: true } })) throw new AppError("MENU_HISTORY_CONFLICT", 409, "El área de preparación anterior ya no está activa.");
    const restoredName = change.before?.name ?? change.after.name;
    if (restoredName !== product.name) {
      const others = await tx.product.findMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId, id: { not: product.id } }, select: { name: true } });
      const normalize = (name: string) => name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
      if (others.some((other) => normalize(other.name) === normalize(restoredName))) throw new AppError("MENU_HISTORY_CONFLICT", 409, "El nombre anterior ya pertenece a otro producto.");
    }
    const after = await tx.product.update({ where: { id: product.id }, data: restore });
    changes.push(menuChange(product, after));
  }
  await recordMenuHistory(tx, scope, { version: 1, source: "REVERT", importId: history.importId, filename: history.filename, reason, changes }, id);
  return { ok: true, message: "Cambio revertido. Los productos creados se desactivaron y las ventas se conservaron." };
}
