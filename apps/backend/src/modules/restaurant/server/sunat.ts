import "server-only";
import { AppError } from "@/core/auth/errors";
import type { TenantScope } from "@/core/auth/types";
import type { Prisma } from "@prisma/client";
import type { RestaurantConfiguration } from "@movendi/contracts";
import { getRestaurantConfiguration } from "./configuration";
import { issueElectronicDocument } from "@/modules/invoicing/server/service";
import { commercialFiscalSource, type FiscalCommercialSnapshot } from "@/modules/invoicing/domain/commercial-source";
import { testSunatConnection as testConnection } from "@/modules/invoicing/server/connection";
import { queueSaleDocument } from "@/modules/invoicing/server/outbox";
export { sunatCredentialSchema, electronicDocumentSchema, getSunatConnectionStatus, saveSunatCredentials } from "@/modules/invoicing/server/connection";

export async function testSunatConnection(scope: TenantScope) {
  const configuration = await getRestaurantConfiguration(scope.tenantId, scope.branchId);
  return testConnection(scope, configuration.integrations.sunatEnvironment);
}

export async function issueRestaurantElectronicDocument(scope: TenantScope, saleId: string, kind: "BOLETA" | "FACTURA") {
  const configuration = await getRestaurantConfiguration(scope.tenantId, scope.branchId);
  return issueElectronicDocument(scope, saleId, kind, fiscalSettings(configuration), (tx) => restaurantFiscalSource(tx, scope, saleId, configuration));
}

function fiscalSettings(configuration: RestaurantConfiguration) {
  const settings = configuration.integrations;
  return { enabled: settings.sunatEnabled, environment: settings.sunatEnvironment, invoiceSeries: settings.sunatInvoiceSeries, receiptSeries: settings.sunatReceiptSeries };
}

export async function queueRestaurantSaleDocument(tx: Prisma.TransactionClient, scope: TenantScope, saleId: string, configuration: RestaurantConfiguration) {
  const source = await restaurantFiscalSource(tx, scope, saleId, configuration);
  return queueSaleDocument(tx, scope, saleId, source.customerDocument.length === 11 ? "FACTURA" : "BOLETA", fiscalSettings(configuration), async () => source);
}

async function restaurantFiscalSource(tx: Prisma.TransactionClient, scope: TenantScope, saleId: string, configuration: RestaurantConfiguration) {
    const sale = await tx.sale.findFirst({ where: { id: saleId, tenantId: scope.tenantId, branchId: scope.branchId }, include: { customer: true, tenant: { select: { currency: true } }, order: { include: { items: { where: { status: { not: "CANCELLED" } } } } } } });
    if (!sale?.order) throw new AppError("NOT_FOUND", 404, "La venta de restaurante no existe en esta sede.");
    const snapshot = sale.commercialSnapshot ? JSON.parse(sale.commercialSnapshot) as FiscalCommercialSnapshot : null;
    if (snapshot?.fiscal) return commercialFiscalSource(snapshot, sale.code, sale.createdAt);
    // Explicit legacy adapter: old sales do not have the frozen customer/tax context.
    const order = sale.order;
    return { code: sale.code, date: sale.createdAt, currency: snapshot?.currency ?? sale.tenant.currency, totalCents: sale.totalCents,
      customerDocument: sale.customer?.dni?.replace(/\D/g, "") ?? "", customerName: sale.customer?.name ?? "CLIENTE VARIOS", taxRatePct: order.taxRatePct ?? configuration.general.taxRatePct,
      lines: order.items.map((item) => ({ ...item, totalCents: !order.taxIncluded && item.taxCategory === "GRAVADA" ? Math.round(item.totalCents * (1 + (order.taxRatePct ?? configuration.general.taxRatePct) / 100)) : item.totalCents })),
    };
}

export { issueFullRefundCreditNote as issueRestaurantCreditNote } from "@/modules/invoicing/server/credit-note";
