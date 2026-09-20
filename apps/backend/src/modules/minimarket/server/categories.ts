import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { AppError } from "@/core/auth/errors";
import type { TenantScope } from "@/core/auth/types";
import { key } from "./schemas";
import { retailOperation, scoped } from "./service";

export const categorySchema = z.object({ idempotencyKey: key, name: z.string().trim().min(1).max(120) });
const normalized = (name: string) => name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("es-PE");

async function matchingCategory(tx: Prisma.TransactionClient, scope: TenantScope, name: string) {
  const categories = await tx.category.findMany({ where: scoped(scope) });
  return categories.find((category) => normalized(category.name) === normalized(name));
}

/** Keep the existing retail category labels compatible with imports and saved products. */
export async function ensureRetailCategory(tx: Prisma.TransactionClient, scope: TenantScope, name: string) {
  const existing = await matchingCategory(tx, scope, name);
  if (existing) {
    if (!existing.active) throw new AppError("CATEGORY_INACTIVE", 409, "La categoría está inactiva. Elige otra categoría.");
    return existing.name;
  }
  return (await tx.category.create({ data: { ...scoped(scope), name: name.trim().replace(/\s+/g, " ") } })).name;
}

export function saveRetailCategory(scope: TenantScope, input: z.infer<typeof categorySchema>, id?: string) {
  return retailOperation(scope, id ? "CATEGORY_EDIT" : "CATEGORY_CREATE", { ...input, id }, async (tx) => {
    const name = input.name.replace(/\s+/g, " ");
    const current = id ? await tx.category.findFirst({ where: { ...scoped(scope), id } }) : null;
    if (id && !current) throw new AppError("NOT_FOUND", 404, "Categoría no encontrada.");
    const duplicate = await matchingCategory(tx, scope, name);
    if (duplicate && duplicate.id !== id) throw new AppError("DUPLICATE_CATEGORY", 409, "Ya existe una categoría con ese nombre en esta sucursal.");
    if (!current) return tx.category.create({ data: { ...scoped(scope), name } });
    // Rename every product, including inactive products and those on other pages.
    await tx.retailProduct.updateMany({ where: { ...scoped(scope), category: current.name }, data: { category: name } });
    return tx.category.update({ where: { id: current.id }, data: { name } });
  });
}

export function deleteRetailCategory(scope: TenantScope, id: string, input: { idempotencyKey: string }) {
  return retailOperation(scope, "CATEGORY_DELETE", { ...input, id }, async (tx) => {
    const category = await tx.category.findFirst({ where: { ...scoped(scope), id } });
    if (!category) throw new AppError("NOT_FOUND", 404, "Categoría no encontrada.");
    if (await tx.retailProduct.count({ where: { ...scoped(scope), category: category.name } })) {
      throw new AppError("CATEGORY_IN_USE", 409, "Esta categoría tiene productos. Asígnalos a otra categoría antes de eliminarla.");
    }
    await tx.category.delete({ where: { id } });
    return { id };
  });
}
