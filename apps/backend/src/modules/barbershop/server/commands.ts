import "server-only";
import { z } from "zod";
import { prisma } from "@/core/database/prisma";
import { AppError } from "@/core/auth/errors";
import type { TenantScope } from "@/core/auth/types";
import { audit } from "@/core/audit/audit";

const customerSchema = z.object({ name: z.string().trim().min(2).max(120), dni: z.union([z.string().trim().regex(/^\d{8}$/, "El DNI debe tener 8 dígitos."), z.literal("")]).optional(), phone: z.string().trim().max(30).optional(), email: z.union([z.string().email(), z.literal("")]).optional(), notes: z.string().trim().max(500).optional() });
const staffSchema = z.object({ name: z.string().trim().min(2).max(120), phone: z.string().trim().max(30).optional(), specialty: z.string().trim().max(120).optional(), commissionPct: z.coerce.number().int().min(0).max(100) });
const serviceSchema = z.object({ name: z.string().trim().min(2).max(120), category: z.string().trim().max(80).optional(), durationMinutes: z.coerce.number().int().min(10).max(480), price: z.coerce.number().positive().max(100000) });
const appointmentSchema = z.object({ customerId: z.string().min(1), staffId: z.string().min(1), serviceId: z.string().min(1), startsAt: z.coerce.date(), notes: z.string().trim().max(500).optional() });
const statusSchema = z.object({ status: z.enum(["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"]) });
const checkoutSchema = z.object({ paymentMethod: z.enum(["CASH", "CARD", "TRANSFER", "YAPE", "PLIN", "OTHER"]) });
const cashOpenSchema = z.object({ openingAmount: z.coerce.number().nonnegative().max(1000000) });
const scheduleSchema = z.object({ staffId: z.string().min(1), weekday: z.coerce.number().int().min(0).max(6), startsAt: z.string().regex(/^\d{2}:\d{2}$/), endsAt: z.string().regex(/^\d{2}:\d{2}$/) });
const activeValue = z.enum(["true", "false"]).transform((value) => value === "true");
const customerUpdateSchema = customerSchema.extend({ active: activeValue });
const staffUpdateSchema = staffSchema.extend({ active: activeValue });
const serviceUpdateSchema = serviceSchema.extend({ active: activeValue });
const rescheduleSchema = z.object({ staffId: z.string().min(1), serviceId: z.string().min(1), startsAt: z.coerce.date(), notes: z.string().trim().max(500).optional() });
const cashCloseSchema = z.object({ countedAmount: z.coerce.number().nonnegative().max(1000000) });

function parse<TSchema extends z.ZodTypeAny>(schema: TSchema, body: unknown): z.infer<TSchema> {
  const result = schema.safeParse(body);
  if (!result.success) throw new AppError("VALIDATION_ERROR", 400, "Revisa los datos ingresados.", result.error.flatten());
  return result.data;
}

async function owned<T extends { id: string }>(promise: Promise<T | null>, label: string): Promise<T> {
  const value = await promise;
  if (!value) throw new AppError("NOT_FOUND", 404, `${label} no existe en esta empresa o sucursal.`);
  return value;
}

async function assertDniAvailable(scope: TenantScope, dni: string | undefined, excludeId?: string) {
  if (!dni) return;
  const duplicate = await prisma.customer.findFirst({ where: { tenantId: scope.tenantId, dni, id: excludeId ? { not: excludeId } : undefined }, select: { id: true } });
  if (duplicate) throw new AppError("DUPLICATE_DNI", 409, "Ya existe un cliente con este DNI en la empresa.");
}

function minutesSinceMidnight(value: Date): number {
  return value.getHours() * 60 + value.getMinutes();
}

async function assertWithinStaffSchedule(scope: TenantScope, staffId: string, startsAt: Date, endsAt: Date) {
  if (startsAt.getTime() < Date.now()) {
    throw new AppError("APPOINTMENT_IN_PAST", 400, "La cita debe programarse en una fecha futura.");
  }
  if (startsAt.toDateString() !== endsAt.toDateString()) {
    throw new AppError("OUTSIDE_STAFF_SCHEDULE", 409, "La cita debe terminar dentro del horario del profesional.");
  }
  const schedule = await prisma.staffSchedule.findFirst({
    where: {
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      staffId,
      weekday: startsAt.getDay(),
      active: true,
    },
    select: { startsAt: true, endsAt: true },
  });
  const requestedStart = minutesSinceMidnight(startsAt);
  const requestedEnd = minutesSinceMidnight(endsAt);
  const scheduledStart = schedule ? Number(schedule.startsAt.slice(0, 2)) * 60 + Number(schedule.startsAt.slice(3, 5)) : -1;
  const scheduledEnd = schedule ? Number(schedule.endsAt.slice(0, 2)) * 60 + Number(schedule.endsAt.slice(3, 5)) : -1;
  if (!schedule || requestedStart < scheduledStart || requestedEnd > scheduledEnd) {
    throw new AppError("OUTSIDE_STAFF_SCHEDULE", 409, "El profesional no está disponible durante todo ese horario.");
  }
}

export async function handleBarbershopCommand(method: string, segments: string[], body: unknown, scope: TenantScope) {
  const [resource, id, action] = segments;
  if (method === "POST" && resource === "customers") {
    const input = parse(customerSchema, body);
    await assertDniAvailable(scope, input.dni);
    const entity = await prisma.customer.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, name: input.name, dni: input.dni || null, phone: input.phone || null, email: input.email || null, notes: input.notes || null } });
    await audit(scope, "CREATE", "Customer", entity.id);
    return { ok: true, id: entity.id, message: "Cliente creado correctamente." };
  }
  if (method === "PATCH" && resource === "customers" && id) {
    const input = parse(customerUpdateSchema, body);
    const customer = await owned(prisma.customer.findFirst({ where: { id, tenantId: scope.tenantId }, select: { id: true } }), "El cliente");
    await assertDniAvailable(scope, input.dni, customer.id);
    await prisma.customer.update({ where: { id: customer.id }, data: { name: input.name, dni: input.dni || null, phone: input.phone || null, email: input.email || null, notes: input.notes || null, active: input.active } });
    await audit(scope, "UPDATE", "Customer", customer.id, { active: input.active });
    return { ok: true, id: customer.id, message: "Cliente actualizado correctamente." };
  }
  if (method === "POST" && resource === "staff") {
    const input = parse(staffSchema, body);
    const entity = await prisma.staffMember.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, ...input, phone: input.phone || null, specialty: input.specialty || null } });
    await audit(scope, "CREATE", "StaffMember", entity.id);
    return { ok: true, id: entity.id, message: "Barbero creado correctamente." };
  }
  if (method === "PATCH" && resource === "staff" && id) {
    const input = parse(staffUpdateSchema, body);
    const staff = await owned(prisma.staffMember.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId }, select: { id: true } }), "El barbero");
    await prisma.staffMember.update({ where: { id: staff.id }, data: { name: input.name, phone: input.phone || null, specialty: input.specialty || null, commissionPct: input.commissionPct, active: input.active } });
    await audit(scope, "UPDATE", "StaffMember", staff.id, { active: input.active });
    return { ok: true, id: staff.id, message: "Profesional actualizado correctamente." };
  }
  if (method === "POST" && resource === "services") {
    const input = parse(serviceSchema, body);
    const entity = await prisma.service.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, name: input.name, category: input.category || null, durationMinutes: input.durationMinutes, priceCents: Math.round(input.price * 100) } });
    await audit(scope, "CREATE", "Service", entity.id);
    return { ok: true, id: entity.id, message: "Servicio creado correctamente." };
  }
  if (method === "PATCH" && resource === "services" && id) {
    const input = parse(serviceUpdateSchema, body);
    const service = await owned(prisma.service.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId }, select: { id: true } }), "El servicio");
    await prisma.service.update({ where: { id: service.id }, data: { name: input.name, category: input.category || null, durationMinutes: input.durationMinutes, priceCents: Math.round(input.price * 100), active: input.active } });
    await audit(scope, "UPDATE", "Service", service.id, { active: input.active });
    return { ok: true, id: service.id, message: "Servicio actualizado correctamente." };
  }
  if (method === "POST" && resource === "appointments" && !id) {
    const input = parse(appointmentSchema, body);
    const [customer, staff, service] = await Promise.all([
      owned(prisma.customer.findFirst({ where: { id: input.customerId, tenantId: scope.tenantId, active: true }, select: { id: true } }), "El cliente"),
      owned(prisma.staffMember.findFirst({ where: { id: input.staffId, tenantId: scope.tenantId, branchId: scope.branchId, active: true }, select: { id: true } }), "El barbero"),
      owned(prisma.service.findFirst({ where: { id: input.serviceId, tenantId: scope.tenantId, branchId: scope.branchId, active: true }, select: { id: true, durationMinutes: true, priceCents: true } }), "El servicio"),
    ]);
    const endsAt = new Date(input.startsAt.getTime() + service.durationMinutes * 60_000);
    await assertWithinStaffSchedule(scope, staff.id, input.startsAt, endsAt);
    const conflict = await prisma.appointment.findFirst({ where: { tenantId: scope.tenantId, branchId: scope.branchId, staffId: staff.id, status: { notIn: ["CANCELLED", "NO_SHOW"] }, startsAt: { lt: endsAt }, endsAt: { gt: input.startsAt } }, select: { id: true } });
    if (conflict) throw new AppError("SCHEDULE_CONFLICT", 409, "El barbero ya tiene una cita en ese horario.");
    const entity = await prisma.appointment.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, customerId: customer.id, staffId: staff.id, serviceId: service.id, startsAt: input.startsAt, endsAt, priceCents: service.priceCents, notes: input.notes || null } });
    await audit(scope, "CREATE", "Appointment", entity.id);
    return { ok: true, id: entity.id, message: "Cita guardada correctamente." };
  }
  if (method === "PATCH" && resource === "appointments" && id && action === "status") {
    const input = parse(statusSchema, body);
    const appointment = await owned(prisma.appointment.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId }, select: { id: true, status: true, sale: { select: { id: true } } } }), "La cita");
    if (appointment.sale || ["COMPLETED", "CANCELLED", "NO_SHOW"].includes(appointment.status)) throw new AppError("APPOINTMENT_CLOSED", 409, "La cita ya está cerrada y no admite cambios de estado.");
    if (input.status === "COMPLETED") throw new AppError("CHECKOUT_REQUIRED", 409, "Completa la cita mediante el flujo de cobro.");
    await prisma.appointment.update({ where: { id }, data: { status: input.status } });
    await audit(scope, "STATUS_CHANGE", "Appointment", id, { status: input.status });
    return { ok: true, message: "Estado de la cita actualizado." };
  }
  if (method === "PATCH" && resource === "appointments" && id && action === "reschedule") {
    const input = parse(rescheduleSchema, body);
    const appointment = await owned(prisma.appointment.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId, sale: null }, select: { id: true, status: true } }), "La cita");
    if (["COMPLETED", "CANCELLED", "NO_SHOW"].includes(appointment.status)) throw new AppError("APPOINTMENT_CLOSED", 409, "La cita ya está cerrada y no puede reprogramarse.");
    const [staff, service] = await Promise.all([
      owned(prisma.staffMember.findFirst({ where: { id: input.staffId, tenantId: scope.tenantId, branchId: scope.branchId, active: true }, select: { id: true } }), "El barbero"),
      owned(prisma.service.findFirst({ where: { id: input.serviceId, tenantId: scope.tenantId, branchId: scope.branchId, active: true }, select: { id: true, durationMinutes: true, priceCents: true } }), "El servicio"),
    ]);
    const endsAt = new Date(input.startsAt.getTime() + service.durationMinutes * 60_000);
    await assertWithinStaffSchedule(scope, staff.id, input.startsAt, endsAt);
    const conflict = await prisma.appointment.findFirst({ where: { id: { not: appointment.id }, tenantId: scope.tenantId, branchId: scope.branchId, staffId: staff.id, status: { notIn: ["CANCELLED", "NO_SHOW"] }, startsAt: { lt: endsAt }, endsAt: { gt: input.startsAt } }, select: { id: true } });
    if (conflict) throw new AppError("SCHEDULE_CONFLICT", 409, "El barbero ya tiene una cita en ese horario.");
    await prisma.appointment.update({ where: { id: appointment.id }, data: { staffId: staff.id, serviceId: service.id, startsAt: input.startsAt, endsAt, priceCents: service.priceCents, notes: input.notes || null, status: "PENDING" } });
    await audit(scope, "RESCHEDULE", "Appointment", appointment.id, { startsAt: input.startsAt.toISOString() });
    return { ok: true, id: appointment.id, message: "Cita reprogramada y devuelta a pendiente." };
  }
  if (method === "POST" && resource === "appointments" && id && action === "checkout") {
    const input = parse(checkoutSchema, body);
    const appointment = await owned(prisma.appointment.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId }, include: { sale: true } }), "La cita");
    if (appointment.sale) throw new AppError("ALREADY_PAID", 409, "Esta cita ya fue cobrada.");
    if (["COMPLETED", "CANCELLED", "NO_SHOW"].includes(appointment.status)) throw new AppError("APPOINTMENT_CLOSED", 409, "La cita está cerrada y no puede cobrarse.");
    const cash = await prisma.cashSession.findFirst({ where: { tenantId: scope.tenantId, branchId: scope.branchId, status: "OPEN" }, orderBy: { openedAt: "desc" } });
    if (!cash) throw new AppError("CASH_CLOSED", 409, "Abre una caja antes de registrar el cobro.");
    const sale = await prisma.$transaction(async (tx) => {
      const created = await tx.sale.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, customerId: appointment.customerId, appointmentId: appointment.id, cashSessionId: cash.id, code: `VTA-N-${Date.now().toString().slice(-7)}`, paymentMethod: input.paymentMethod, totalCents: appointment.priceCents } });
      await tx.appointment.update({ where: { id: appointment.id }, data: { status: "COMPLETED" } });
      await tx.cashSession.update({ where: { id: cash.id }, data: { expectedCents: { increment: appointment.priceCents } } });
      return created;
    });
    await audit(scope, "CHECKOUT", "Sale", sale.id, { appointmentId: appointment.id });
    return { ok: true, id: sale.id, message: "Cobro registrado y cita completada." };
  }
  if (method === "POST" && resource === "cash" && action === undefined) {
    const input = parse(cashOpenSchema, body);
    const existing = await prisma.cashSession.findFirst({ where: { tenantId: scope.tenantId, branchId: scope.branchId, status: "OPEN" } });
    if (existing) throw new AppError("CASH_ALREADY_OPEN", 409, "Ya existe una caja abierta.");
    const openingCents = Math.round(input.openingAmount * 100);
    const entity = await prisma.cashSession.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, openedById: scope.actorId, openingCents, expectedCents: openingCents } });
    await audit(scope, "OPEN", "CashSession", entity.id);
    return { ok: true, id: entity.id, message: "Caja abierta correctamente." };
  }
  if (method === "POST" && resource === "cash" && id && action === "close") {
    const input = parse(cashCloseSchema, body);
    const cash = await owned(prisma.cashSession.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId, status: "OPEN" }, select: { id: true, expectedCents: true } }), "La caja");
    const countedCents = Math.round(input.countedAmount * 100);
    await prisma.cashSession.update({ where: { id: cash.id }, data: { status: "CLOSED", countedCents, closedById: scope.actorId, closedAt: new Date() } });
    await audit(scope, "CLOSE", "CashSession", cash.id, { countedCents, differenceCents: countedCents - cash.expectedCents });
    return { ok: true, id: cash.id, message: `Caja cerrada. Diferencia: S/ ${((countedCents - cash.expectedCents) / 100).toFixed(2)}.` };
  }
  if (method === "POST" && resource === "schedules") {
    const input = parse(scheduleSchema, body);
    if (input.startsAt >= input.endsAt) throw new AppError("INVALID_SCHEDULE", 400, "La hora de fin debe ser posterior al inicio.");
    await owned(prisma.staffMember.findFirst({ where: { id: input.staffId, tenantId: scope.tenantId, branchId: scope.branchId }, select: { id: true } }), "El barbero");
    const entity = await prisma.staffSchedule.upsert({ where: { staffId_weekday: { staffId: input.staffId, weekday: input.weekday } }, update: { startsAt: input.startsAt, endsAt: input.endsAt, active: true }, create: { tenantId: scope.tenantId, branchId: scope.branchId, staffId: input.staffId, weekday: input.weekday, startsAt: input.startsAt, endsAt: input.endsAt } });
    await audit(scope, "UPSERT", "StaffSchedule", entity.id);
    return { ok: true, id: entity.id, message: "Horario actualizado." };
  }
  throw new AppError("NOT_FOUND", 404, "Operación de barbería no encontrada.");
}
