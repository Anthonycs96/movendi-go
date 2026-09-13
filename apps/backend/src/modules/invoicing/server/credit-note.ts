import "server-only";
import { withSerializableTransaction } from "@/core/database/transactions";
import { prisma } from "@/core/database/prisma";
import { AppError } from "@/core/auth/errors";
import type { TenantScope } from "@/core/auth/types";
import { reserveDocumentNumber } from "../infrastructure/prisma/document-repository";
import { fullCreditPayload } from "../domain/full-credit";
import { deliverDocument } from "../application/deliver-document";
import { consultNubefact, nubefactRequest } from "../infrastructure/nubefact";
import { deliverFiscalJob, queueFullRefundDocument } from "./outbox";

export async function issueFullRefundCreditNote(scope: TenantScope, saleId: string) {
  const job = await withSerializableTransaction(async (tx) => {
    const lock = await tx.sale.updateMany({ where: { id: saleId, tenantId: scope.tenantId, branchId: scope.branchId, status: "REFUNDED" }, data: { status: "REFUNDED" } });
    if (!lock.count) throw new AppError("REFUND_REQUIRED", 409, "Registra primero la devolución total de la venta.");
    return queueFullRefundDocument(tx, scope, saleId);
  });
  if (job) {
    const result = await deliverFiscalJob(scope, job.id, true);
    return { ok: true, message: result.status === "ISSUED" ? "Nota de crédito aceptada." : "Nota enviada; aceptación pendiente. Puedes consultar de nuevo." };
  }
  const refund = await withSerializableTransaction(async (tx) => {
    const lock = await tx.sale.updateMany({ where: { id: saleId, tenantId: scope.tenantId, branchId: scope.branchId, status: "REFUNDED" }, data: { status: "REFUNDED" } });
    if (!lock.count) throw new AppError("REFUND_REQUIRED", 409, "Registra primero la devolución total de la venta.");
    const current = await tx.saleRefund.findFirst({ where: { saleId, tenantId: scope.tenantId, branchId: scope.branchId }, include: { sale: { include: { electronicDocument: true } } } });
    if (!current) throw new AppError("REFUND_REQUIRED", 409, "Registra primero la devolución total de la venta.");
    if (current.totalCents !== current.sale.totalCents) throw new AppError("FULL_REFUND_REQUIRED", 409, "Esta nota requiere una devolución por el total del comprobante.");
    const original = current.sale.electronicDocument;
    if (!original?.requestPayload || original.status !== "ISSUED") throw new AppError("ORIGINAL_DOCUMENT_REQUIRED", 409, "La nota requiere el comprobante original aceptado y su trama guardada.");
    if (current.creditStatus === "ISSUED" || current.creditPayload) return { ...current, environment: original.environment };
    const series = original.series;
    const number = await reserveDocumentNumber(tx, scope, "CREDIT_NOTE", series);
    const payload = fullCreditPayload(JSON.parse(original.requestPayload), series, number, current.reason, new Date());
    const updated = await tx.saleRefund.update({ where: { id: current.id }, data: { creditSeries: series, creditNumber: number, creditPayload: JSON.stringify(payload), creditUpdatedAt: new Date() } });
    return { ...updated, environment: original.environment };
  });
  if (refund.creditStatus === "ISSUED") return { ok: true, message: "La nota de crédito ya está aceptada." };
  const lease = new Date(Math.max(Date.now(), (refund.creditUpdatedAt?.getTime() ?? 0) + 1));
  const where = { id: refund.id, tenantId: scope.tenantId, branchId: scope.branchId };
  const claim = await prisma.saleRefund.updateMany({ where: { ...where, creditStatus: refund.creditStatus, creditUpdatedAt: refund.creditUpdatedAt, OR: [{ creditStatus: { not: "SENDING" } }, { creditUpdatedAt: { lt: new Date(Date.now() - 60000) } }] }, data: { creditStatus: "SENDING", creditUpdatedAt: lease } });
  if (!claim.count) throw new AppError("CREDIT_NOTE_BUSY", 409, "La nota está siendo procesada.");
  const currentLease = { ...where, creditStatus: "SENDING", creditUpdatedAt: lease };
  const payload = JSON.parse(refund.creditPayload!) as Record<string, unknown>;
  const status = await deliverDocument({ send: (body) => nubefactRequest(scope.tenantId, body, refund.environment), consult: (body) => consultNubefact(scope.tenantId, body, refund.environment) }, {
    uncertain: async (message) => { await prisma.saleRefund.updateMany({ where: currentLease, data: { creditStatus: "UNKNOWN", creditError: message.slice(0, 1000) } }); },
    complete: (response, status) => withSerializableTransaction(async (tx) => {
      const changed = await tx.saleRefund.updateMany({ where: currentLease, data: { creditStatus: status, creditResponse: JSON.stringify(response), creditError: null } });
      if (!changed.count) throw new AppError("CREDIT_NOTE_LEASE_LOST", 409, "Otro intento actualizó la nota de crédito.");
      await tx.auditLog.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, userId: scope.actorId, action: "CREDIT_NOTE", entityType: "Sale", entityId: saleId, metadata: JSON.stringify({ refundId: refund.id, status, series: refund.creditSeries, number: refund.creditNumber }) } });
      return status;
    }),
  }, payload, refund.creditStatus !== "PENDING" || Boolean(refund.creditResponse || refund.creditError));
  return { ok: true, message: status === "ISSUED" ? "Nota de crédito aceptada." : "Nota enviada; aceptación pendiente. Puedes consultar de nuevo." };
}
