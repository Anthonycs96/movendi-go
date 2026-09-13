import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/core/database/prisma";
import { withSerializableTransaction } from "@/core/database/transactions";
import { AppError } from "@/core/auth/errors";
import type { TenantScope } from "@/core/auth/types";
import { deliverDocument } from "../application/deliver-document";
import { documentPayload, type DocumentKind, type FiscalConfiguration } from "../domain/document";
import { commercialFiscalSource, type FiscalCommercialSnapshot } from "../domain/commercial-source";
import { partialCreditPayload, type RefundFiscalLine } from "../domain/partial-credit";
import { fullCreditPayload } from "../domain/full-credit";
import { reserveDocumentNumber, type FiscalSourceLoader } from "../infrastructure/prisma/document-repository";
import { consultNubefact, nubefactRequest } from "../infrastructure/nubefact";

const where = (scope: TenantScope) => ({ tenantId: scope.tenantId, branchId: scope.branchId });
async function audited(tx: Prisma.TransactionClient, scope: TenantScope, id: string, action: string) { await tx.auditLog.create({ data: { ...where(scope), userId: scope.actorId, entityType: "FiscalJob", entityId: id, action } }); }

export async function queueSaleDocument(tx: Prisma.TransactionClient, scope: TenantScope, saleId: string, kind: DocumentKind, config: FiscalConfiguration, load?: FiscalSourceLoader) {
  if (!config.enabled) throw new AppError("SUNAT_DISABLED", 409, "Habilita la emisión fiscal de esta sucursal.");
  const sale = await tx.sale.findFirst({ where: { id: saleId, ...where(scope), status: "PAID" }, include: { electronicDocument: true } });
  if (!sale) throw new AppError("SALE_NOT_PAID", 409, "La venta no está pagada o pertenece a otra sucursal.");
  if (sale.electronicDocument) {
    if (sale.electronicDocument.kind !== kind) throw new AppError("DOCUMENT_KIND_LOCKED", 409, "La venta ya tiene otro tipo de comprobante reservado.");
    if (sale.electronicDocument.environment !== config.environment) throw new AppError("DOCUMENT_ENVIRONMENT_LOCKED", 409, "El comprobante pertenece a otro ambiente.");
    const existing = await tx.fiscalJob.findUnique({ where: { originKey: `SALE:${sale.id}` } });
    if (!existing) throw new AppError("FISCAL_LEGACY_REVIEW", 409, "El comprobante anterior requiere conciliación.");
    return existing;
  }
  const credential = await tx.restaurantIntegrationCredential.findUnique({ where: { tenantId_provider: { tenantId: scope.tenantId, provider: "NUBEFACT" } } });
  if (!credential || credential.environment !== config.environment) throw new AppError("SUNAT_ENVIRONMENT_MISMATCH", 409, "Guarda las credenciales del ambiente elegido.");
  const series = kind === "FACTURA" ? config.invoiceSeries : config.receiptSeries;
  const number = await reserveDocumentNumber(tx, scope, kind, series);
  let payload;
  try {
    const source = load ? await load(tx) : commercialFiscalSource(JSON.parse(sale.commercialSnapshot!) as FiscalCommercialSnapshot, sale.code, sale.createdAt);
    if (source.totalCents !== sale.totalCents) throw new Error("El total histórico no coincide con la venta.");
    payload = JSON.stringify(documentPayload(source, kind, series, number, config.environment));
  } catch (error) { throw new AppError("FISCAL_CLASSIFICATION", 409, error instanceof Error ? error.message : "Completa el detalle fiscal."); }
  await tx.restaurantElectronicDocument.create({ data: { ...where(scope), saleId, kind, series, number, provider: "NUBEFACT", environment: config.environment, requestPayload: payload, status: "PENDING" } });
  const job = await tx.fiscalJob.create({ data: { ...where(scope), actorId: scope.actorId, saleId, originKey: `SALE:${saleId}`, kind, series, number, environment: config.environment, apiUrl: credential.apiUrl, payload } });
  await audited(tx, scope, job.id, "FISCAL_QUEUED");
  return job;
}

export async function queueRefundDocument(tx: Prisma.TransactionClient, scope: TenantScope, saleId: string, operationId: string, lines: RefundFiscalLine[], reason: string) {
  const original = await tx.fiscalJob.findFirst({ where: { ...where(scope), saleId, kind: { in: ["BOLETA", "FACTURA"] } } });
  if (!original) return null; // Internal tickets have no fiscal credit note.
  if (original.status !== "ISSUED") throw new AppError("FISCAL_STATUS_PENDING", 409, "Confirma el comprobante original antes de registrar la devolución.");
  const number = await reserveDocumentNumber(tx, scope, "CREDIT_NOTE", original.series);
  let payload;
  try { payload = JSON.stringify(partialCreditPayload(JSON.parse(original.payload), lines, original.series, number, reason, new Date())); }
  catch (error) { throw new AppError("INVALID_FISCAL_REFUND", 409, error instanceof Error ? error.message : "Devolución fiscal inválida."); }
  const job = await tx.fiscalJob.create({ data: { ...where(scope), actorId: scope.actorId, saleId, originKey: `REFUND:${operationId}`, kind: "CREDIT_NOTE", series: original.series, number, environment: original.environment, apiUrl: original.apiUrl, payload } });
  await audited(tx, scope, job.id, "FISCAL_CREDIT_QUEUED");
  return job;
}

export async function queueFullRefundDocument(tx: Prisma.TransactionClient, scope: TenantScope, saleId: string) {
  const original = await tx.fiscalJob.findUnique({ where: { originKey: `SALE:${saleId}` } });
  if (!original || original.tenantId !== scope.tenantId || original.branchId !== scope.branchId) return null;
  const refund = await tx.saleRefund.findFirst({ where: { saleId, ...where(scope) }, include: { sale: true } });
  if (!refund || refund.sale.status !== "REFUNDED") throw new AppError("REFUND_REQUIRED", 409, "Registra primero la devolución total.");
  if (refund.totalCents !== refund.sale.totalCents) throw new AppError("FULL_REFUND_REQUIRED", 409, "La devolución debe cubrir el total del comprobante.");
  const originKey = `SALE_REFUND:${refund.id}`;
  const existing = await tx.fiscalJob.findUnique({ where: { originKey } });
  if (existing) return existing;
  if (original.status !== "ISSUED") throw new AppError("ORIGINAL_DOCUMENT_REQUIRED", 409, "Confirma el comprobante original antes de devolver.");
  if (refund.creditPayload) throw new AppError("FISCAL_LEGACY_REVIEW", 409, "La nota anterior requiere conciliación.");
  const number = await reserveDocumentNumber(tx, scope, "CREDIT_NOTE", original.series);
  const payload = JSON.stringify(fullCreditPayload(JSON.parse(original.payload), original.series, number, refund.reason, new Date()));
  const job = await tx.fiscalJob.create({ data: { ...where(scope), actorId: scope.actorId, saleId, originKey, kind: "CREDIT_NOTE", series: original.series, number, environment: original.environment, apiUrl: original.apiUrl, payload } });
  await tx.saleRefund.update({ where: { id: refund.id }, data: { creditStatus: "PENDING", creditSeries: original.series, creditNumber: number, creditPayload: payload, creditUpdatedAt: new Date() } });
  await audited(tx, scope, job.id, "FISCAL_CREDIT_QUEUED");
  return job;
}

export async function deliverFiscalJob(scope: TenantScope, id: string, manual = false) {
  const job = await withSerializableTransaction(async (tx) => {
    const current = await tx.fiscalJob.findFirst({ where: { id, ...where(scope) } });
    if (!current) throw new AppError("NOT_FOUND", 404, "Comprobante no encontrado.");
    if (current.status === "ISSUED") return current;
    const now = new Date();
    if (current.leaseExpiresAt && current.leaseExpiresAt > now) throw new AppError("DOCUMENT_BUSY", 409, "El comprobante está siendo procesado.");
    if (!manual && (current.status === "REVIEW" || current.nextAttemptAt > now)) throw new AppError("FISCAL_NOT_DUE", 409, "El comprobante aún no requiere otro intento.");
    const claim = await tx.fiscalJob.updateMany({ where: { id, ...where(scope), attempts: current.attempts, status: current.status }, data: { status: "SENDING", attempts: { increment: 1 }, leaseToken: randomUUID(), leaseExpiresAt: new Date(Date.now() + 60_000) } });
    if (!claim.count) throw new AppError("DOCUMENT_BUSY", 409, "Otro proceso tomó el comprobante.");
    return tx.fiscalJob.findUniqueOrThrow({ where: { id } });
  });
  if (job.status === "ISSUED") return { id: job.id, status: job.status };
  const lease = { id: job.id, ...where(scope), status: "SENDING", leaseToken: job.leaseToken };
  const next = new Date(Date.now() + Math.min(3600_000, 30_000 * 2 ** Math.min(job.attempts - 1, 7)));
  const persist = (status: string, response: Record<string, unknown> | null, error: string | null) => withSerializableTransaction(async (tx) => {
    const changed = await tx.fiscalJob.updateMany({ where: lease, data: { status, lastError: error, ...(response ? { response: JSON.stringify(response) } : {}), nextAttemptAt: next, leaseExpiresAt: null, leaseToken: null } });
    if (!changed.count) throw new AppError("DOCUMENT_LEASE_LOST", 409, "Otro intento actualizó el comprobante.");
    if (job.kind !== "CREDIT_NOTE") {
      const url = (value: unknown) => { try { const parsed = new URL(String(value)); return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.href : null; } catch { return null; } };
      await tx.restaurantElectronicDocument.updateMany({ where: { ...where(scope), saleId: job.saleId }, data: { status, attempts: job.attempts, lastError: error, ...(response ? { response: JSON.stringify(response), requestId: String(response.codigo_hash ?? ""), pdfUrl: url(response.enlace_del_pdf), xmlUrl: url(response.enlace_del_xml), cdrUrl: url(response.enlace_del_cdr), issuedAt: status === "ISSUED" ? new Date() : null } : {}) } });
    } else if (job.originKey.startsWith("SALE_REFUND:")) {
      await tx.saleRefund.updateMany({ where: { id: job.originKey.slice("SALE_REFUND:".length), saleId: job.saleId, ...where(scope) }, data: { creditStatus: status, creditError: error, creditUpdatedAt: new Date(), ...(response ? { creditResponse: JSON.stringify(response) } : {}) } });
    }
    await audited(tx, scope, job.id, `FISCAL_${status}`);
    return { id: job.id, status };
  });
  try {
    return await deliverDocument({ send: (payload) => nubefactRequest(scope.tenantId, payload, job.environment, job.apiUrl), consult: (payload) => consultNubefact(scope.tenantId, payload, job.environment, job.apiUrl) }, {
      complete: (response, status) => persist(status === "SUBMITTED" && job.attempts >= 10 ? "REVIEW" : status, response, status === "ISSUED" ? null : "Aceptación pendiente."),
      uncertain: async (message) => { await persist(job.attempts >= 10 ? "REVIEW" : "UNKNOWN", null, message.slice(0, 1000)); },
    }, JSON.parse(job.payload), job.attempts > 1);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("SUNAT_UNCONFIRMED", 502, error instanceof Error ? error.message : "Resultado pendiente.");
  }
}

export async function runFiscalBatch(limit = 20) {
  const now = new Date();
  const jobs = await prisma.fiscalJob.findMany({ where: { OR: [{ status: { in: ["PENDING", "UNKNOWN", "SUBMITTED"] }, nextAttemptAt: { lte: now } }, { status: "SENDING", leaseExpiresAt: { lte: now } }] }, orderBy: { nextAttemptAt: "asc" }, take: Math.min(100, Math.max(1, limit)) });
  let completed = 0;
  for (const job of jobs) {
    try { await deliverFiscalJob({ tenantId: job.tenantId, branchId: job.branchId, actorId: job.actorId, permissions: [] }, job.id); completed++; }
    catch { /* Durable error/status or a recoverable lease remains; retry on its due date. */ }
  }
  return { scanned: jobs.length, completed };
}
