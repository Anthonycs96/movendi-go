import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/core/database/prisma";
import { withSerializableTransaction } from "@/core/database/transactions";
import { AppError } from "@/core/auth/errors";
import { changeDelivery } from "../application/change-delivery";
import { expired, PrintConflict, type PrintAction } from "../domain/delivery";
import { PrismaPrintRepository, type PrintScope } from "../infrastructure/prisma/print-repository";

export { expired };
export type { PrintScope };
export function changePrintDelivery(scope: PrintScope, id: string, action: PrintAction) {
  return withSerializableTransaction((tx) => changeInTransaction(tx, scope, id, action));
}
async function changeInTransaction(tx: Prisma.TransactionClient, scope: PrintScope, id: string, action: PrintAction) {
  if (action.kind === "claim" && !scope.printerId) {
    const job = await tx.restaurantPrintJob.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId }, select: { printer: { select: { active: true, connectionType: true } } } });
    if (job?.printer && (!job.printer.active || job.printer.connectionType === "LOCAL_AGENT")) throw new AppError("PRINT_DEVICE_UNAVAILABLE", 409, "Esta impresión requiere su agente local o una impresora activa.");
  }
  try { return await changeDelivery(new PrismaPrintRepository(tx, scope), id, action, new Date()); }
  catch (error) { if (error instanceof PrintConflict) throw new AppError(error.code, error.code === "NOT_FOUND" ? 404 : error.code === "PRINT_CONFIRMATION_REQUIRED" ? 400 : 409, error.message); throw error; }
}

export const printRelations = { order: { select: { code: true, source: true, notes: true, table: { select: { name: true } }, customer: { select: { name: true } } } }, createdBy: { select: { name: true } } } as const;

export async function nextAgentPrint(scope: PrintScope & { printerId: string }) {
  return withSerializableTransaction(async (tx) => {
    const { tenantId, branchId, printerId } = scope;
    const device = await tx.printDevice.findFirst({ where: { id: printerId, tenantId, branchId, active: true, automatic: true, connectionType: "LOCAL_AGENT" } });
    if (!device) return null;
    const job = await tx.restaurantPrintJob.findFirst({ where: { tenantId, branchId, printerId, automatic: true, status: "PENDING" }, orderBy: { createdAt: "asc" }, include: printRelations });
    if (!job) return null;
    const claim = await changeInTransaction(tx, scope, job.id, { kind: "claim", stationId: `agent:${printerId}`, leaseMs: 120_000 });
    return claim.claimed ? { ...job, attempts: claim.attempt } : null;
  });
}

export async function listPrintJobs(scope: PrintScope) {
  const { tenantId, branchId, printerId } = scope;
  const filter = { tenantId, branchId, ...(printerId ? { printerId } : {}) };
  const [queue, attention, failed, printed] = await Promise.all([
    prisma.restaurantPrintJob.findMany({ where: { ...filter, status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 100, include: printRelations }),
    prisma.restaurantPrintJob.findMany({ where: { ...filter, OR: [{ status: { in: ["SENT", "UNKNOWN"] } }, { status: "PROCESSING", OR: [{ leaseExpiresAt: { lte: new Date() } }, { leaseExpiresAt: null }] }] }, orderBy: { createdAt: "asc" }, take: 100, include: printRelations }),
    prisma.restaurantPrintJob.findMany({ where: { ...filter, status: "FAILED" }, orderBy: { createdAt: "desc" }, take: 20, include: printRelations }),
    prisma.restaurantPrintJob.findMany({ where: { ...filter, status: "PRINTED" }, orderBy: { createdAt: "desc" }, take: 20, include: printRelations }),
  ]);
  return [...queue, ...attention, ...failed, ...printed].map((job) => ({ ...job, status: expired(job, new Date()) ? "UNKNOWN" : job.status, claimable: job.status === "PENDING" }));
}
