import { refundView } from "@/modules/restaurant/server/refund-view";
import { fromLocal } from "@/modules/restaurant/server/business-day";
import { z } from "zod";
import { prisma } from "@/core/database/prisma";
import { AppError, errorResponse } from "@/core/auth/errors";
import { requireSession, requireTenantScope } from "@/core/auth/session";
import { assertRestaurantModule } from "@/modules/restaurant/server/access";

export const dynamic = "force-dynamic";
const querySchema = z.object({ kind: z.enum(["orders", "sales", "cash", "movements"]).default("sales"), page: z.coerce.number().int().min(1).max(100000).default(1), q: z.string().trim().max(100).default(""), from: z.string().date().optional(), to: z.string().date().optional(), cashId: z.string().max(100).optional() });

export async function GET(request: Request) {
  try {
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", 400, "Revisa las fechas y los filtros del historial.");
    const { kind, page, q, from, to, cashId } = parsed.data;
    if (from && to && from > to) throw new AppError("INVALID_RANGE", 400, "La fecha inicial debe ser anterior a la final.");
    const permission = kind === "orders" ? "restaurant:orders:read" : "restaurant:cash:write";
    const session = await requireSession(permission);
    if (session.tenantType !== "RESTAURANT") throw new AppError("MODULE_ACCESS_DENIED", 403, "Este historial pertenece a Restaurante.");
    assertRestaurantModule(session, kind === "orders" ? "orders" : "checkout");
    const scope = await requireTenantScope(permission);
    const base = { tenantId: scope.tenantId, branchId: scope.branchId };
    // Interpret the selected dates in the business timezone, including daylight-saving changes.
    const dates = { ...(from ? { gte: fromLocal(new Date(`${from}T00:00:00Z`), session.tenantTimezone) } : {}), ...(to ? { lt: fromLocal(new Date(new Date(`${to}T00:00:00Z`).getTime() + 86400000), session.tenantTimezone) } : {}) };
    const paging = { take: 25, skip: (page - 1) * 25 };
    if (kind === "sales") {
      const where = { ...base, orderId: { not: null }, createdAt: dates, ...(q ? { code: { contains: q } } : {}) };
      const [total, rows] = await prisma.$transaction([prisma.sale.count({ where }), prisma.sale.findMany({ where, ...paging, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, code: true, status: true, totalCents: true, createdAt: true, paymentMethod: true, refund: { select: { id: true, reason: true, creditStatus: true, creditError: true, creditResponse: true } }, electronicDocument: { select: { status: true, kind: true, series: true, number: true, lastError: true, pdfUrl: true } } } })]);
      return Response.json({ kind, page, total, pageSize: 25, rows: rows.map((row) => ({ ...row, refund: refundView(row.refund) })) });
    }
    if (kind === "orders") {
      const where = { ...base, createdAt: dates, ...(q ? { code: { contains: q } } : {}) };
      const [total, rows] = await prisma.$transaction([prisma.restaurantOrder.count({ where }), prisma.restaurantOrder.findMany({ where, ...paging, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, code: true, status: true, totalCents: true, createdAt: true, notes: true, items: { select: { name: true, quantity: true, status: true, preparationAreaName: true } } } })]);
      return Response.json({ kind, page, total, pageSize: 25, rows });
    }
    if (kind === "cash") {
      const where = { ...base, openedAt: dates };
      const [total, rows] = await prisma.$transaction([prisma.cashSession.count({ where }), prisma.cashSession.findMany({ where, ...paging, orderBy: [{ openedAt: "desc" }, { id: "desc" }], select: { id: true, status: true, openingCents: true, expectedCents: true, countedCents: true, openedAt: true, closedAt: true, openedBy: { select: { name: true } }, closedBy: { select: { name: true } } } })]);
      return Response.json({ kind, page, total, pageSize: 25, rows });
    }
    const where = { ...base, createdAt: dates, ...(cashId ? { cashSessionId: cashId } : {}), ...(q ? { reason: { contains: q } } : {}) };
    const [total, rows] = await prisma.$transaction([prisma.cashMovement.count({ where }), prisma.cashMovement.findMany({ where, ...paging, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, type: true, amountCents: true, reason: true, createdAt: true, createdBy: { select: { name: true } } } })]);
    return Response.json({ kind, page, total, pageSize: 25, rows });
  } catch (error) { return errorResponse(error); }
}
