import "server-only";
import { audit } from "@/core/audit/audit";
import { AppError } from "@/core/auth/errors";
import { prisma } from "@/core/database/prisma";
import { assertDocumentValid, assertRange, owned, parse, tripTransitions } from "../command-helpers";
import { assignmentSchema, incidentResolveSchema, incidentSchema, operationSchema, trackingSchema, tripOperationSchema, tripSchema, tripStatusSchema } from "../command-schemas";
import type { TransportCommandHandler } from "../command-types";
import { scheduledTypeAt } from "../schedule";
import { assertRequiredTransportDocuments, assertTenantConfigured, getTransportConfiguration, hasStoredTransportConfiguration } from "../configuration";

type AssignmentDriver = {
  id: string;
  licenseDueAt: Date;
  workCycleAnchor: Date;
  workDays: number;
  restDays: number;
};

async function assertDriverReady(tenantId: string, driver: AssignmentDriver, startsAt: Date, endsAt: Date, role: "piloto" | "segundo piloto") {
  if (driver.licenseDueAt < endsAt) throw new AppError("DRIVER_LICENSE_EXPIRED", 409, `La licencia del ${role} no estará vigente durante todo el viaje.`);
  if (scheduledTypeAt(driver.workCycleAnchor, driver.workDays, driver.restDays, startsAt) === "REST") throw new AppError("DRIVER_SCHEDULED_REST", 409, `El ${role} tiene descanso programado en la fecha del viaje.`);
  const leave = await prisma.transportDriverLeave.findFirst({ where: { tenantId, driverId: driver.id, status: { in: ["PLANNED", "APPROVED"] }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } });
  if (leave) throw new AppError("DRIVER_ON_LEAVE", 409, `El ${role} tiene una ausencia durante el viaje.`);
  await assertDocumentValid(tenantId, "DRIVER", driver.id, startsAt);
}

async function assertDriverRest(tenantId: string, tripId: string, driverId: string, startsAt: Date, endsAt: Date, minRestHours: number) {
  if (minRestHours <= 0) return;
  const driverFilter = { OR: [{ driverId }, { secondDriverId: driverId }] };
  const [previous, next] = await Promise.all([
    prisma.transportAssignment.findFirst({ where: { tenantId, tripId: { not: tripId }, endsAt: { lte: startsAt }, ...driverFilter }, orderBy: { endsAt: "desc" }, select: { endsAt: true } }),
    prisma.transportAssignment.findFirst({ where: { tenantId, tripId: { not: tripId }, startsAt: { gte: endsAt }, ...driverFilter }, orderBy: { startsAt: "asc" }, select: { startsAt: true } }),
  ]);
  const requiredMs = minRestHours * 3_600_000;
  if ((previous && startsAt.getTime() - previous.endsAt.getTime() < requiredMs) || (next && next.startsAt.getTime() - endsAt.getTime() < requiredMs)) {
    throw new AppError("DRIVER_REST_REQUIRED", 409, `El conductor requiere al menos ${minRestHours} horas de descanso entre asignaciones.`);
  }
}

export const handleOperationsCommand: TransportCommandHandler = async (method, segments, body, scope) => {
  const [resource, id, action] = segments;

  if (method === "POST" && resource === "operations" && !id) {
    const input = parse(operationSchema, body);
    const configuration = await getTransportConfiguration(scope.tenantId);
    assertRange(input.plannedStartAt, input.plannedEndAt, true);
    const customer = input.customerId
      ? await owned(prisma.transportParty.findFirst({ where: { id: input.customerId, tenantId: scope.tenantId, kind: "CUSTOMER", active: true }, select: { id: true } }), "El cliente")
      : null;
    const code = `${configuration.general.operationPrefix}-${new Date().getFullYear()}-${String((await prisma.transportOperation.count({ where: { tenantId: scope.tenantId } })) + 1).padStart(5, "0")}`;
    const entity = await prisma.transportOperation.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, code, name: input.name, customerId: customer?.id ?? null, plannedStartAt: input.plannedStartAt, plannedEndAt: input.plannedEndAt, description: input.description || null, notes: input.notes || null } });
    await audit(scope, "CREATE", "TransportOperation", entity.id);
    return { ok: true, id: entity.id, message: `Operación ${code} creada sin requerir unidades ni conductores.` };
  }

  if (method === "POST" && resource === "trips" && !id) {
    const input = parse(tripSchema, body);
    const configuration = await getTransportConfiguration(scope.tenantId);
    await assertTenantConfigured(scope.tenantId, configuration.operations.serviceTypes, input.serviceType, "El tipo de servicio");
    await assertTenantConfigured(scope.tenantId, configuration.operations.priorities, input.priority, "La prioridad");
    assertRange(input.scheduledStartAt, input.scheduledEndAt, true);
    const [customer, route, operation] = await Promise.all([
      owned(prisma.transportParty.findFirst({ where: { id: input.customerId, tenantId: scope.tenantId, kind: "CUSTOMER", active: true }, select: { id: true } }), "El cliente"),
      owned(prisma.transportRoute.findFirst({ where: { id: input.routeId, tenantId: scope.tenantId, active: true }, select: { id: true } }), "La ruta"),
      input.operationId ? owned(prisma.transportOperation.findFirst({ where: { id: input.operationId, tenantId: scope.tenantId, branchId: scope.branchId, status: { in: ["PLANNED", "IN_PROGRESS"] } }, select: { id: true } }), "La operación") : Promise.resolve(null),
    ]);
    const code = `${configuration.general.tripPrefix}-${new Date().getFullYear()}-${String((await prisma.transportTrip.count({ where: { tenantId: scope.tenantId } })) + 1).padStart(5, "0")}`;
    const entity = await prisma.transportTrip.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, code, operationId: operation?.id ?? null, customerId: customer.id, routeId: route.id, serviceType: input.serviceType, cargoDescription: input.cargoDescription, cargoWeightKg: input.cargoWeightKg ?? null, scheduledStartAt: input.scheduledStartAt, scheduledEndAt: input.scheduledEndAt, priority: input.priority, referenceNo: input.referenceNo || null, notes: input.notes || null, freightCents: input.freight, budgetCents: input.budget } });
    await audit(scope, "CREATE", "TransportTrip", entity.id);
    return { ok: true, id: entity.id, message: `Viaje ${code} creado.` };
  }

  if (method === "PATCH" && resource === "trips" && id && action === "status") {
    const input = parse(tripStatusSchema, body);
    const configuration = await getTransportConfiguration(scope.tenantId);
    const storedConfiguration = await hasStoredTransportConfiguration(scope.tenantId);
    const trip = await owned(prisma.transportTrip.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId }, include: { assignments: { where: { status: "ACTIVE" } } } }), "El viaje");
    const currentStatus = configuration.operations.tripStatuses.find((item) => item.key === trip.status && item.active);
    if (storedConfiguration ? !currentStatus?.allowedNext.includes(input.status) : !tripTransitions[trip.status]?.includes(input.status)) throw new AppError("INVALID_STATUS_TRANSITION", 409, `No se puede cambiar de ${trip.status} a ${input.status} según el flujo configurado.`);
    if (["ASSIGNED", "IN_TRANSIT"].includes(input.status) && !trip.assignments.length) throw new AppError("ASSIGNMENT_REQUIRED", 409, "Asigna conductor y vehículo antes de continuar.");
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.transportTrip.update({ where: { id }, data: { status: input.status, notes: input.notes ?? trip.notes, actualStartAt: input.status === "IN_TRANSIT" ? now : trip.actualStartAt, actualEndAt: input.status === "DELIVERED" ? now : trip.actualEndAt } });
      if (["DELIVERED", "CANCELLED"].includes(input.status)) {
        await tx.transportAssignment.updateMany({ where: { tripId: id, status: "ACTIVE" }, data: { status: "RELEASED", releasedAt: now } });
        for (const assignment of trip.assignments) {
          await tx.transportVehicle.update({ where: { id: assignment.vehicleId }, data: { status: "AVAILABLE" } });
          await tx.transportDriver.update({ where: { id: assignment.driverId }, data: { status: "AVAILABLE" } });
          if (assignment.secondDriverId) await tx.transportDriver.update({ where: { id: assignment.secondDriverId }, data: { status: "AVAILABLE" } });
          if (assignment.trailerId) await tx.transportTrailer.update({ where: { id: assignment.trailerId }, data: { status: "AVAILABLE" } });
        }
      }
      if (trip.operationId && input.status === "IN_TRANSIT") {
        await tx.transportOperation.updateMany({ where: { id: trip.operationId, status: "PLANNED" }, data: { status: "IN_PROGRESS" } });
      }
      if (trip.operationId && ["DELIVERED", "CANCELLED"].includes(input.status)) {
        const remaining = await tx.transportTrip.count({ where: { operationId: trip.operationId, status: { notIn: ["DELIVERED", "CANCELLED"] } } });
        if (!remaining) {
          const delivered = await tx.transportTrip.count({ where: { operationId: trip.operationId, status: "DELIVERED" } });
          await tx.transportOperation.update({ where: { id: trip.operationId }, data: { status: delivered ? "COMPLETED" : "CANCELLED" } });
        }
      }
    });
    await audit(scope, "STATUS_CHANGE", "TransportTrip", id, { from: trip.status, to: input.status });
    return { ok: true, id, message: "Estado del viaje actualizado." };
  }

  if (method === "PATCH" && resource === "trips" && id && action === "operation") {
    const input = parse(tripOperationSchema, body);
    const trip = await owned(prisma.transportTrip.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId }, select: { id: true } }), "El viaje");
    const operation = input.operationId
      ? await owned(prisma.transportOperation.findFirst({ where: { id: input.operationId, tenantId: scope.tenantId, branchId: scope.branchId, status: { in: ["PLANNED", "IN_PROGRESS"] } }, select: { id: true } }), "La operación")
      : null;
    await prisma.transportTrip.update({ where: { id: trip.id }, data: { operationId: operation?.id ?? null } });
    await audit(scope, "ASSIGN_OPERATION", "TransportTrip", trip.id, { operationId: operation?.id ?? null });
    return { ok: true, id: trip.id, message: operation ? "Viaje asociado a la operación." : "Viaje retirado de la operación." };
  }

  if (method === "POST" && resource === "trips" && id && action === "assign") {
    const input = parse(assignmentSchema, body);
    const configuration = await getTransportConfiguration(scope.tenantId);
    const storedConfiguration = await hasStoredTransportConfiguration(scope.tenantId);
    const trip = await owned(prisma.transportTrip.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId, status: { in: ["DRAFT", "PLANNED", "ASSIGNED"] } } }), "El viaje");
    const [driver, secondDriver, vehicle, trailer] = await Promise.all([
      owned(prisma.transportDriver.findFirst({ where: { id: input.driverId, tenantId: scope.tenantId, active: true, status: { notIn: ["SUSPENDED", "INACTIVE"] } } }), "El conductor"),
      input.secondDriverId ? owned(prisma.transportDriver.findFirst({ where: { id: input.secondDriverId, tenantId: scope.tenantId, active: true, status: { notIn: ["SUSPENDED", "INACTIVE"] } } }), "El segundo piloto") : Promise.resolve(null),
      owned(prisma.transportVehicle.findFirst({ where: { id: input.vehicleId, tenantId: scope.tenantId, active: true, status: { notIn: ["MAINTENANCE", "OUT_OF_SERVICE"] } } }), "El vehículo"),
      input.trailerId ? owned(prisma.transportTrailer.findFirst({ where: { id: input.trailerId, tenantId: scope.tenantId, active: true, status: { not: "OUT_OF_SERVICE" } } }), "El remolque") : Promise.resolve(null),
    ]);
    if (storedConfiguration && configuration.fleet.requireCompatibleAssembly) {
      const rule = configuration.fleet.assemblyRules.find((item) => item.active && item.tractorType === vehicle.type);
      if (trailer && (!rule || rule.maxTrailers < 1 || !rule.trailerTypes.includes(trailer.type))) throw new AppError("INCOMPATIBLE_ASSEMBLY", 409, `${vehicle.type} no puede ensamblarse con ${trailer.type} según las reglas de la empresa.`);
      if (!trailer && rule && rule.maxTrailers > 0 && !rule.trailerTypes.length) throw new AppError("TRAILER_REQUIRED", 409, "La configuración de esta unidad requiere un remolque compatible.");
    }
    if (storedConfiguration && configuration.fleet.requireCapacityCheck && trailer?.capacityKg && trip.cargoWeightKg && trip.cargoWeightKg > trailer.capacityKg) throw new AppError("CAPACITY_EXCEEDED", 409, "El peso de la carga supera la capacidad del remolque configurado.");
    const scheduledHours = (trip.scheduledEndAt.getTime() - trip.scheduledStartAt.getTime()) / 3_600_000;
    if (storedConfiguration && scheduledHours > configuration.safety.maxContinuousDrivingHours && !secondDriver) throw new AppError("SECOND_DRIVER_REQUIRED", 409, `Los viajes mayores a ${configuration.safety.maxContinuousDrivingHours} horas requieren segundo piloto.`);
    if (vehicle.soatDueAt && vehicle.soatDueAt < trip.scheduledEndAt) throw new AppError("VEHICLE_SOAT_EXPIRED", 409, "El SOAT no estará vigente durante todo el viaje.");
    if (vehicle.technicalDueAt && vehicle.technicalDueAt < trip.scheduledEndAt) throw new AppError("VEHICLE_INSPECTION_EXPIRED", 409, "La revisión técnica no estará vigente durante todo el viaje.");
    await Promise.all([
      assertDriverReady(scope.tenantId, driver, trip.scheduledStartAt, trip.scheduledEndAt, "piloto"),
      secondDriver ? assertDriverReady(scope.tenantId, secondDriver, trip.scheduledStartAt, trip.scheduledEndAt, "segundo piloto") : Promise.resolve(),
    ]);
    const driverIds = [driver.id, ...(secondDriver ? [secondDriver.id] : [])];
    const conflict = !storedConfiguration || configuration.fleet.preventDuplicateAssignments ? await prisma.transportAssignment.findFirst({ where: { tenantId: scope.tenantId, tripId: { not: trip.id }, status: "ACTIVE", startsAt: { lt: trip.scheduledEndAt }, endsAt: { gt: trip.scheduledStartAt }, OR: [{ driverId: { in: driverIds } }, { secondDriverId: { in: driverIds } }, { vehicleId: vehicle.id }, ...(trailer ? [{ trailerId: trailer.id }] : [])] } }) : null;
    if (conflict) throw new AppError("RESOURCE_CONFLICT", 409, "La unidad, carreta, piloto o segundo piloto ya está en uso durante un horario superpuesto.");
    if (storedConfiguration) await Promise.all(driverIds.map((driverId) => assertDriverRest(scope.tenantId, trip.id, driverId, trip.scheduledStartAt, trip.scheduledEndAt, configuration.safety.minRestHours)));
    if (configuration.documents.blockAssignmentsWithExpiredDocuments) await Promise.all([
      assertDocumentValid(scope.tenantId, "VEHICLE", vehicle.id, trip.scheduledStartAt),
      trailer ? assertDocumentValid(scope.tenantId, "TRAILER", trailer.id, trip.scheduledStartAt) : Promise.resolve(),
    ]);
    if (storedConfiguration) await Promise.all([
      assertRequiredTransportDocuments(scope.tenantId, "DRIVER", driver.id, trip.scheduledEndAt, configuration),
      secondDriver ? assertRequiredTransportDocuments(scope.tenantId, "DRIVER", secondDriver.id, trip.scheduledEndAt, configuration) : Promise.resolve(),
      assertRequiredTransportDocuments(scope.tenantId, "VEHICLE", vehicle.id, trip.scheduledEndAt, configuration),
      trailer ? assertRequiredTransportDocuments(scope.tenantId, "TRAILER", trailer.id, trip.scheduledEndAt, configuration) : Promise.resolve(),
    ]);
    const entity = await prisma.$transaction(async (tx) => {
      const previous = await tx.transportAssignment.findMany({ where: { tripId: trip.id, status: "ACTIVE" } });
      await tx.transportAssignment.updateMany({ where: { tripId: trip.id, status: "ACTIVE" }, data: { status: "RELEASED", releasedAt: new Date() } });
      for (const old of previous) {
        await tx.transportVehicle.update({ where: { id: old.vehicleId }, data: { status: "AVAILABLE" } });
        await tx.transportDriver.update({ where: { id: old.driverId }, data: { status: "AVAILABLE" } });
        if (old.secondDriverId) await tx.transportDriver.update({ where: { id: old.secondDriverId }, data: { status: "AVAILABLE" } });
        if (old.trailerId) await tx.transportTrailer.update({ where: { id: old.trailerId }, data: { status: "AVAILABLE" } });
      }
      const created = await tx.transportAssignment.create({ data: { tenantId: scope.tenantId, tripId: trip.id, vehicleId: vehicle.id, trailerId: trailer?.id ?? null, driverId: driver.id, secondDriverId: secondDriver?.id ?? null, startsAt: trip.scheduledStartAt, endsAt: trip.scheduledEndAt, reason: input.reason || null } });
      await tx.transportTrip.update({ where: { id: trip.id }, data: { status: "ASSIGNED" } });
      await tx.transportVehicle.update({ where: { id: vehicle.id }, data: { status: "ASSIGNED" } });
      await tx.transportDriver.update({ where: { id: driver.id }, data: { status: "ASSIGNED" } });
      if (secondDriver) await tx.transportDriver.update({ where: { id: secondDriver.id }, data: { status: "ASSIGNED" } });
      if (trailer) await tx.transportTrailer.update({ where: { id: trailer.id }, data: { status: "ASSIGNED" } });
      return created;
    });
    await audit(scope, "ASSIGN", "TransportTrip", trip.id, { assignmentId: entity.id, vehicleId: vehicle.id, trailerId: trailer?.id ?? null, driverId: driver.id, secondDriverId: secondDriver?.id ?? null });
    return { ok: true, id: entity.id, message: "Unidad ensamblada sin conflictos de recursos." };
  }

  if (method === "POST" && resource === "trips" && id && action === "tracking") {
    const input = parse(trackingSchema, body);
    const configuration = await getTransportConfiguration(scope.tenantId);
    await assertTenantConfigured(scope.tenantId, configuration.operations.trackingEvents, input.type, "El evento de seguimiento");
    const trip = await owned(prisma.transportTrip.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId, status: { in: ["ASSIGNED", "IN_TRANSIT"] } } }), "El viaje");
    const entity = await prisma.transportTrackingEvent.create({ data: { tenantId: scope.tenantId, tripId: trip.id, ...input, description: input.description || null } });
    await audit(scope, "TRACK", "TransportTrip", trip.id, { type: input.type });
    return { ok: true, id: entity.id, message: "Evento de seguimiento registrado." };
  }

  if (method === "POST" && resource === "trips" && id && action === "incidents") {
    const input = parse(incidentSchema, body);
    const configuration = await getTransportConfiguration(scope.tenantId);
    await assertTenantConfigured(scope.tenantId, configuration.safety.incidentTypes, input.type, "El tipo de incidencia");
    await assertTenantConfigured(scope.tenantId, configuration.safety.severities, input.severity, "La severidad");
    await owned(prisma.transportTrip.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId }, select: { id: true } }), "El viaje");
    const entity = await prisma.transportIncident.create({ data: { tenantId: scope.tenantId, tripId: id, ...input } });
    await audit(scope, "CREATE", "TransportIncident", entity.id);
    return { ok: true, id: entity.id, message: "Incidente reportado." };
  }

  if (method === "PATCH" && resource === "incidents" && id && action === "resolve") {
    const input = parse(incidentResolveSchema, body);
    await owned(prisma.transportIncident.findFirst({ where: { id, tenantId: scope.tenantId }, select: { id: true } }), "El incidente");
    await prisma.transportIncident.update({ where: { id }, data: { status: "RESOLVED", resolution: input.resolution, resolvedAt: new Date() } });
    await audit(scope, "RESOLVE", "TransportIncident", id);
    return { ok: true, id, message: "Incidente resuelto." };
  }

  return null;
};
