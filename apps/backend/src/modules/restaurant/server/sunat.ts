import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/core/database/prisma";
import { AppError } from "@/core/auth/errors";
import type { TenantScope } from "@/core/auth/types";
import { audit } from "@/core/audit/audit";
import { getRestaurantConfiguration } from "./configuration";

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
  const record = await prisma.restaurantIntegrationCredential.findUnique({ where: { tenantId_provider: { tenantId, provider } }, select: { apiUrl: true, tokenHint: true, status: true, lastTestedAt: true, lastError: true, updatedAt: true } });
  return record ? { configured: true, ...record, lastTestedAt: record.lastTestedAt?.toISOString() ?? null, updatedAt: record.updatedAt.toISOString() } : { configured: false, status: "NOT_CONFIGURED", apiUrl: "", tokenHint: "", lastTestedAt: null, lastError: null, updatedAt: null };
}

export async function saveSunatCredentials(scope: TenantScope, input: z.infer<typeof sunatCredentialSchema>) {
  const encrypted = encryptToken(input.token);
  const record = await prisma.restaurantIntegrationCredential.upsert({
    where: { tenantId_provider: { tenantId: scope.tenantId, provider } },
    create: { tenantId: scope.tenantId, provider, apiUrl: input.apiUrl, ...encrypted, updatedById: scope.actorId },
    update: { apiUrl: input.apiUrl, ...encrypted, updatedById: scope.actorId, status: "PENDING", lastError: null },
  });
  await audit(scope, "UPDATE_CREDENTIALS", "RestaurantIntegrationCredential", record.id, { provider, apiUrl: input.apiUrl, tokenHint: encrypted.tokenHint });
  return getSunatConnectionStatus(scope.tenantId);
}

async function nubefactRequest(tenantId: string, payload: Record<string, unknown>) {
  const credential = await prisma.restaurantIntegrationCredential.findUnique({ where: { tenantId_provider: { tenantId, provider } } });
  if (!credential) throw new AppError("SUNAT_CREDENTIALS_MISSING", 409, "Guarda las credenciales de NubeFact antes de conectar SUNAT.");
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
    const result = await nubefactRequest(scope.tenantId, { operacion: "consultar_comprobante", tipo_de_comprobante: 2, serie: "BTEST", numero: 0 });
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

function money(cents: number) { return Math.round(cents) / 100; }

async function reserveDocumentNumber(scope: TenantScope, kind: "BOLETA" | "FACTURA", series: string) {
  const sequence = await prisma.restaurantDocumentSequence.upsert({
    where: { tenantId_branchId_kind_series: { tenantId: scope.tenantId, branchId: scope.branchId, kind, series } },
    create: { tenantId: scope.tenantId, branchId: scope.branchId, kind, series, nextNumber: 2 },
    update: { nextNumber: { increment: 1 } },
    select: { nextNumber: true },
  });
  return sequence.nextNumber - 1;
}

export async function issueRestaurantElectronicDocument(scope: TenantScope, saleId: string, kind: "BOLETA" | "FACTURA") {
  const configuration = await getRestaurantConfiguration(scope.tenantId, scope.branchId);
  if (!configuration.integrations.sunatEnabled) throw new AppError("SUNAT_DISABLED", 409, "Habilita SUNAT en la configuración antes de emitir.");
  const sale = await prisma.sale.findFirst({ where: { id: saleId, tenantId: scope.tenantId, branchId: scope.branchId }, include: { electronicDocument: true, customer: true, order: { include: { items: { where: { status: { not: "CANCELLED" } }, include: { product: true } } } } } });
  if (!sale?.order) throw new AppError("NOT_FOUND", 404, "La venta de restaurante no existe en esta sede.");
  if (sale.electronicDocument?.status === "ISSUED") return sale.electronicDocument;
  if (sale.electronicDocument && sale.electronicDocument.kind !== kind) throw new AppError("DOCUMENT_KIND_LOCKED", 409, `La venta ya reservó la serie como ${sale.electronicDocument.kind}; reintenta con el mismo tipo.`);
  const documentNumber = sale.customer?.dni?.replace(/\D/g, "") ?? "";
  if (kind === "FACTURA" && documentNumber.length !== 11) throw new AppError("RUC_REQUIRED", 400, "Una factura requiere un cliente con RUC válido de 11 dígitos.");
  const series = sale.electronicDocument?.series ?? (kind === "FACTURA" ? configuration.integrations.sunatInvoiceSeries : configuration.integrations.sunatReceiptSeries);
  const number = sale.electronicDocument?.number ?? await reserveDocumentNumber(scope, kind, series);
  const document = sale.electronicDocument ?? await prisma.restaurantElectronicDocument.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, saleId: sale.id, kind, series, number, provider } });
  const taxRate = configuration.general.taxRatePct || 18;
  const taxableCents = Math.round(sale.totalCents / (1 + taxRate / 100));
  const taxCents = sale.totalCents - taxableCents;
  const customerType = kind === "FACTURA" ? 6 : documentNumber.length === 8 ? 1 : 0;
  const ratio = sale.subtotalCents > 0 ? sale.totalCents / sale.subtotalCents : 1;
  const payload = {
    operacion: "generar_comprobante", tipo_de_comprobante: kind === "FACTURA" ? 1 : 2, serie: series, numero: number,
    sunat_transaction: 1, cliente_tipo_de_documento: customerType, cliente_numero_de_documento: documentNumber || "-",
    cliente_denominacion: sale.customer?.name ?? "CLIENTE VARIOS", cliente_direccion: "", fecha_de_emision: dateInPeru(sale.createdAt), moneda: 1,
    porcentaje_de_igv: taxRate, total_gravada: money(taxableCents), total_igv: money(taxCents), total: money(sale.totalCents),
    observaciones: `Venta ${sale.code}`, enviar_automaticamente_a_la_sunat: true, enviar_automaticamente_al_cliente: false,
    items: sale.order.items.map((item) => {
      const lineTotal = Math.round(item.totalCents * ratio);
      const lineTaxable = Math.round(lineTotal / (1 + taxRate / 100));
      const lineTax = lineTotal - lineTaxable;
      return { unidad_de_medida: "NIU", codigo: item.productId, descripcion: item.name, cantidad: item.quantity, valor_unitario: money(Math.round(lineTaxable / item.quantity)), precio_unitario: money(Math.round(lineTotal / item.quantity)), subtotal: money(lineTaxable), tipo_de_igv: 1, igv: money(lineTax), total: money(lineTotal) };
    }),
  };
  try {
    const response = await nubefactRequest(scope.tenantId, payload);
    if (response.errors) throw new AppError("SUNAT_REJECTED", 422, String(response.errors), response);
    const updated = await prisma.restaurantElectronicDocument.update({ where: { id: document.id }, data: { status: "ISSUED", attempts: { increment: 1 }, lastError: null, requestId: String(response.codigo_hash ?? response.aceptada_por_sunat ?? ""), response: JSON.stringify(response), pdfUrl: typeof response.enlace_del_pdf === "string" ? response.enlace_del_pdf : null, xmlUrl: typeof response.enlace_del_xml === "string" ? response.enlace_del_xml : null, cdrUrl: typeof response.enlace_del_cdr === "string" ? response.enlace_del_cdr : null, issuedAt: new Date() } });
    await audit(scope, "ISSUE", "RestaurantElectronicDocument", document.id, { saleId, kind, series, number, provider });
    return updated;
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo emitir el comprobante.";
    await prisma.restaurantElectronicDocument.update({ where: { id: document.id }, data: { status: "FAILED", attempts: { increment: 1 }, lastError: message } });
    throw error;
  }
}
