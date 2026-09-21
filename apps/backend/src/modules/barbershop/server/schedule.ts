import type { Prisma } from "@prisma/client";
import { salonInstant, salonLocalDateTime } from "@movendi/contracts";
import type { TenantScope } from "@/core/auth/types";
import { AppError } from "@/core/auth/errors";

export const scoped = (scope: TenantScope) => ({ tenantId: scope.tenantId, branchId: scope.branchId });
export async function timezoneFor(tx: Pick<Prisma.TransactionClient, "tenant">, scope: TenantScope) {
  return (await tx.tenant.findUniqueOrThrow({ where: { id: scope.tenantId }, select: { timezone: true } })).timezone;
}
export function instant(value: string | Date, timezone: string) {
  try { return salonInstant(value, timezone); } catch { throw new AppError("INVALID_DATE", 400, "Revisa fecha, hora y zona horaria del negocio."); }
}
export async function lockStaff(tx: Prisma.TransactionClient, scope: TenantScope, id: string) {
  const result = await tx.staffMember.updateMany({ where: { id, ...scoped(scope), active: true }, data: { scheduleVersion: { increment: 1 } } });
  if (!result.count) throw new AppError("NOT_FOUND", 404, "Profesional no disponible en esta sucursal.");
}
export async function assertSkill(tx: Prisma.TransactionClient, staffId: string, serviceId: string) {
  const skills = await tx.serviceStaff.findMany({ where: { serviceId }, select: { staffId: true } });
  if (skills.length && !skills.some((s) => s.staffId === staffId)) throw new AppError("STAFF_NOT_QUALIFIED", 409, "El profesional no está habilitado para este servicio.");
}
export async function assertAvailable(tx: Prisma.TransactionClient, scope: TenantScope, staffId: string, startsAt: Date, endsAt: Date, timezone: string, excludeId?: string) {
  if (startsAt.getTime() < Date.now()) throw new AppError("APPOINTMENT_IN_PAST", 400, "La cita debe programarse en una fecha futura.");
  const localStart = salonLocalDateTime(startsAt, timezone), localEnd = salonLocalDateTime(endsAt, timezone);
  const weekday = new Date(`${localStart.slice(0, 10)}T12:00:00Z`).getUTCDay();
  const schedule = await tx.staffSchedule.findFirst({ where: { ...scoped(scope), staffId, weekday, active: true } });
  if (localStart.slice(0, 10) !== localEnd.slice(0, 10) || !schedule || localStart.slice(11) < schedule.startsAt || localEnd.slice(11) > schedule.endsAt) throw new AppError("OUTSIDE_STAFF_SCHEDULE", 409, "El profesional no está disponible durante todo ese horario.");
  const overlap = { ...scoped(scope), staffId, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } };
  if (await tx.staffTimeBlock.findFirst({ where: { ...overlap, active: true } })) throw new AppError("STAFF_BLOCKED", 409, "El horario está bloqueado por descanso, vacaciones o ausencia.");
  if (await tx.appointment.findFirst({ where: { ...overlap, id: excludeId ? { not: excludeId } : undefined, status: { notIn: ["CANCELLED", "NO_SHOW"] } } })) throw new AppError("SCHEDULE_CONFLICT", 409, "El profesional ya tiene una cita en ese horario.");
}
