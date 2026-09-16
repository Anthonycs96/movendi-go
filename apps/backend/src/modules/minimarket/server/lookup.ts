import "server-only";
import type { MinimarketProduct } from "@movendi/contracts";
import { prisma } from "@/core/database/prisma";
import { AppError } from "@/core/auth/errors";
import type { TenantScope } from "@/core/auth/types";
import { hasPermission } from "@/core/auth/permissions";
import { scoped } from "./service";

/** Exact lookup across the entire branch catalog, never a paginated client cache. */
export async function lookupBarcode(scope: TenantScope, barcode: string) {
  if (!barcode.trim() || barcode.length > 80) throw new AppError("INVALID_BARCODE", 400, "El código debe tener entre 1 y 80 caracteres.");
  const where = scoped(scope);
  const row = await prisma.retailPresentation.findFirst({ where: { ...where, barcode: barcode.trim(), product: where }, include: { product: { include: { item: true, lots: { orderBy: { expiresOn: "asc" } }, presentations: true } } } });
  if (!row) throw new AppError("NOT_FOUND", 404, "No existe un producto con este código en la sucursal actual.");
  const p = row.product, inventory = hasPermission(scope.permissions, "inventory:read"), costs = inventory || hasPermission(scope.permissions, "minimarket:reports:read");
  const product: MinimarketProduct = { id: p.id, itemId: p.itemId, name: p.item.name, sku: p.item.sku, category: p.category, taxCategory: p.taxCategory, unit: p.item.unit, stock: p.item.stock, minimumStock: p.item.minimumStock, unitCostCents: costs ? p.item.unitCostCents : null, active: p.item.active, trackExpiry: p.trackExpiry, expiryAlertDays: p.expiryAlertDays, presentations: p.presentations.map(({ id, name, sku, barcode, factor, priceCents, weighted, active }) => ({ id, name, sku, barcode, factor, priceCents, weighted, active })), lots: p.lots.map(({ id, code, expiresOn, stock }) => ({ id, code, expiresOn, stock })) };
  const movements = inventory ? await prisma.inventoryMovement.findMany({ where: { ...where, itemId: p.itemId }, select: { id: true, type: true, quantity: true, direction: true, stockBefore: true, stockAfter: true, createdAt: true, reference: true, originId: true, actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 10 }) : [];
  const branch = await prisma.branch.findFirstOrThrow({ where: { id: scope.branchId, tenantId: scope.tenantId }, select: { id: true, name: true } });
  return { product, presentationId: row.id, branch, movements: movements.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })) };
}
