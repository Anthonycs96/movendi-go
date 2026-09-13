import { withSerializableTransaction } from "@/core/database/transactions";
import "server-only";
import { audit } from "@/core/audit/audit";
import { AppError } from "@/core/auth/errors";
import { prisma } from "@/core/database/prisma";
import { owned, parse } from "../command-helpers";
import { inventoryMovementSchema, inventorySchema, maintenancePlanSchema, maintenanceScheduleSchema, maintenanceSchema, maintenanceStatusSchema, maintenanceTaskSchema, vehicleComponentSchema, vehicleMaintenancePlanSchema } from "../command-schemas";
import type { TransportCommandHandler } from "../command-types";
import { applyInventoryMovement } from "@/modules/inventory/server/service";
import { assertTenantConfigured, getTransportConfiguration } from "../configuration";
import { addDays, maintenanceCycleKey, planMatchesVehicle, rebuildVehicleMaintenanceSchedules } from "../maintenance-planning";
import { reserveTransportCode } from "../sequence";

export const handleMaintenanceCommand: TransportCommandHandler = async (method, segments, body, scope) => {
  const [resource, id, action] = segments;

  if (method === "POST" && resource === "maintenance") {
    const input = parse(maintenanceSchema, body);
    const configuration = await getTransportConfiguration(scope.tenantId);
    await assertTenantConfigured(scope.tenantId, configuration.maintenance.maintenanceTypes, input.type, "El tipo de mantenimiento");
    await assertTenantConfigured(scope.tenantId, configuration.operations.priorities, input.priority, "La prioridad");
    const vehicle = await owned(prisma.transportVehicle.findFirst({ where: { id: input.vehicleId, tenantId: scope.tenantId, active: true } }), "El vehículo");
    const code = await reserveTransportCode({ tenantId: scope.tenantId, branchId: scope.branchId, kind: "MAINTENANCE", prefix: configuration.general.maintenancePrefix });
    const entity = await prisma.transportMaintenanceOrder.create({ data: { tenantId: scope.tenantId, vehicleId: vehicle.id, code, type: input.type, title: input.title, description: input.description || null, priority: input.priority, scheduledAt: input.scheduledAt, odometerKm: input.odometerKm ?? vehicle.odometerKm, estimatedCents: input.estimated } });
    await audit(scope, "CREATE", "TransportMaintenanceOrder", entity.id);
    return { ok: true, id: entity.id, message: `Orden ${code} creada.` };
  }

  if (method === "PATCH" && resource === "maintenance" && id && action === "status") {
    const input = parse(maintenanceStatusSchema, body);
    const configuration = await getTransportConfiguration(scope.tenantId);
    await assertTenantConfigured(scope.tenantId, configuration.maintenance.maintenanceStatuses, input.status, "El estado de mantenimiento");
    const order = await owned(prisma.transportMaintenanceOrder.findFirst({ where: { id, tenantId: scope.tenantId }, include: { vehicle: { select: { odometerKm: true } }, schedule: true } }), "La orden");
    if (["COMPLETED", "CANCELLED"].includes(order.status)) throw new AppError("ORDER_CLOSED", 409, "La orden ya está cerrada.");
    await prisma.$transaction(async (tx) => {
      const completedAt = input.status === "COMPLETED" ? input.completedAt ?? new Date() : null;
      const completedKm = input.odometerKm ?? order.vehicle.odometerKm;
      await tx.transportMaintenanceOrder.update({ where: { id }, data: { status: input.status, actualCents: input.actual, completedAt, odometerKm: input.status === "COMPLETED" ? completedKm : order.odometerKm } });
      if (input.status === "COMPLETED" && order.schedule && completedAt) {
        await tx.transportMaintenanceSchedule.update({ where: { id: order.schedule.id }, data: {
          lastServiceKm: completedKm, lastServiceAt: completedAt,
          nextDueKm: order.schedule.intervalKm ? completedKm + order.schedule.intervalKm : null,
          nextDueAt: addDays(completedAt, order.schedule.intervalDays),
        } });
      }
      await tx.transportVehicle.update({ where: { id: order.vehicleId }, data: { status: input.status === "IN_PROGRESS" ? "MAINTENANCE" : input.status === "COMPLETED" || input.status === "CANCELLED" ? "AVAILABLE" : undefined } });
    });
    await audit(scope, "STATUS_CHANGE", "TransportMaintenanceOrder", id, input);
    return { ok: true, id, message: "Orden de mantenimiento actualizada." };
  }

  if (method === "POST" && resource === "maintenance-plans" && !id) {
    const input = parse(maintenancePlanSchema, body);
    const entity = await prisma.transportMaintenancePlan.create({ data: { tenantId: scope.tenantId, ...input } });
    await audit(scope, "CREATE", "TransportMaintenancePlan", entity.id);
    return { ok: true, id: entity.id, message: `Plan ${entity.name} creado.` };
  }

  if (method === "POST" && resource === "maintenance-plans" && id && action === "tasks") {
    const input = parse(maintenanceTaskSchema, body);
    const configuration = await getTransportConfiguration(scope.tenantId);
    await assertTenantConfigured(scope.tenantId, configuration.operations.priorities, input.priority, "La prioridad");
    const intervalKm = input.intervalKm ?? (configuration.maintenance.preventiveEveryKm > 0 ? configuration.maintenance.preventiveEveryKm : null);
    const alertKmBefore = input.alertKmBefore ?? (intervalKm ? configuration.maintenance.alertKmBefore : null);
    const alertDaysBefore = input.alertDaysBefore ?? (input.intervalDays ? configuration.maintenance.alertDaysBefore : null);
    if (!intervalKm && !input.intervalDays) throw new AppError("MAINTENANCE_INTERVAL_REQUIRED", 400, "Indica un intervalo o configura un valor general de respaldo.");
    if (intervalKm && alertKmBefore != null && alertKmBefore >= intervalKm) throw new AppError("INVALID_MAINTENANCE_ALERT", 400, "La alerta por km debe ser menor al intervalo.");
    if (input.intervalDays && alertDaysBefore != null && alertDaysBefore >= input.intervalDays) throw new AppError("INVALID_MAINTENANCE_ALERT", 400, "La alerta por días debe ser menor al intervalo.");
    const plan = await owned(prisma.transportMaintenancePlan.findFirst({ where: { id, tenantId: scope.tenantId, active: true } }), "El plan");
    const entity = await prisma.$transaction(async (tx) => {
      const sortOrder = await tx.transportMaintenanceTask.count({ where: { planId: plan.id } });
      const created = await tx.transportMaintenanceTask.create({ data: { tenantId: scope.tenantId, planId: plan.id, ...input, intervalKm, alertKmBefore, alertDaysBefore, sortOrder } });
      const assignments = await tx.transportVehicleMaintenancePlan.findMany({ where: { tenantId: scope.tenantId, planId: plan.id, active: true } });
      for (const assignment of assignments) await rebuildVehicleMaintenanceSchedules(tx, assignment);
      return created;
    });
    await audit(scope, "CREATE", "TransportMaintenanceTask", entity.id);
    return { ok: true, id: entity.id, message: `Tarea ${entity.name} agregada al plan.` };
  }

  if (method === "POST" && resource === "maintenance-components" && !id) {
    const input = parse(vehicleComponentSchema, body);
    const vehicle = await owned(prisma.transportVehicle.findFirst({ where: { id: input.vehicleId, tenantId: scope.tenantId, active: true } }), "El vehículo");
    if (input.installedOdometerKm != null && input.installedOdometerKm > vehicle.odometerKm) throw new AppError("INVALID_COMPONENT_ODOMETER", 400, "El kilometraje de instalación no puede superar el odómetro actual.");
    const entity = await prisma.$transaction(async (tx) => {
      await tx.transportVehicleComponent.updateMany({ where: { tenantId: scope.tenantId, vehicleId: vehicle.id, componentType: input.componentType, active: true }, data: { active: false } });
      const created = await tx.transportVehicleComponent.create({ data: { tenantId: scope.tenantId, ...input } });
      const assignment = await tx.transportVehicleMaintenancePlan.findFirst({ where: { tenantId: scope.tenantId, vehicleId: vehicle.id, active: true } });
      if (assignment) await rebuildVehicleMaintenanceSchedules(tx, assignment);
      return created;
    });
    await audit(scope, "CREATE", "TransportVehicleComponent", entity.id);
    return { ok: true, id: entity.id, message: `${entity.name} registrado en ${vehicle.plate}.` };
  }

  if (method === "POST" && resource === "maintenance-plan-assignments" && !id) {
    const input = parse(vehicleMaintenancePlanSchema, body);
    const [vehicle, plan] = await Promise.all([
      owned(prisma.transportVehicle.findFirst({ where: { id: input.vehicleId, tenantId: scope.tenantId, active: true } }), "El vehículo"),
      owned(prisma.transportMaintenancePlan.findFirst({ where: { id: input.planId, tenantId: scope.tenantId, active: true }, include: { tasks: { where: { active: true } } } }), "El plan"),
    ]);
    if (!plan.tasks.length) throw new AppError("MAINTENANCE_PLAN_EMPTY", 400, "Agrega al menos una tarea antes de asignar el plan.");
    if (!planMatchesVehicle(plan, vehicle)) throw new AppError("MAINTENANCE_PLAN_MISMATCH", 409, "La marca, modelo, año o tipo del vehículo no coincide con este plan.");
    if (input.baselineKm > vehicle.odometerKm) throw new AppError("INVALID_MAINTENANCE_BASELINE", 400, "El kilometraje base no puede superar el odómetro actual.");
    const result = await prisma.$transaction(async (tx) => {
      await tx.transportVehicleMaintenancePlan.updateMany({ where: { tenantId: scope.tenantId, vehicleId: vehicle.id, active: true }, data: { active: false } });
      const assignment = await tx.transportVehicleMaintenancePlan.upsert({
        where: { vehicleId_planId: { vehicleId: vehicle.id, planId: plan.id } },
        create: { tenantId: scope.tenantId, ...input }, update: { baselineKm: input.baselineKm, baselineAt: input.baselineAt, active: true, assignedAt: new Date() },
      });
      const schedules = await rebuildVehicleMaintenanceSchedules(tx, assignment);
      return { assignment, schedules };
    });
    await audit(scope, "ASSIGN", "TransportMaintenancePlan", plan.id, { vehicleId: vehicle.id, schedules: result.schedules });
    return { ok: true, id: result.assignment.id, message: `Plan asignado a ${vehicle.plate}; ${result.schedules} tareas programadas.` };
  }

  if (method === "PATCH" && resource === "maintenance-schedules" && id && !action) {
    const input = parse(maintenanceScheduleSchema, body);
    const schedule = await owned(prisma.transportMaintenanceSchedule.findFirst({ where: { id, tenantId: scope.tenantId } }), "La programación");
    if (input.intervalKm && input.alertKmBefore != null && input.alertKmBefore >= input.intervalKm) throw new AppError("INVALID_MAINTENANCE_ALERT", 400, "La alerta por km debe ser menor al intervalo.");
    if (input.intervalDays && input.alertDaysBefore != null && input.alertDaysBefore >= input.intervalDays) throw new AppError("INVALID_MAINTENANCE_ALERT", 400, "La alerta por días debe ser menor al intervalo.");
    const baseKm = schedule.lastServiceKm ?? 0;
    const baseAt = schedule.lastServiceAt ?? new Date();
    await prisma.transportMaintenanceSchedule.update({ where: { id }, data: { ...input, nextDueKm: input.intervalKm ? baseKm + input.intervalKm : null, nextDueAt: addDays(baseAt, input.intervalDays) } });
    await audit(scope, "UPDATE", "TransportMaintenanceSchedule", id, input);
    return { ok: true, id, message: "Intervalos del vehículo actualizados." };
  }

  if (method === "POST" && resource === "maintenance-schedules" && id && action === "order") {
    const schedule = await owned(prisma.transportMaintenanceSchedule.findFirst({ where: { id, tenantId: scope.tenantId, active: true }, include: { vehicle: true, task: true, component: true, orders: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } }, take: 1 } } }), "La programación");
    if (schedule.orders.length) throw new AppError("MAINTENANCE_ORDER_EXISTS", 409, "Esta tarea ya tiene una orden abierta.");
    const configuration = await getTransportConfiguration(scope.tenantId);
    const code = await reserveTransportCode({ tenantId: scope.tenantId, branchId: scope.branchId, kind: "MAINTENANCE", prefix: configuration.general.maintenancePrefix });
    const cycleKey = maintenanceCycleKey(schedule);
    const entity = await prisma.transportMaintenanceOrder.create({ data: {
      tenantId: scope.tenantId, vehicleId: schedule.vehicleId, code, type: "PREVENTIVE", title: schedule.task.name,
      description: schedule.task.instructions, priority: schedule.task.priority, scheduledAt: schedule.nextDueAt,
      odometerKm: schedule.nextDueKm ?? schedule.vehicle.odometerKm, estimatedCents: schedule.task.estimatedCents,
      scheduleId: schedule.id, planTaskId: schedule.taskId, componentId: schedule.componentId, cycleKey,
    } });
    await audit(scope, "CREATE", "TransportMaintenanceOrder", entity.id, { scheduleId: schedule.id });
    return { ok: true, id: entity.id, message: `Orden ${code} generada para ${schedule.vehicle.plate}.` };
  }

  if (method === "POST" && resource === "inventory" && !id) {
    const input = parse(inventorySchema, body);
    const entity = await prisma.inventoryItem.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, sku: input.sku, name: input.name, kind: "PART", unit: input.unit, minimumStock: input.minimumStock, unitCostCents: input.unitCost } });
    await audit(scope, "CREATE", "TransportInventoryItem", entity.id);
    return { ok: true, id: entity.id, message: "Repuesto registrado." };
  }

  if (method === "POST" && resource === "inventory" && id && action === "movements") {
    const input = parse(inventoryMovementSchema, body);
    const item = await owned(prisma.inventoryItem.findFirst({ where: { id, tenantId: scope.tenantId, OR: [{ branchId: scope.branchId }, { branchId: null }], active: true } }), "El repuesto");
    const maintenanceOrder = input.maintenanceOrderId ? await owned(prisma.transportMaintenanceOrder.findFirst({ where: { id: input.maintenanceOrderId, tenantId: scope.tenantId, status: { in: ["OPEN", "IN_PROGRESS"] } }, select: { id: true, code: true } }), "La orden") : null;
    const direction = input.type === "OUT" ? "OUT" : "IN";
    const entity = await withSerializableTransaction((tx) => applyInventoryMovement(tx, scope, { itemId: item.id, type: input.type === "ADJUSTMENT" ? (direction === "IN" ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT") : input.type === "IN" ? "RESTOCK" : "CONSUMPTION", direction, quantity: input.quantity, originType: "TRANSPORT_MAINTENANCE", originId: maintenanceOrder?.id ?? null, reference: input.reference || maintenanceOrder?.code || null, notes: input.notes || null }));
    await audit(scope, "MOVE", "TransportInventoryItem", item.id, { type: input.type, quantity: input.quantity });
    return { ok: true, id: entity.id, message: "Movimiento de inventario aplicado." };
  }

  return null;
};
