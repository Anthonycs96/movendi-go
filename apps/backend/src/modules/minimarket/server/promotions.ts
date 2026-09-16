import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { TenantScope } from "@/core/auth/types";
import { AppError } from "@/core/auth/errors";
import { prisma } from "@/core/database/prisma";
import { lineAmounts } from "../domain/retail";
import { promotionalPrice } from "../domain/promotions";
import { scoped, retailOperation } from "./service";
import { key, cents, amount as quantity } from "./schemas";

export const promotionSchema = z.object({ idempotencyKey: key, name: z.string().trim().min(1).max(100), kind: z.enum(["SPECIAL_PRICE", "PERCENT", "FIXED", "2X1", "3X2"]), value: cents.default(0), retailProductId: z.string().min(1), retailPresentationId: z.string().min(1).nullable().default(null), priority: z.number().int().min(0).max(1000).default(0), minQuantity: quantity.default(1), startsAt: z.string().datetime().nullable().default(null), endsAt: z.string().datetime().nullable().default(null), active: z.boolean().default(true) }).superRefine((p, ctx) => {
  if (p.kind === "PERCENT" && p.value > 100) ctx.addIssue({ code: "custom", message: "El porcentaje no puede superar 100." });
  if (p.startsAt && p.endsAt && p.startsAt >= p.endsAt) ctx.addIssue({ code: "custom", message: "El fin debe ser posterior al inicio." });
});
export async function savePromotion(scope: TenantScope, input: z.infer<typeof promotionSchema>, id?: string) {
  return retailOperation(scope, "PROMOTION_SAVE", { ...input, id }, async (tx) => {
    const product = await tx.retailProduct.findFirst({ where: { id: input.retailProductId, ...scoped(scope) } });
    if (!product || (input.retailPresentationId && !await tx.retailPresentation.findFirst({ where: { id: input.retailPresentationId, productId: product.id, ...scoped(scope) } }))) throw new AppError("NOT_FOUND", 404, "Producto o presentación no disponible en esta sucursal.");
    const { idempotencyKey: ignored, ...values } = input; void ignored;
    const data = { ...values, scope: "RETAIL", automatic: true, startsAt: input.startsAt ? new Date(input.startsAt) : null, endsAt: input.endsAt ? new Date(input.endsAt) : null };
    if (id) { const result = await tx.promotion.updateMany({ where: { id, ...scoped(scope), scope: "RETAIL" }, data }); if (!result.count) throw new AppError("NOT_FOUND", 404, "Promoción no encontrada."); return { id }; }
    return { id: (await tx.promotion.create({ data: { ...scoped(scope), ...data } })).id };
  });
}
export function activePromotions(tx: Pick<Prisma.TransactionClient, "promotion">, scope: TenantScope, now = new Date()) {
  return tx.promotion.findMany({ where: { ...scoped(scope), scope: "RETAIL", active: true, automatic: true, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] } });
}
export const quoteSchema = z.object({ lines: z.array(z.object({ presentationId: z.string().min(1), quantity })).min(1).max(100) });
export async function quoteRetail(scope: TenantScope, input: z.infer<typeof quoteSchema>) {
  const rules = await activePromotions(prisma, scope);
  const presentations = await prisma.retailPresentation.findMany({ where: { ...scoped(scope), id: { in: input.lines.map((l) => l.presentationId) }, active: true, product: { ...scoped(scope), item: { active: true } } } });
  const lines = input.lines.map((line) => {
    const row = presentations.find((p) => p.id === line.presentationId);
    if (!row) throw new AppError("NOT_FOUND", 404, "Una presentación ya no está disponible.");
    lineAmounts(row, line.quantity);
    return { presentationId: row.id, ...promotionalPrice({ ...row, quantity: line.quantity }, rules) };
  });
  return { lines, totalCents: lines.reduce((sum, l) => sum + l.totalCents, 0), discountCents: lines.reduce((sum, l) => sum + l.discountCents, 0) };
}
