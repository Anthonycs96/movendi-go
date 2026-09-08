import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/core/database/prisma";
import { AppError } from "@/core/auth/errors";
import type { TenantScope } from "@/core/auth/types";
import { audit } from "@/core/audit/audit";
import { getRestaurantConfiguration } from "./configuration";
import type { Prisma } from "@prisma/client";
import { withInventoryTransaction } from "@/modules/inventory/server/service";
import { fiscalAmounts, fiscalResponseStatus } from "./fiscal-payload";

const provider = "NUBEFACT";
const NUBEFACT_API_HOST = "api.nubefact.com";

function isOfficialNubefactUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname.toLowerCase() === NUBEFACT_API_HOST
      && (!url.port || url.port === "443")
      && !url.username
      && !url.password;
  } catch {
    return false;
  }
}

export const sunatCredentialSchema = z.object({
  apiUrl: z.string().trim().url().refine(
    isOfficialNubefactUrl,
    "Usa la ruta HTTPS oficial asignada por NubeFact en api.nubefact.com.",
  ),
  environment: z.enum(["BETA", "PRODUCTION"]),
  token: z.string().trim().min(20).max(2000),
});
export const electronicDocumentSchema = z.object({ kind: z.enum(["BOLETA", "FACTURA"]) });

function encryptionKey() {
  const secret = process.env.INTEGRATION_ENCRYPTION_KEY || (process.env.NODE_ENV !== "production" ? process.env.SESSION_SECRET : "");
  if (!secret || secret.length < 32) throw new AppError("INTEGRATION_KEY_MISSING", 503, "Configura la clave segura de integraciones antes de guardar credenciales.");
  return createHash("sha256").update(secret).digest();
}

function encryptToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return { encryptedToken: encrypted.toString("base64"), iv: iv.toString("base64"), authTag: cipher.getAuthTag().toString("base64"), tokenHint: `••••${token.slice(-4)}` };
}

function decryptToken(record: { encryptedToken: string; iv: string; authTag: string }) {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(record.iv, "base64"));
  decipher.setAuthTag(Buffer.from(record.authTag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(record.encryptedToken, "base64")), decipher.final()]).toString("utf8");
}

export async function getSunatConnectionStatus(tenantId: string) {
  const record = await prisma.restaurantIntegrationCredential.findUnique({ where: { tenantId_provider: { tenantId, provider } }, select: { environment: true, apiUrl: true, tokenHint: true, status: true, lastTestedAt: true, lastError: true, updatedAt: true } });
  return record ? { configured: true, ...record, lastTestedAt: record.lastTestedAt?.toISOString() ?? null, updatedAt: record.updatedAt.toISOString() } : { configured: false, status: "NOT_CONFIGURED", apiUrl: "", tokenHint: "", lastTestedAt: null, lastError: null, updatedAt: null };
}

export async function saveSunatCredentials(scope: TenantScope, input: z.infer<typeof sunatCredentialSchema>) {
  const previous = await prisma.restaurantIntegrationCredential.findUnique({ where: { tenantId_provider: { tenantId: scope.tenantId, provider } } });
  if (previous && previous.environment !== "UNVERIFIED" && previous.environment !== input.environment && previous.apiUrl === input.apiUrl) throw new AppError("SUNAT_ENVIRONMENT_ROUTE", 409, "Usa la ruta asignada por el proveedor al nuevo ambiente; no reutilices la ruta del ambiente anterior.");
  const encrypted = encryptToken(input.token);
  const record = await prisma.restaurantIntegrationCredential.upsert({
    where: { tenantId_provider: { tenantId: scope.tenantId, provider } },
    create: { tenantId: scope.tenantId, provider, environment: input.environment, apiUrl: input.apiUrl, ...encrypted, updatedById: scope.actorId },
    update: { environment: input.environment, apiUrl: input.apiUrl, ...encrypted, updatedById: scope.actorId, status: "PENDING", lastError: null },
  });
  await audit(scope, "UPDATE_CREDENTIALS", "RestaurantIntegrationCredential", record.id, { provider, apiUrl: input.apiUrl, tokenHint: encrypted.tokenHint });
  return getSunatConnectionStatus(scope.tenantId);
}

async function nubefactRequest(tenantId: string, payload: Record<string, unknown>, environment: string) {
  const credential = await prisma.restaurantIntegrationCredential.findUnique({ where: { tenantId_provider: { tenantId, provider } } });
  if (!credential) throw new AppError("SUNAT_CREDENTIALS_MISSING", 409, "Guarda las credenciales de NubeFact antes de conectar SUNAT.");
  if (credential.environment !== environment || !["BETA", "PRODUCTION"].includes(environment)) throw new AppError("SUNAT_ENVIRONMENT_MISMATCH", 409, "Guarda las credenciales específicas del ambiente seleccionado antes de emitir o consultar.");
  const response = await fetch(credential.apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: decryptToken(credential) },
    body: JSON.stringify(payload),
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await response.text();
  let data: Record<string, unknown>;
  try { data = JSON.parse(raw) as Record<string, unknown>; } catch { data = { errors: raw.slice(0, 1000) }; }
  if (!response.ok) throw new AppError("SUNAT_PROVIDER_ERROR", 502, `NubeFact respondió ${response.status}.`, data);
  return data;
}

export async function testSunatConnection(scope: TenantScope) {
  try {
    const configuration = await getRestaurantConfiguration(scope.tenantId, scope.branchId);
    const result = await nubefactRequest(scope.tenantId, { operacion: "consultar_comprobante", tipo_de_comprobante: 2, serie: "BTEST", numero: 0 }, configuration.integrations.sunatEnvironment);
    const text = JSON.stringify(result).toLowerCase();
    const unauthorized = text.includes("token") && (text.includes("inválid") || text.includes("invalid") || text.includes("autoriz"));
    if (unauthorized) throw new AppError("SUNAT_AUTH_FAILED", 502, "NubeFact rechazó el token configurado.");
    await prisma.restaurantIntegrationCredential.update({ where: { tenantId_provider: { tenantId: scope.tenantId, provider } }, data: { status: "CONNECTED", lastTestedAt: new Date(), lastError: null } });
    await audit(scope, "TEST_CONNECTION", "RestaurantIntegrationCredential", undefined, { provider, ok: true });
    return { ok: true, status: await getSunatConnectionStatus(scope.tenantId), message: "Conexión con NubeFact validada." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo validar la conexión.";
    await prisma.restaurantIntegrationCredential.updateMany({ where: { tenantId: scope.tenantId, provider }, data: { status: "ERROR", lastTestedAt: new Date(), lastError: message } });
    throw error;
  }
}

function dateInPeru(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.day}-${value.month}-${value.year}`;
}

async function reserveDocumentNumber(tx: Prisma.TransactionClient, scope: TenantScope, kind: string, series: string) {
  const sequence = await tx.restaurantDocumentSequence.upsert({
    where: { tenantId_kind_series: { tenantId: scope.tenantId, kind, series } },
    create: { tenantId: scope.tenantId, branchId: scope.branchId, kind, series, nextNumber: 2 },
    update: { nextNumber: { increment: 1 } }, select: { nextNumber: true },
  });
  return sequence.nextNumber - 1;
}

export async function issueRestaurantElectronicDocument(scope: TenantScope, saleId: string, kind: "BOLETA" | "FACTURA") {
  const configuration = await getRestaurantConfiguration(scope.tenantId, scope.branchId);
  if (!configuration.integrations.sunatEnabled) throw new AppError("SUNAT_DISABLED", 409, "Habilita SUNAT en la configuración antes de emitir.");
  const environment = configuration.integrations.sunatEnvironment;
  const document = await withInventoryTransaction(async (tx) => {
    const locked = await tx.sale.updateMany({ where: { id: saleId, tenantId: scope.tenantId, branchId: scope.branchId, status: "PAID" }, data: { status: "PAID" } });
    if (!locked.count) throw new AppError("SALE_NOT_PAID", 409, "Solo se emiten comprobantes de ventas pagadas sin devolución.");
    const sale = await tx.sale.findFirst({ where: { id: saleId, tenantId: scope.tenantId, branchId: scope.branchId }, include: { electronicDocument: true, customer: true, order: { include: { items: { where: { status: { not: "CANCELLED" } } } } } } });
    if (!sale?.order) throw new AppError("NOT_FOUND", 404, "La venta de restaurante no existe en esta sede.");
    const existing = sale.electronicDocument;
    if (existing) {
      if (existing.kind !== kind) throw new AppError("DOCUMENT_KIND_LOCKED", 409, "Conserva el tipo del comprobante ya reservado.");
      if (existing.environment !== environment) throw new AppError("DOCUMENT_ENVIRONMENT_LOCKED", 409, "Este comprobante pertenece a otro ambiente o requiere conciliación de datos anteriores.");
      if (existing.status === "ISSUED") return existing;
      if (!existing.requestPayload) throw new AppError("FISCAL_LEGACY_REVIEW", 409, "Concilia el comprobante anterior antes de reenviarlo.");
      if (existing.status === "SENDING" && existing.updatedAt > new Date(Date.now() - 60000)) throw new AppError("DOCUMENT_BUSY", 409, "El comprobante está siendo procesado.");
      return tx.restaurantElectronicDocument.update({ where: { id: existing.id }, data: { status: "SENDING", attempts: { increment: 1 } } });
    }
    const credential = await tx.restaurantIntegrationCredential.findUnique({ where: { tenantId_provider: { tenantId: scope.tenantId, provider } } });
    if (!credential || credential.environment !== environment) throw new AppError("SUNAT_ENVIRONMENT_MISMATCH", 409, "Guarda las credenciales del ambiente seleccionado.");
    const identity = sale.customer?.dni?.replace(/\D/g, "") ?? "";
    if (kind === "FACTURA" && identity.length !== 11) throw new AppError("RUC_REQUIRED", 400, "Una factura requiere un cliente con RUC de 11 dígitos.");
    const series = kind === "FACTURA" ? configuration.integrations.sunatInvoiceSeries : configuration.integrations.sunatReceiptSeries;
    const number = await reserveDocumentNumber(tx, scope, kind, series);
    let amounts;
    try { amounts = fiscalAmounts(sale.totalCents, sale.order.items.map((item) => ({ ...item, totalCents: !sale.order!.taxIncluded && item.taxCategory === "GRAVADA" ? Math.round(item.totalCents * (1 + (sale.order!.taxRatePct ?? configuration.general.taxRatePct) / 100)) : item.totalCents })), sale.order.taxRatePct ?? configuration.general.taxRatePct); }
    catch (error) { throw new AppError("FISCAL_CLASSIFICATION", 409, error instanceof Error ? error.message : "Revisa la clasificación tributaria de la venta."); }
    const payload = {
      operacion: "generar_comprobante", tipo_de_comprobante: kind === "FACTURA" ? 1 : 2, serie: series, numero: number,
      sunat_transaction: 1, cliente_tipo_de_documento: kind === "FACTURA" ? 6 : identity.length === 8 ? 1 : identity.length === 11 ? 6 : 0,
      cliente_numero_de_documento: identity || "-", cliente_denominacion: sale.customer?.name ?? "CLIENTE VARIOS", cliente_direccion: "",
      fecha_de_emision: dateInPeru(sale.createdAt), moneda: 1, ...amounts,
      observaciones: `Venta ${sale.code}`, enviar_automaticamente_a_la_sunat: environment === "PRODUCTION", enviar_automaticamente_al_cliente: false,
    };
    return tx.restaurantElectronicDocument.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, saleId, kind, series, number, provider, environment, status: "SENDING", attempts: 1, requestPayload: JSON.stringify(payload) } });
  });
  if (document.status === "ISSUED") return document;
  if (!document.requestPayload) throw new AppError("FISCAL_LEGACY_REVIEW", 409, "El comprobante anterior necesita conciliación antes de reenviarse.");
  try {
    const payload = JSON.parse(document.requestPayload) as Record<string, unknown>;
    // A retry always consults the immutable series/number before attempting another send.
    let response = document.attempts > 1 ? await nubefactRequest(scope.tenantId, { operacion: "consultar_comprobante", tipo_de_comprobante: kind === "FACTURA" ? 1 : 2, serie: document.series, numero: document.number }, environment) : null;
    if (!response || response.errors) response = await nubefactRequest(scope.tenantId, payload, environment);
    if (response.errors) throw new AppError("SUNAT_REJECTED", 422, String(response.errors));
    const status = fiscalResponseStatus(response);
    const url = (value: unknown) => typeof value === "string" && value.startsWith("https://") ? value : null;
    const updated = await prisma.restaurantElectronicDocument.update({ where: { id: document.id }, data: { status, lastError: status === "ISSUED" ? null : "Enviado al proveedor; aceptación de SUNAT pendiente de confirmar.", response: JSON.stringify(response), requestId: String(response.codigo_hash ?? ""), pdfUrl: url(response.enlace_del_pdf), xmlUrl: url(response.enlace_del_xml), cdrUrl: url(response.enlace_del_cdr), issuedAt: status === "ISSUED" ? new Date() : null } });
    await audit(scope, status, "RestaurantElectronicDocument", document.id, { saleId, kind, environment, series: document.series, number: document.number });
    return updated;
  } catch (error) {
    await prisma.restaurantElectronicDocument.update({ where: { id: document.id }, data: { status: "FAILED", lastError: error instanceof Error ? error.message : "No se pudo confirmar el envío." } });
    throw error;
  }
}

export async function issueRestaurantCreditNote(scope: TenantScope, saleId: string) {
  const refund = await withInventoryTransaction(async (tx) => {
    const current = await tx.saleRefund.findFirst({ where: { saleId, tenantId: scope.tenantId, branchId: scope.branchId }, include: { sale: { include: { electronicDocument: true } } } });
    if (!current) throw new AppError("REFUND_REQUIRED", 409, "Registra primero la devolución total de la venta.");
    const original = current.sale.electronicDocument;
    if (!original?.requestPayload || original.status !== "ISSUED") throw new AppError("ORIGINAL_DOCUMENT_REQUIRED", 409, "La nota requiere el comprobante original aceptado y su trama guardada.");
    if (current.creditStatus === "ISSUED" || current.creditPayload) return { ...current, environment: original.environment };
    const series = original.series;
    const number = await reserveDocumentNumber(tx, scope, "CREDIT_NOTE", series);
    const payload = { ...JSON.parse(original.requestPayload), tipo_de_comprobante: 3, serie: series, numero: number, fecha_de_emision: dateInPeru(new Date()), documento_que_se_modifica_tipo: original.kind === "FACTURA" ? 1 : 2, documento_que_se_modifica_serie: original.series, documento_que_se_modifica_numero: original.number, tipo_de_nota_de_credito: 1, observaciones: current.reason };
    const updated = await tx.saleRefund.update({ where: { id: current.id }, data: { creditSeries: series, creditNumber: number, creditPayload: JSON.stringify(payload), creditUpdatedAt: new Date() } });
    return { ...updated, environment: original.environment };
  });
  if (refund.creditStatus === "ISSUED") return { ok: true, message: "La nota de crédito ya está aceptada." };
  const claim = await prisma.saleRefund.updateMany({ where: { id: refund.id, creditUpdatedAt: refund.creditUpdatedAt, OR: [{ creditStatus: { not: "SENDING" } }, { creditUpdatedAt: { lt: new Date(Date.now() - 60000) } }] }, data: { creditStatus: "SENDING", creditUpdatedAt: new Date() } });
  if (!claim.count) throw new AppError("CREDIT_NOTE_BUSY", 409, "La nota está siendo procesada.");
  try {
    let response = refund.creditStatus !== "PENDING" || refund.creditResponse || refund.creditError ? await nubefactRequest(scope.tenantId, { operacion: "consultar_comprobante", tipo_de_comprobante: 3, serie: refund.creditSeries, numero: refund.creditNumber }, refund.environment) : null;
    if (!response || response.errors) response = await nubefactRequest(scope.tenantId, JSON.parse(refund.creditPayload!), refund.environment);
    if (response.errors) throw new AppError("CREDIT_NOTE_REJECTED", 422, String(response.errors));
    const status = fiscalResponseStatus(response);
    await prisma.saleRefund.update({ where: { id: refund.id }, data: { creditStatus: status, creditResponse: JSON.stringify(response), creditError: null, creditUpdatedAt: new Date() } });
    await audit(scope, "CREDIT_NOTE", "Sale", saleId, { refundId: refund.id, status, series: refund.creditSeries, number: refund.creditNumber });
    return { ok: true, message: status === "ISSUED" ? "Nota de crédito aceptada." : "Nota enviada; aceptación pendiente. Puedes consultar de nuevo." };
  } catch (error) {
    await prisma.saleRefund.update({ where: { id: refund.id }, data: { creditStatus: "FAILED", creditError: error instanceof Error ? error.message : "No se pudo confirmar la nota.", creditUpdatedAt: new Date() } });
    throw error;
  }
}
