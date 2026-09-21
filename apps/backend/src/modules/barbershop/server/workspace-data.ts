import "server-only";
import { prisma } from "@/core/database/prisma";
import { hasPermission } from "@/core/auth/permissions";
import type { TenantScope } from "@/core/auth/types";
import { salonLocalDateTime, type BarbershopData } from "@movendi/contracts";
import { instant, scoped, timezoneFor } from "./schedule";
import { salonSaleWhere } from "./queries";

export async function getBarbershopData(scope: TenantScope, section?: string | null): Promise<BarbershopData> {
  const needed = (...sections: string[]) => !section || sections.includes(section);
  const can = (permission: string) => hasPermission(scope.permissions, permission);
  const timezone = await timezoneFor(prisma, scope), today = salonLocalDateTime(new Date(), timezone).slice(0, 10);
  const tomorrow = new Date(`${today}T12:00:00Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const start = instant(`${today}T00:00`, timezone), end = instant(`${tomorrow.toISOString().slice(0, 10)}T00:00`, timezone);
  const [customers, staff, services, appointments, sales, cashSession, products, stockItems, blocks, promotions, dayCounts, revenue, activeCustomers, tenant] = await Promise.all([
    needed("clients", "appointments", "checkout") && (can("customers:read") || can("barbershop:cash:write") || can("barbershop:appointments:read")) ? prisma.customer.findMany({ where: { tenantId: scope.tenantId }, orderBy: [{ active: "desc" }, { name: "asc" }], select: { id: true, name: true, dni: true, phone: true, email: true, notes: true, active: true, createdAt: true } }) : [],
    needed("team", "appointments", "checkout", "services", "dashboard") ? prisma.staffMember.findMany({ where: scoped(scope), orderBy: { name: "asc" }, include: { schedules: { where: { active: true }, orderBy: { weekday: "asc" }, select: { weekday: true, startsAt: true, endsAt: true } } } }) : [],
    needed("services", "appointments", "checkout", "dashboard") ? prisma.service.findMany({ where: scoped(scope), orderBy: [{ active: "desc" }, { name: "asc" }], include: { eligibleStaff: { select: { staffId: true } }, supplies: { select: { itemId: true, quantity: true } } } }) : [],
    needed("dashboard", "appointments", "checkout") ? prisma.appointment.findMany({ where: { ...scoped(scope), startsAt: section ? { gte: new Date(start.getTime() - 7 * 86400000), lt: new Date(start.getTime() + 31 * 86400000) } : undefined }, orderBy: { startsAt: "asc" }, include: { customer: { select: { id: true, name: true, phone: true } }, staff: { select: { id: true, name: true } }, service: { select: { id: true, name: true } }, sale: { select: { id: true } } } }) : [],
    needed("checkout") && can("barbershop:cash:write") ? prisma.sale.findMany({ where: salonSaleWhere(scope), orderBy: { createdAt: "desc" }, take: 30, include: { customer: { select: { name: true } } } }) : [],
    needed("dashboard", "appointments", "checkout") && can("barbershop:cash:write") ? prisma.cashSession.findFirst({ where: { ...scoped(scope), status: "OPEN" }, orderBy: { openedAt: "desc" }, select: { id: true, balanceBasis: true, status: true, openingCents: true, expectedCents: true, openedAt: true } }) : null,
    needed("services", "checkout", "appointments") ? prisma.salonProduct.findMany({ where: scoped(scope), include: { item: true }, orderBy: { item: { name: "asc" } } }) : [],
    needed("services") && can("services:write") ? prisma.inventoryItem.findMany({ where: { ...scoped(scope), active: true }, select: { kind: true, id: true, name: true, sku: true, stock: true, unit: true } }) : [],
    needed("team", "appointments") ? prisma.staffTimeBlock.findMany({ where: { ...scoped(scope), active: true, endsAt: { gte: start } }, orderBy: { startsAt: "asc" } }) : [],
    needed("services", "checkout", "appointments") ? prisma.promotion.findMany({ where: { ...scoped(scope), scope: "SALON" }, orderBy: { name: "asc" } }) : [],
    prisma.appointment.groupBy({ by: ["status"], where: { ...scoped(scope), startsAt: { gte: start, lt: end } }, _count: true }),
    can("barbershop:cash:write") || can("barbershop:reports:read") ? prisma.sale.aggregate({ where: { ...salonSaleWhere(scope), status: "PAID", createdAt: { gte: start, lt: end } }, _sum: { totalCents: true } }) : null,
    can("customers:read") ? prisma.customer.count({ where: { tenantId: scope.tenantId, active: true } }) : 0,
    prisma.tenant.findUniqueOrThrow({ where: { id: scope.tenantId }, select: { paymentMethods: true } }),
  ]);
  const showCommission = can("barbershop:reports:read") || can("barbershop:team:write");
  return {
    timezone, permissions: scope.permissions, paymentMethods: JSON.parse(tenant.paymentMethods),
    customers: customers.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
    staff: staff.map((s) => ({ id: s.id, name: s.name, phone: s.phone, specialty: s.specialty, commissionPct: showCommission ? s.commissionPct : 0, commissionFixedCents: showCommission ? s.commissionFixedCents : null, productCommissionPct: showCommission ? s.productCommissionPct : 0, productCommissionFixedCents: showCommission ? s.productCommissionFixedCents : null, active: s.active, schedules: s.schedules })),
    services: services.map((s) => ({ id: s.id, name: s.name, category: s.category, durationMinutes: s.durationMinutes, priceCents: s.priceCents, active: s.active, staffIds: s.eligibleStaff.map((e) => e.staffId), supplies: can("services:write") ? s.supplies : [], commissionPct: showCommission ? s.commissionPct : null, commissionFixedCents: showCommission ? s.commissionFixedCents : null })),
    appointments: appointments.map((a) => ({ id: a.id, startsAt: a.startsAt.toISOString(), endsAt: a.endsAt.toISOString(), status: a.status, priceCents: a.priceCents, notes: a.notes, customer: a.customer, staff: a.staff, service: a.service, paid: Boolean(a.sale) })),
    sales: sales.map((s) => ({ id: s.id, code: s.code, paymentMethod: s.paymentMethod, totalCents: s.totalCents, createdAt: s.createdAt.toISOString(), customer: s.customer?.name ?? null })),
    cashSession: cashSession ? { ...cashSession, openedAt: cashSession.openedAt.toISOString() } : null,
    products: products.map((p) => ({ id: p.id, itemId: p.itemId, name: p.item.name, sku: p.item.sku, stock: p.item.stock, priceCents: p.priceCents, active: p.active && p.item.active })), stockItems,
    blocks: blocks.map((b) => ({ id: b.id, staffId: b.staffId, startsAt: b.startsAt.toISOString(), endsAt: b.endsAt.toISOString(), reason: b.reason })),
    promotions: promotions.map((p) => ({ id: p.id, name: p.name, kind: p.kind, value: p.value, startsAt: p.startsAt?.toISOString() ?? null, endsAt: p.endsAt?.toISOString() ?? null, active: p.active })),
    metrics: { todayAppointments: dayCounts.reduce((sum, c) => sum + c._count, 0), confirmed: dayCounts.find((c) => c.status === "CONFIRMED")?._count ?? 0, completed: dayCounts.find((c) => c.status === "COMPLETED")?._count ?? 0, todayRevenueCents: revenue?._sum.totalCents ?? 0, activeCustomers },
  };
}
