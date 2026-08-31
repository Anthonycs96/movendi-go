import "server-only";
import { prisma } from "@/core/database/prisma";
import { AppError } from "@/core/auth/errors";
import type { TenantScope } from "@/core/auth/types";

export interface PromotionLine {
  productId: string;
  categoryId: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
}

function localClock(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(value("weekday"));
  return { weekday, time: `${value("hour")}:${value("minute")}` };
}

function eligibleSubtotal(promotion: { scope: string; categoryId: string | null; productId: string | null }, lines: PromotionLine[]) {
  if (promotion.scope === "PRODUCT") return lines.filter((line) => line.productId === promotion.productId).reduce((sum, line) => sum + line.totalCents, 0);
  if (promotion.scope === "CATEGORY") return lines.filter((line) => line.categoryId === promotion.categoryId).reduce((sum, line) => sum + line.totalCents, 0);
  return lines.reduce((sum, line) => sum + line.totalCents, 0);
}

export async function calculatePromotion(scope: TenantScope, lines: PromotionLine[], requestedCode?: string | null) {
  const now = new Date();
  const normalizedCode = requestedCode?.trim().toUpperCase() || null;
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: scope.tenantId }, select: { timezone: true } });
  const promotions = await prisma.promotion.findMany({
    where: {
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      active: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
      ...(normalizedCode ? { code: normalizedCode } : { automatic: true }),
    },
  });
  if (normalizedCode && !promotions.length) throw new AppError("PROMOTION_NOT_FOUND", 400, "El código promocional no existe, está inactivo o venció.");

  const clock = localClock(now, tenant.timezone);
  const subtotalCents = lines.reduce((sum, line) => sum + line.totalCents, 0);
  const candidates = promotions.flatMap((promotion) => {
    const weekdays = promotion.weekdays.split(",").map(Number);
    if (!weekdays.includes(clock.weekday)) return [];
    if (promotion.startTime && clock.time < promotion.startTime) return [];
    if (promotion.endTime && clock.time > promotion.endTime) return [];
    if (subtotalCents < promotion.minSubtotalCents) return [];
    const eligibleCents = eligibleSubtotal(promotion, lines);
    if (eligibleCents <= 0) return [];
    let discountCents = 0;
    if (promotion.kind === "PERCENT") discountCents = Math.round(eligibleCents * promotion.value / 100);
    else if (promotion.kind === "FIXED") discountCents = Math.min(promotion.value, eligibleCents);
    else if (promotion.kind === "QUANTITY") {
      const eligibleLines = lines.filter((line) => promotion.scope === "ORDER" || (promotion.scope === "CATEGORY" && line.categoryId === promotion.categoryId) || (promotion.scope === "PRODUCT" && line.productId === promotion.productId));
      const eligibleQuantity = eligibleLines.reduce((sum, line) => sum + line.quantity, 0);
      let freeUnits = Math.floor(eligibleQuantity / promotion.buyQuantity) * promotion.freeQuantity;
      const cheapest = [...eligibleLines].sort((a, b) => a.unitPriceCents - b.unitPriceCents);
      for (const line of cheapest) {
        const units = Math.min(freeUnits, line.quantity);
        discountCents += units * line.unitPriceCents;
        freeUnits -= units;
        if (freeUnits === 0) break;
      }
    }
    if (promotion.maxDiscountCents !== null) discountCents = Math.min(discountCents, promotion.maxDiscountCents);
    discountCents = Math.max(0, Math.min(discountCents, subtotalCents));
    return [{ promotion, discountCents }];
  });
  if (normalizedCode && !candidates.length) throw new AppError("PROMOTION_NOT_APPLICABLE", 400, "La promoción no aplica a este pedido, horario o monto.");
  const best = candidates.sort((a, b) => b.discountCents - a.discountCents)[0];
  return {
    subtotalCents,
    discountCents: best?.discountCents ?? 0,
    totalCents: subtotalCents - (best?.discountCents ?? 0),
    promotion: best?.promotion ?? null,
  };
}
