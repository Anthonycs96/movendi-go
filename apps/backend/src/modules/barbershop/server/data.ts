import "server-only";
import { prisma } from "@/core/database/prisma";
import type { TenantScope } from "@/core/auth/types";
import type { BarbershopData } from "../types";

export async function getBarbershopData(scope: TenantScope, section?: string | null): Promise<BarbershopData> {
  const needed = (...sections: string[]) => !section || sections.includes(section);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const [customers, staff, services, appointments, sales, cashSession] = await Promise.all([
    needed("dashboard", "clients", "appointments") ? prisma.customer.findMany({ where: { tenantId: scope.tenantId }, orderBy: [{ active: "desc" }, { createdAt: "desc" }], select: { id: true, name: true, dni: true, phone: true, email: true, notes: true, active: true, createdAt: true } }) : [],
    needed("dashboard", "team", "appointments") ? prisma.staffMember.findMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId }, orderBy: { name: "asc" }, include: { schedules: { where: { active: true }, orderBy: { weekday: "asc" }, select: { weekday: true, startsAt: true, endsAt: true } } } }) : [],
    needed("services", "appointments") ? prisma.service.findMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId }, orderBy: [{ active: "desc" }, { name: "asc" }], select: { id: true, name: true, category: true, durationMinutes: true, priceCents: true, active: true } }) : [],
    needed("dashboard", "appointments", "checkout") ? prisma.appointment.findMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId }, orderBy: { startsAt: "desc" }, take: 100, include: { customer: { select: { id: true, name: true, phone: true } }, staff: { select: { id: true, name: true } }, service: { select: { id: true, name: true } }, sale: { select: { id: true } } } }) : [],
    needed("dashboard", "checkout") ? prisma.sale.findMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId, appointmentId: { not: null } }, orderBy: { createdAt: "desc" }, take: 50, include: { customer: { select: { name: true } } } }) : [],
    needed("appointments", "checkout") ? prisma.cashSession.findFirst({ where: { tenantId: scope.tenantId, branchId: scope.branchId, status: "OPEN" }, orderBy: { openedAt: "desc" }, select: { id: true, balanceBasis: true, status: true, openingCents: true, expectedCents: true, openedAt: true } }) : null,
  ]);

  const todayAppointments = appointments.filter((item) => item.startsAt >= start && item.startsAt < end);
  const todayRevenueCents = sales.filter((item) => item.createdAt >= start && item.createdAt < end).reduce((sum, item) => sum + item.totalCents, 0);

  return {
    customers: customers.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
    staff: staff.map((item) => ({ id: item.id, name: item.name, phone: item.phone, specialty: item.specialty, commissionPct: item.commissionPct, active: item.active, schedules: item.schedules })),
    services,
    appointments: appointments.map((item) => ({ id: item.id, startsAt: item.startsAt.toISOString(), endsAt: item.endsAt.toISOString(), status: item.status, priceCents: item.priceCents, notes: item.notes, customer: item.customer, staff: item.staff, service: item.service, paid: Boolean(item.sale) })),
    sales: sales.map((item) => ({ id: item.id, code: item.code, paymentMethod: item.paymentMethod, totalCents: item.totalCents, createdAt: item.createdAt.toISOString(), customer: item.customer?.name ?? null })),
    cashSession: cashSession ? { ...cashSession, openedAt: cashSession.openedAt.toISOString() } : null,
    metrics: {
      todayAppointments: todayAppointments.length,
      confirmed: todayAppointments.filter((item) => item.status === "CONFIRMED").length,
      completed: todayAppointments.filter((item) => item.status === "COMPLETED").length,
      todayRevenueCents,
      activeCustomers: customers.filter((item) => item.active).length,
    },
  };
}
