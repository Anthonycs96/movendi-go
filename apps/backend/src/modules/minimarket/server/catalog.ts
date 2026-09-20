import { Prisma } from "@prisma/client";
import type { z } from "zod";
import type { TenantScope } from "@/core/auth/types";
import { AppError } from "@/core/auth/errors";
import type { productSchema } from "./schemas";
import { scoped } from "./service";
import { ensureRetailCategory } from "./categories";

export async function assertAvailableBarcodes(tx: Prisma.TransactionClient, scope: TenantScope, values: string[], excludeId?: string) {
  const codes = values.filter(Boolean);
  if (new Set(codes).size !== codes.length) throw new AppError("DUPLICATE_PRODUCT", 409, "Hay presentaciones con el mismo código dentro del producto.");
  const existing = await tx.retailPresentation.findFirst({ where: { ...scoped(scope), ...(excludeId ? { id: { not: excludeId } } : {}), barcode: { in: codes } }, include: { product: { include: { item: true } } } });
  if (existing) throw new AppError("DUPLICATE_PRODUCT", 409, `El código ${existing.barcode} ya pertenece a ${existing.product.item.name} · ${existing.name}.`);
}

/** Single catalog writer used by individual forms and bulk import. Caller owns transaction. */
export async function createRetailProduct(tx: Prisma.TransactionClient, scope: TenantScope, input: z.infer<typeof productSchema>) {
  if (input.unit === "UND" && input.presentations.some((p) => p.weighted || !Number.isInteger(p.factor))) throw new AppError("INVALID_UNIT", 400, "Los artículos por unidad requieren factores y cantidades enteros.");
  try {
    await assertAvailableBarcodes(tx, scope, input.presentations.map((p) => p.barcode ?? ""));
    const category = await ensureRetailCategory(tx, scope, input.category);
    const item = await tx.inventoryItem.create({ data: { ...scoped(scope), name: input.name, sku: input.sku, unit: input.unit, kind: "RETAIL", minimumStock: input.minimumStock, trackStock: true } });
    const product = await tx.retailProduct.create({ data: { ...scoped(scope), itemId: item.id, category, taxCategory: input.taxCategory, trackExpiry: input.trackExpiry, expiryAlertDays: input.expiryAlertDays, presentations: { create: input.presentations.map((p) => ({ ...p, sku: p.sku || null, barcode: p.barcode || null, ...scoped(scope) })) } } });
    return { id: product.id, itemId: item.id };
  } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new AppError("DUPLICATE_PRODUCT", 409, "El SKU, código de barras o nombre de presentación ya existe en esta sucursal."); throw error; }
}
