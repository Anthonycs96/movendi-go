import type { Prisma, RestaurantElectronicDocument } from "@prisma/client";
import { prisma } from "@/core/database/prisma";
import { withSerializableTransaction } from "@/core/database/transactions";
import { AppError } from "@/core/auth/errors";
import type { TenantScope } from "@/core/auth/types";
import type { DeliveryRepository, ProviderResponse } from "../../application/deliver-document";
import type { DocumentKind, FiscalConfiguration, FiscalSource } from "../../domain/document";

export type FiscalSourceLoader = (tx: Prisma.TransactionClient) => Promise<FiscalSource>;
const scopeWhere = (scope: TenantScope) => ({ tenantId: scope.tenantId, branchId: scope.branchId });

export async function reserveDocumentNumber(tx: Prisma.TransactionClient, scope: TenantScope, kind: string, series: string) {
  // Keep the tenant-wide identity and existing counters. A branch/environment
  // must never reset an already used provider series.
  const sequence = await tx.restaurantDocumentSequence.upsert({
    where: { tenantId_kind_series: { tenantId: scope.tenantId, kind, series } },
    create: { ...scopeWhere(scope), kind, series, nextNumber: 2 },
    update: { nextNumber: { increment: 1 } }, select: { nextNumber: true },
  });
  return sequence.nextNumber - 1;
}

export async function claimLegacyDocument(scope: TenantScope, saleId: string, kind: DocumentKind, configuration: FiscalConfiguration) {
  if (!configuration.enabled) throw new AppError("SUNAT_DISABLED", 409, "Habilita SUNAT en la configuración antes de emitir.");
  return withSerializableTransaction(async (tx) => {
    const locked = await tx.sale.updateMany({ where: { id: saleId, ...scopeWhere(scope), status: "PAID" }, data: { status: "PAID" } });
    if (!locked.count) throw new AppError("SALE_NOT_PAID", 409, "Solo se emiten comprobantes de ventas pagadas sin devolución.");
    const existing = await tx.restaurantElectronicDocument.findFirst({ where: { saleId, ...scopeWhere(scope) } });
    if (existing) {
      if (existing.kind !== kind) throw new AppError("DOCUMENT_KIND_LOCKED", 409, "Conserva el tipo del comprobante ya reservado.");
      if (existing.environment !== configuration.environment) throw new AppError("DOCUMENT_ENVIRONMENT_LOCKED", 409, "El comprobante pertenece a otro ambiente.");
      if (existing.status === "ISSUED") return existing;
      if (!existing.requestPayload) throw new AppError("FISCAL_LEGACY_REVIEW", 409, "Concilia el comprobante anterior antes de reenviarlo.");
      if (existing.status === "SENDING" && existing.updatedAt > new Date(Date.now() - 60_000)) throw new AppError("DOCUMENT_BUSY", 409, "El comprobante está siendo procesado.");
      return tx.restaurantElectronicDocument.update({ where: { id: existing.id }, data: { status: "SENDING", attempts: { increment: 1 } } });
    }
    throw new AppError("FISCAL_LEGACY_REVIEW", 409, "No existe un comprobante anterior para conciliar.");
  });
}

export class PrismaDocumentDelivery implements DeliveryRepository<RestaurantElectronicDocument> {
  constructor(private readonly scope: TenantScope, private readonly document: RestaurantElectronicDocument) {}
  private lease() { return { id: this.document.id, ...scopeWhere(this.scope), attempts: this.document.attempts, status: "SENDING" }; }
  async uncertain(message: string) {
    // UNKNOWN blocks refunds: timeout cannot prove that no fiscal document exists.
    await prisma.restaurantElectronicDocument.updateMany({ where: this.lease(), data: { status: "UNKNOWN", lastError: message.slice(0, 1000) } });
  }
  complete(response: ProviderResponse, status: "ISSUED" | "SUBMITTED") {
    return withSerializableTransaction(async (tx) => {
      const url = (value: unknown) => { try { const parsed = new URL(String(value)); return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.href : null; } catch { return null; } };
      const updated = await tx.restaurantElectronicDocument.updateMany({ where: this.lease(), data: {
        status, response: JSON.stringify(response), lastError: status === "ISSUED" ? null : "Aceptación de SUNAT pendiente de confirmar.",
        requestId: String(response.codigo_hash ?? ""), pdfUrl: url(response.enlace_del_pdf), xmlUrl: url(response.enlace_del_xml), cdrUrl: url(response.enlace_del_cdr), issuedAt: status === "ISSUED" ? new Date() : null,
      } });
      if (!updated.count) throw new AppError("DOCUMENT_LEASE_LOST", 409, "Otro intento actualizó el comprobante. Consulta su estado.");
      await tx.auditLog.create({ data: { ...scopeWhere(this.scope), userId: this.scope.actorId, action: status, entityType: "RestaurantElectronicDocument", entityId: this.document.id, metadata: JSON.stringify({ saleId: this.document.saleId, series: this.document.series, number: this.document.number }) } });
      return tx.restaurantElectronicDocument.findUniqueOrThrow({ where: { id: this.document.id } });
    });
  }
}
