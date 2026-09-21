import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/core/database/prisma";
import { AppError } from "@/core/auth/errors";
import type { TenantScope } from "@/core/auth/types";
import { salonLocalDateTime, type SalonHistory, type SalonReports } from "@movendi/contracts";
import { scoped, timezoneFor, instant } from "./schedule";
import type { CommercialSnapshot } from "@/modules/sales/public";

const pageNumber = (query: URLSearchParams) => Math.max(1, Math.min(1000000, Math.trunc(Number(query.get("page"))) || 1));
function legacyLines(snapshot: string | null): SalonHistory["sales"][number]["lines"] | null {
  if (!snapshot) return null;
  try {
    const value = JSON.parse(snapshot) as CommercialSnapshot;
    return value.lines.map((line) => ({ name: line.name, quantity: line.quantity, unitPriceCents: line.unitPriceCents, totalCents: line.totalCents - (line.discountCents ?? 0), staffName: null }));
  } catch { return null; }
}

export const salonSaleWhere = (scope: TenantScope): Prisma.SaleWhereInput => ({ ...scoped(scope), OR: [{ salonSaleId: { not: null } }, { appointmentId: { not: null } }] });
export async function getSalonHistory(scope: TenantScope, query: URLSearchParams, customerId?: string): Promise<SalonHistory> {
  const page = pageNumber(query);
  const q = query.get("q")?.trim().slice(0, 120);
  const where: Prisma.SaleWhereInput = { ...salonSaleWhere(scope), customerId, ...(q ? { AND: [{ OR: [{ code: { contains: q } }, { customer: { name: { contains: q } } }, { customer: { phone: { contains: q } } }] }] } : {}) };
  const [total, sales] = await Promise.all([prisma.sale.count({ where }), prisma.sale.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 30, skip: (page - 1) * 30, include: { customer: { select: { name: true } }, payments: true, salonSale: { include: { lines: true } }, appointment: { include: { service: true, staff: true } } } })]);
  return { total, page, sales: sales.map((s) => ({ id: s.id, code: s.code, status: s.status, refundable: Boolean(s.salonSaleId), totalCents: s.totalCents, discountCents: s.discountCents, promotionName: s.promotionName, createdAt: s.createdAt.toISOString(), customer: s.customer?.name ?? null, payments: s.payments.length ? s.payments.map((p) => ({ method: p.method, amountCents: p.amountCents })) : [{ method: s.paymentMethod, amountCents: s.totalCents }], lines: s.salonSale ? s.salonSale.lines.map((l) => ({ name: l.name, quantity: l.quantity, unitPriceCents: l.unitPriceCents, totalCents: l.netCents, staffName: l.staffName })) : legacyLines(s.commercialSnapshot) ?? (s.appointment ? [{ name: s.appointment.service.name, quantity: 1, unitPriceCents: s.totalCents, totalCents: s.totalCents, staffName: s.appointment.staff.name }] : []) })) };
}

export async function getCustomerHistory(scope: TenantScope, id: string, query: URLSearchParams) {
  const customer = await prisma.customer.findFirst({ where: { id, tenantId: scope.tenantId } });
  if (!customer) throw new AppError("NOT_FOUND", 404, "Cliente no encontrado.");
  const page = pageNumber(query);
  const where = { ...scoped(scope), customerId: id };
  const [history, visits, visitTotal, summary] = await Promise.all([
    getSalonHistory(scope, query, id),
    prisma.appointment.findMany({ where, take: 30, skip: (page - 1) * 30, orderBy: { startsAt: "desc" }, include: { service: { select: { name: true } }, staff: { select: { name: true } } } }),
    prisma.appointment.count({ where }),
    prisma.sale.aggregate({ where: { ...salonSaleWhere(scope), customerId: id, status: "PAID" }, _sum: { totalCents: true }, _count: true, _max: { createdAt: true } }),
  ]);
  return { customer, history, visits, visitTotal, summary: { spentCents: summary._sum.totalCents ?? 0, sales: summary._count, lastVisit: summary._max.createdAt } };
}

export async function getSalonReports(scope: TenantScope, period: string | null): Promise<SalonReports> {
  const timezone = await timezoneFor(prisma, scope), now = new Date();
  const today = salonLocalDateTime(now, timezone).slice(0, 10);
  const day = new Date(`${today}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() - (period === "1d" ? 0 : period === "7d" ? 6 : 29));
  const start = instant(`${day.toISOString().slice(0, 10)}T00:00`, timezone);
  const where = { ...salonSaleWhere(scope), status: "PAID", createdAt: { gte: start, lte: now } };
  const [summary, groupedLines, legacy, cancelled, noShow, payments, customers] = await Promise.all([
    prisma.sale.aggregate({ where, _sum: { totalCents: true, discountCents: true }, _count: true }),
    prisma.salonSaleLine.findMany({ where: { salonSale: { ...scoped(scope), sale: { status: "PAID", createdAt: { gte: start, lte: now } } } } }),
    prisma.sale.aggregate({ where: { ...where, salonSaleId: null }, _sum: { totalCents: true } }),
    prisma.appointment.count({ where: { ...scoped(scope), startsAt: { gte: start, lte: now }, status: "CANCELLED" } }),
    prisma.appointment.count({ where: { ...scoped(scope), startsAt: { gte: start, lte: now }, status: "NO_SHOW" } }),
    prisma.salePayment.groupBy({ by: ["method"], where: { sale: where }, _sum: { amountCents: true } }),
    prisma.customer.findMany({ where: { tenantId: scope.tenantId, active: true }, select: { id: true, name: true, phone: true, createdAt: true, sales: { where: { branchId: scope.branchId, status: "PAID", OR: [{ salonSaleId: { not: null } }, { appointmentId: { not: null } }] }, select: { createdAt: true, totalCents: true } } } }),
  ]);
  const workers = new Map<string, SalonReports["staff"][number]>(), services = new Map<string, SalonReports["services"][number]>(), products = new Map<string, SalonReports["products"][number]>();
  let costCents = 0, commissionCents = 0;
  for (const l of groupedLines) {
    costCents += l.costCents; commissionCents += l.commissionCents;
    if (l.staffId) { const worker = workers.get(l.staffId) ?? { id: l.staffId, name: l.staffName ?? "Profesional", services: 0, products: 0, revenueCents: 0, commissionCents: 0, pendingCents: 0 }; worker.services += l.serviceId ? l.quantity : 0; worker.products += l.itemId ? l.quantity : 0; worker.revenueCents += l.netCents; worker.commissionCents += l.commissionCents; worker.pendingCents += l.commissionPaidAt ? 0 : l.commissionCents; workers.set(l.staffId, worker); }
    const group = l.serviceId ? services : products, id = l.serviceId ?? l.itemId!;
    const entry = group.get(id) ?? { id, name: l.name, quantity: 0, revenueCents: 0 }; entry.quantity += l.quantity; entry.revenueCents += l.netCents; group.set(id, entry);
  }
  const revenueCents = summary._sum.totalCents ?? 0, legacyRevenueCents = legacy._sum.totalCents ?? 0;
  return { from: start.toISOString(), to: now.toISOString(), sales: summary._count, revenueCents, discountCents: summary._sum.discountCents ?? 0, costCents, commissionCents, marginCents: revenueCents - legacyRevenueCents - costCents - commissionCents, legacyRevenueCents, staff: [...workers.values()].sort((a, b) => b.revenueCents - a.revenueCents), services: [...services.values()].sort((a, b) => b.quantity - a.quantity), products: [...products.values()].sort((a, b) => b.quantity - a.quantity), payments: payments.map((p) => ({ method: p.method, amountCents: p._sum.amountCents ?? 0 })), cancelled, noShow, clients: customers.map((c) => { const last = c.sales.reduce<Date | null>((last, s) => !last || s.createdAt > last ? s.createdAt : last, null); return { id: c.id, name: c.name, phone: c.phone, visits: c.sales.length, spentCents: c.sales.reduce((sum, s) => sum + s.totalCents, 0), lastVisit: last?.toISOString() ?? null, segment: last && last.getTime() < now.getTime() - 60 * 86400000 ? "LOST" : c.createdAt >= start ? "NEW" : c.sales.length >= 3 ? "FREQUENT" : "OCCASIONAL" }; }) };
}

export async function getSalonCash(scope: TenantScope) {
  const sessions = await prisma.cashSession.findMany({ where: scoped(scope), orderBy: { openedAt: "desc" }, take: 30, include: { movements: { orderBy: { createdAt: "desc" } }, sales: { where: { status: "PAID" }, select: { payments: { select: { method: true, amountCents: true } } } } } });
  return { sessions: sessions.map((s) => ({ id: s.id, status: s.status, openedAt: s.openedAt, closedAt: s.closedAt, openingCents: s.openingCents, expectedCents: s.expectedCents, countedCents: s.countedCents, closingNote: s.closingNote, movements: s.movements.map((m) => ({ id: m.id, type: m.type, amountCents: m.amountCents, reason: m.reason, createdAt: m.createdAt })), payments: s.sales.flatMap((v) => v.payments) })) };
}
