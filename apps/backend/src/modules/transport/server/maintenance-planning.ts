import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/core/database/prisma";
import { getTransportConfiguration } from "./configuration";
import { reserveTransportCode } from "./sequence";

const DAY_MS = 86_400_000;

export function addDays(value: Date, days: number | null) {
  return days ? new Date(value.getTime() + days * DAY_MS) : null;
}

export function maintenanceCycleKey(schedule: { id: string; nextDueKm: number | null; nextDueAt: Date | null }) {
  return `${schedule.id}:${schedule.nextDueKm ?? "-"}:${schedule.nextDueAt?.toISOString() ?? "-"}`;
}

export function maintenanceDueState(input: {
  vehicleOdometerKm: number;
  nextDueKm: number | null;
  nextDueAt: Date | null;
  alertKmBefore: number | null;
  alertDaysBefore: number | null;
  hasOpenOrder?: boolean;
  now?: Date;
}) {
  if (input.hasOpenOrder) return { state: "ORDERED" as const, reason: "Ya tiene una orden abierta" };
  const now = input.now ?? new Date();
  const dueKm = input.nextDueKm != null && input.vehicleOdometerKm >= input.nextDueKm;
  const dueDate = input.nextDueAt != null && now >= input.nextDueAt;
  if (dueKm || dueDate) {
    const reasons = [dueKm ? `alcanzó ${Math.round(input.nextDueKm!)} km` : null, dueDate ? "fecha límite alcanzada" : null].filter(Boolean);
    return { state: "DUE" as const, reason: reasons.join(" y ") };
  }
  const upcomingKm = input.nextDueKm != null && input.vehicleOdometerKm >= input.nextDueKm - (input.alertKmBefore ?? 0);
  const upcomingDate = input.nextDueAt != null && now >= new Date(input.nextDueAt.getTime() - (input.alertDaysBefore ?? 0) * DAY_MS);
  if (upcomingKm || upcomingDate) {
    const reasons = [upcomingKm ? `faltan ${Math.max(0, Math.round(input.nextDueKm! - input.vehicleOdometerKm))} km` : null, upcomingDate ? "fecha próxima" : null].filter(Boolean);
    return { state: "UPCOMING" as const, reason: reasons.join(" y ") };
  }
  return { state: "OK" as const, reason: null };
}

export function planMatchesVehicle(plan: { brand: string | null; model: string | null; yearFrom: number | null; yearTo: number | null; vehicleType: string | null }, vehicle: { brand: string; model: string; year: number; type: string }) {
  const same = (expected: string | null, actual: string) => !expected || expected.trim().toUpperCase() === actual.trim().toUpperCase();
  return same(plan.brand, vehicle.brand)
    && same(plan.model, vehicle.model)
    && same(plan.vehicleType, vehicle.type)
    && (!plan.yearFrom || vehicle.year >= plan.yearFrom)
    && (!plan.yearTo || vehicle.year <= plan.yearTo);
}

export async function rebuildVehicleMaintenanceSchedules(tx: Prisma.TransactionClient, input: { tenantId: string; vehicleId: string; planId: string; baselineKm: number; baselineAt: Date }) {
  const [tasks, components] = await Promise.all([
    tx.transportMaintenanceTask.findMany({ where: { tenantId: input.tenantId, planId: input.planId, active: true }, orderBy: { sortOrder: "asc" } }),
    tx.transportVehicleComponent.findMany({ where: { tenantId: input.tenantId, vehicleId: input.vehicleId, active: true }, orderBy: { createdAt: "desc" } }),
  ]);
  await tx.transportMaintenanceSchedule.updateMany({ where: { tenantId: input.tenantId, vehicleId: input.vehicleId, task: { planId: { not: input.planId } } }, data: { active: false } });
  for (const task of tasks) {
    const component = components.find((item) => item.componentType === task.componentType) ?? null;
    const existing = await tx.transportMaintenanceSchedule.findUnique({ where: { vehicleId_taskId: { vehicleId: input.vehicleId, taskId: task.id } } });
    const componentChanged = Boolean(existing && component && existing.componentId !== component.id);
    const baseKm = componentChanged ? component?.installedOdometerKm ?? input.baselineKm : existing?.lastServiceKm ?? component?.installedOdometerKm ?? input.baselineKm;
    const baseAt = componentChanged ? component?.installedAt ?? input.baselineAt : existing?.lastServiceAt ?? component?.installedAt ?? input.baselineAt;
    await tx.transportMaintenanceSchedule.upsert({
      where: { vehicleId_taskId: { vehicleId: input.vehicleId, taskId: task.id } },
      create: {
        tenantId: input.tenantId, vehicleId: input.vehicleId, taskId: task.id, componentId: component?.id ?? null,
        intervalKm: task.intervalKm, intervalDays: task.intervalDays, alertKmBefore: task.alertKmBefore, alertDaysBefore: task.alertDaysBefore,
        lastServiceKm: baseKm, lastServiceAt: baseAt, nextDueKm: task.intervalKm ? baseKm + task.intervalKm : null, nextDueAt: addDays(baseAt, task.intervalDays),
      },
      update: {
        componentId: component?.id ?? null, intervalKm: task.intervalKm, intervalDays: task.intervalDays,
        alertKmBefore: task.alertKmBefore, alertDaysBefore: task.alertDaysBefore, nextDueKm: task.intervalKm ? baseKm + task.intervalKm : null,
        nextDueAt: addDays(baseAt, task.intervalDays), lastServiceKm: componentChanged ? baseKm : existing?.lastServiceKm,
        lastServiceAt: componentChanged ? baseAt : existing?.lastServiceAt, active: true,
      },
    });
  }
  return tasks.length;
}

export async function maintenanceDueCount(tenantId: string, now = new Date()) {
  const schedules = await prisma.transportMaintenanceSchedule.findMany({
    where: { tenantId, active: true },
    select: { nextDueKm: true, nextDueAt: true, alertKmBefore: true, alertDaysBefore: true, vehicle: { select: { odometerKm: true } } },
  });
  return schedules.filter((item) => maintenanceDueState({ vehicleOdometerKm: item.vehicle.odometerKm, nextDueKm: item.nextDueKm, nextDueAt: item.nextDueAt, alertKmBefore: item.alertKmBefore, alertDaysBefore: item.alertDaysBefore, now }).state === "DUE").length;
}

export async function generateDueMaintenanceOrders(now = new Date()) {
  const schedules = await prisma.transportMaintenanceSchedule.findMany({
    where: { active: true, task: { active: true, plan: { active: true } }, orders: { none: { status: { in: ["OPEN", "IN_PROGRESS"] } } } },
    include: { vehicle: true, task: true, component: true },
  });
  const branchByTenant = new Map<string, string | null>();
  const configurationByTenant = new Map<string, Awaited<ReturnType<typeof getTransportConfiguration>>>();
  let created = 0;
  for (const schedule of schedules) {
    const state = maintenanceDueState({ vehicleOdometerKm: schedule.vehicle.odometerKm, nextDueKm: schedule.nextDueKm, nextDueAt: schedule.nextDueAt, alertKmBefore: schedule.alertKmBefore, alertDaysBefore: schedule.alertDaysBefore, now }).state;
    if (state !== "UPCOMING" && state !== "DUE") continue;
    const cycleKey = maintenanceCycleKey(schedule);
    if (await prisma.transportMaintenanceOrder.count({ where: { tenantId: schedule.tenantId, cycleKey } })) continue;
    let branchId = branchByTenant.get(schedule.tenantId);
    if (branchId === undefined) {
      branchId = (await prisma.branch.findFirst({ where: { tenantId: schedule.tenantId, active: true }, orderBy: { createdAt: "asc" }, select: { id: true } }))?.id ?? null;
      branchByTenant.set(schedule.tenantId, branchId);
    }
    if (!branchId) continue;
    let configuration = configurationByTenant.get(schedule.tenantId);
    if (!configuration) {
      configuration = await getTransportConfiguration(schedule.tenantId);
      configurationByTenant.set(schedule.tenantId, configuration);
    }
    const code = await reserveTransportCode({ tenantId: schedule.tenantId, branchId, kind: "MAINTENANCE", prefix: configuration.general.maintenancePrefix, at: now });
    try {
      await prisma.transportMaintenanceOrder.create({ data: {
        tenantId: schedule.tenantId, vehicleId: schedule.vehicleId, code, type: "PREVENTIVE", title: schedule.task.name,
        description: schedule.task.instructions, priority: schedule.task.priority, scheduledAt: schedule.nextDueAt,
        odometerKm: schedule.nextDueKm ?? schedule.vehicle.odometerKm, estimatedCents: schedule.task.estimatedCents,
        scheduleId: schedule.id, planTaskId: schedule.taskId, componentId: schedule.componentId, cycleKey,
      } });
      created += 1;
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
    }
  }
  return created;
}
