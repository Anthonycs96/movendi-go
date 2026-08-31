import "server-only";
import { audit } from "@/core/audit/audit";
import { AppError } from "@/core/auth/errors";
import { prisma } from "@/core/database/prisma";
import { assertRange, owned, parse } from "../command-helpers";
import { driverSchema, driverUpdateSchema, leaveSchema, workLogSchema } from "../command-schemas";
import type { TransportCommandHandler } from "../command-types";
import { assertTenantConfigured, getTransportConfiguration } from "../configuration";

export const handleWorkforceCommand: TransportCommandHandler = async (method, segments, body, scope) => {
  const [resource, id, action] = segments;

  if (method === "POST" && resource === "drivers") {
    const input = parse(driverSchema, body);
    const configuration = await getTransportConfiguration(scope.tenantId);
    await assertTenantConfigured(scope.tenantId, configuration.drivers.driverTypes, input.type, "El tipo de conductor");
    await assertTenantConfigured(scope.tenantId, configuration.drivers.licenseClasses, input.licenseClass, "La clase de licencia");
    const entity = await prisma.transportDriver.create({ data: { tenantId: scope.tenantId, ...input, phone: input.phone || null, email: input.email || null, hireDate: input.hireDate } });
    await audit(scope, "CREATE", "TransportDriver", entity.id);
    return { ok: true, id: entity.id, message: "Conductor registrado." };
  }

  if (method === "PATCH" && resource === "drivers" && id) {
    const input = parse(driverUpdateSchema, body);
    const configuration = await getTransportConfiguration(scope.tenantId);
    await assertTenantConfigured(scope.tenantId, configuration.drivers.driverTypes, input.type, "El tipo de conductor");
    await assertTenantConfigured(scope.tenantId, configuration.drivers.licenseClasses, input.licenseClass, "La clase de licencia");
    await assertTenantConfigured(scope.tenantId, configuration.drivers.driverStatuses, input.status, "El estado de conductor");
    await owned(prisma.transportDriver.findFirst({ where: { id, tenantId: scope.tenantId }, select: { id: true } }), "El conductor");
    await prisma.transportDriver.update({ where: { id }, data: { ...input, phone: input.phone || null, email: input.email || null, hireDate: input.hireDate } });
    await audit(scope, "UPDATE", "TransportDriver", id);
    return { ok: true, id, message: "Conductor actualizado." };
  }

  if (method === "POST" && resource === "leaves") {
    const input = parse(leaveSchema, body);
    assertRange(input.startsAt, input.endsAt);
    await owned(prisma.transportDriver.findFirst({ where: { id: input.driverId, tenantId: scope.tenantId, active: true }, select: { id: true } }), "El conductor");
    const overlap = await prisma.transportDriverLeave.findFirst({ where: { tenantId: scope.tenantId, driverId: input.driverId, status: { not: "CANCELLED" }, startsAt: { lt: input.endsAt }, endsAt: { gt: input.startsAt } } });
    if (overlap) throw new AppError("LEAVE_CONFLICT", 409, "El conductor ya tiene una ausencia en ese periodo.");
    const assignment = await prisma.transportAssignment.findFirst({ where: { tenantId: scope.tenantId, status: "ACTIVE", startsAt: { lt: input.endsAt }, endsAt: { gt: input.startsAt }, OR: [{ driverId: input.driverId }, { secondDriverId: input.driverId }] } });
    if (assignment) throw new AppError("ASSIGNMENT_CONFLICT", 409, "Existe un viaje asignado durante ese periodo.");
    const entity = await prisma.transportDriverLeave.create({ data: { tenantId: scope.tenantId, ...input, reason: input.reason || null } });
    await audit(scope, "CREATE", "TransportDriverLeave", entity.id);
    return { ok: true, id: entity.id, message: "Descanso o ausencia programado." };
  }

  if (method === "PATCH" && resource === "leaves" && id && action === "cancel") {
    await owned(prisma.transportDriverLeave.findFirst({ where: { id, tenantId: scope.tenantId }, select: { id: true } }), "La ausencia");
    await prisma.transportDriverLeave.update({ where: { id }, data: { status: "CANCELLED" } });
    await audit(scope, "CANCEL", "TransportDriverLeave", id);
    return { ok: true, id, message: "Ausencia cancelada." };
  }

  if (method === "POST" && resource === "work-logs") {
    const input = parse(workLogSchema, body);
    if (input.clockInAt && input.clockOutAt && input.clockOutAt <= input.clockInAt) throw new AppError("INVALID_WORK_LOG", 400, "La salida debe ser posterior al ingreso.");
    await owned(prisma.transportDriver.findFirst({ where: { id: input.driverId, tenantId: scope.tenantId }, select: { id: true } }), "El conductor");
    const day = new Date(input.workDate);
    day.setHours(0, 0, 0, 0);
    const entity = await prisma.transportWorkLog.upsert({ where: { driverId_workDate: { driverId: input.driverId, workDate: day } }, update: { scheduledType: input.scheduledType, clockInAt: input.clockInAt, clockOutAt: input.clockOutAt, status: input.status, notes: input.notes || null }, create: { tenantId: scope.tenantId, driverId: input.driverId, workDate: day, scheduledType: input.scheduledType, clockInAt: input.clockInAt, clockOutAt: input.clockOutAt, status: input.status, notes: input.notes || null } });
    await audit(scope, "UPSERT", "TransportWorkLog", entity.id);
    return { ok: true, id: entity.id, message: "Jornada registrada." };
  }

  return null;
};
