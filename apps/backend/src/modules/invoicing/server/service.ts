import "server-only";
import type { TenantScope } from "@/core/auth/types";
import { AppError } from "@/core/auth/errors";
import { deliverDocument } from "../application/deliver-document";
import type { DocumentKind, FiscalConfiguration } from "../domain/document";
import { claimLegacyDocument, PrismaDocumentDelivery, type FiscalSourceLoader } from "../infrastructure/prisma/document-repository";
import { consultNubefact, nubefactRequest } from "../infrastructure/nubefact";
import { prisma } from "@/core/database/prisma";
import { withSerializableTransaction } from "@/core/database/transactions";
import { deliverFiscalJob, queueSaleDocument } from "./outbox";

export async function issueElectronicDocument(scope: TenantScope, saleId: string, kind: DocumentKind, configuration: FiscalConfiguration, load: FiscalSourceLoader) {
  const job = await withSerializableTransaction(async (tx) => {
    const locked = await tx.sale.updateMany({ where: { id: saleId, tenantId: scope.tenantId, branchId: scope.branchId, status: "PAID" }, data: { status: "PAID" } });
    if (!locked.count) throw new AppError("SALE_NOT_PAID", 409, "Solo se emiten comprobantes de ventas pagadas sin devolución.");
    const existing = await tx.restaurantElectronicDocument.findUnique({ where: { saleId } });
    // Documents reserved before the outbox retain their original reconciliation path.
    if (existing && !await tx.fiscalJob.findUnique({ where: { originKey: `SALE:${saleId}` } })) return null;
    return queueSaleDocument(tx, scope, saleId, kind, configuration, load);
  });
  if (job) {
    await deliverFiscalJob(scope, job.id, true);
    return prisma.restaurantElectronicDocument.findUniqueOrThrow({ where: { saleId } });
  }
  const document = await claimLegacyDocument(scope, saleId, kind, configuration);
  if (document.status === "ISSUED") return document;
  try {
    return await deliverDocument({
      send: (payload) => nubefactRequest(scope.tenantId, payload, document.environment),
      consult: (payload) => consultNubefact(scope.tenantId, payload, document.environment),
    }, new PrismaDocumentDelivery(scope, document), JSON.parse(document.requestPayload!), true);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("SUNAT_UNCONFIRMED", 502, error instanceof Error ? error.message : "No se pudo confirmar el comprobante.");
  }
}
