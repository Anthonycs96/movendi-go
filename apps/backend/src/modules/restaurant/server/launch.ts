import "server-only";
import { z } from "zod";
import { prisma } from "@/core/database/prisma";
import { AppError } from "@/core/auth/errors";
import { withInventoryTransaction } from "@/modules/inventory/server/service";
export const pilotCases = [
  { key: "MISTRAL", label: "PDF real leído y productos revisados con Mistral" },
  { key: "MENU", label: "Carta y precios revisados" }, { key: "ROLES", label: "Acceso con cada rol y dos dispositivos" },
  { key: "DINE_IN", label: "Pedido en salón, notas y cocina" }, { key: "TAKEAWAY", label: "Pedido para llevar" }, { key: "DELIVERY", label: "Pedido delivery y dirección" },
  { key: "PAYMENT", label: "Cobro simple y dividido" }, { key: "LOYALTY", label: "Canje y devolución de puntos" }, { key: "REFUND", label: "Devolución y cierre de caja" },
  { key: "NETWORK", label: "Interrupción y recuperación de conexión" }, { key: "PEAK", label: "Turno de hora punta con tiempos medidos" },
  { key: "PRINT", label: "Impresora real: papel, notas, corte y reconexión" }, { key: "FISCAL", label: "NubeFact BETA: boleta, factura, consulta y nota de crédito" },
  { key: "TRAINING", label: "Capacitación y contingencia con el equipo" },
] as const;
export const checkSchema = z.object({ status: z.enum(["PASSED", "FAILED", "PENDING"]), evidence: z.string().trim().min(10).max(2000), samples: z.number().int().min(0).max(100000).default(0), p95Ms: z.number().nonnegative().max(3600000).optional() });
type Scope = { tenantId: string; branchId: string; actorId: string };
export async function launchData(scope: Scope) {
  const [plan, tickets, backups, history] = await Promise.all([
    prisma.restaurantLaunchPlan.findUnique({ where: { tenantId_branchId: { tenantId: scope.tenantId, branchId: scope.branchId } } }),
    prisma.restaurantSupportTicket.findMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.externalBackupRun.findMany({ orderBy: { startedAt: "desc" }, take: 1, select: { status: true, completedAt: true, startedAt: true, restoreVerified: true } }),
    prisma.auditLog.findMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId, entityType: "RestaurantLaunchPlan" }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, action: true, createdAt: true, user: { select: { name: true } } } }),
  ]);
  return { plan: plan ? { ...plan, checks: JSON.parse(plan.checks) } : null, cases: pilotCases, tickets, backup: backups[0] ?? null, history };
}
export async function updateLaunch(scope: Scope, body: unknown) {
  const input = z.discriminatedUnion("action", [
    z.object({ action: z.literal("plan"), owner: z.string().trim().min(2).max(120), supportContact: z.string().trim().min(3).max(200), supportHours: z.string().trim().min(3).max(200), escalation: z.string().trim().min(3).max(300), participants: z.string().trim().min(3).max(500), devices: z.string().trim().min(3).max(500) }),
    z.object({ action: z.literal("check"), key: z.string(), result: checkSchema, confirmedReal: z.literal(true) }),
    z.object({ action: z.literal("complete"), confirmedReal: z.literal(true) }),
  ]).parse(body);
  return withInventoryTransaction(async (tx) => {
    const where = { tenantId: scope.tenantId, branchId: scope.branchId };
    const current = await tx.restaurantLaunchPlan.findUnique({ where: { tenantId_branchId: where } });
    if (current?.status === "COMPLETED") throw new AppError("PILOT_COMPLETED", 409, "El piloto ya está cerrado. Registra incidencias en soporte.");
    let plan;
    if (input.action === "plan") {
      const { action: _action, ...data } = input; void _action;
      plan = await tx.restaurantLaunchPlan.upsert({ where: { tenantId_branchId: where }, create: { ...where, ...data, status: "RUNNING", startedAt: new Date() }, update: data });
    } else {
      if (!current) throw new AppError("PILOT_REQUIRED", 409, "Registra primero al responsable, equipo y soporte.");
      const checks = JSON.parse(current.checks) as Record<string, z.infer<typeof checkSchema>>;
      if (input.action === "check") {
        if (!pilotCases.some((item) => item.key === input.key)) throw new AppError("INVALID_CASE", 400, "Prueba no reconocida.");
        if (input.key === "PEAK" && input.result.status === "PASSED" && (!input.result.samples || input.result.p95Ms === undefined)) throw new AppError("METRICS_REQUIRED", 400, "La prueba de hora punta necesita cantidad de operaciones y percentil 95 medido.");
        checks[input.key] = { ...input.result };
        plan = await tx.restaurantLaunchPlan.update({ where: { id: current.id }, data: { checks: JSON.stringify(checks) } });
      } else {
        if (pilotCases.some((item) => checks[item.key]?.status !== "PASSED")) throw new AppError("PILOT_INCOMPLETE", 409, "Completa todas las pruebas reales antes de cerrar el piloto.");
        if (await tx.restaurantSupportTicket.count({ where: { ...where, priority: "CRITICAL", status: { not: "CLOSED" } } })) throw new AppError("OPEN_INCIDENTS", 409, "Resuelve las incidencias críticas antes de cerrar el piloto.");
        const backup = await tx.externalBackupRun.findFirst({ where: { status: "COMPLETED", restoreVerified: true }, orderBy: { completedAt: "desc" } });
        if (!backup?.completedAt || Date.now() - backup.completedAt.getTime() > 36 * 3600000) throw new AppError("BACKUP_REQUIRED", 409, "Falta una copia reciente con restauración comprobada.");
        plan = await tx.restaurantLaunchPlan.update({ where: { id: current.id }, data: { status: "COMPLETED", completedAt: new Date() } });
      }
    }
    await tx.auditLog.create({ data: { ...where, userId: scope.actorId, entityType: "RestaurantLaunchPlan", entityId: plan.id, action: `PILOT_${input.action.toUpperCase()}`, metadata: JSON.stringify(input) } });
    return { ok: true, message: input.action === "complete" ? "Piloto cerrado por el responsable con evidencias registradas." : "Seguimiento guardado." };
  });
}
export const ticketUpdateSchema = z.object({ id: z.string(), version: z.number().int().positive(), status: z.enum(["OPEN", "IN_PROGRESS", "CLOSED"]), assignedTo: z.string().trim().max(120), resolution: z.string().trim().max(3000) }).refine((input) => input.status !== "CLOSED" || input.resolution.length >= 10, "Describe la solución antes de cerrar la incidencia.");
export async function updateTicket(actorId: string, body: unknown, scope?: { tenantId: string; branchId: string }) {
  const { id, version, ...data } = ticketUpdateSchema.parse(body);
  return withInventoryTransaction(async (tx) => {
    const ticket = await tx.restaurantSupportTicket.findFirst({ where: { id, ...scope } });
    if (!ticket) throw new AppError("NOT_FOUND", 404, "Incidencia no encontrada.");
    const result = await tx.restaurantSupportTicket.updateMany({ where: { id, version, ...scope }, data: { ...data, version: { increment: 1 } } });
    if (!result.count) throw new AppError("TICKET_CHANGED", 409, "La incidencia cambió. Actualiza antes de guardar.");
    await tx.auditLog.create({ data: { tenantId: ticket.tenantId, branchId: ticket.branchId, userId: actorId, entityType: "RestaurantSupportTicket", entityId: id, action: "SUPPORT_UPDATE", metadata: JSON.stringify({ before: { status: ticket.status, assignedTo: ticket.assignedTo, resolution: ticket.resolution }, after: data }) } });
    return { ok: true, message: "Incidencia actualizada." };
  });
}
