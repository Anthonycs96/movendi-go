import "server-only";
import { withSerializableTransaction } from "@/core/database/transactions";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/core/database/prisma";
import { AppError } from "@/core/auth/errors";
import type { TenantScope } from "@/core/auth/types";
import { audit } from "@/core/audit/audit";


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
  await withSerializableTransaction(async (tx) => {
    const previous = await tx.restaurantIntegrationCredential.findUnique({ where: { tenantId_provider: { tenantId: scope.tenantId, provider } } });
    if (previous && previous.environment !== "UNVERIFIED" && previous.environment !== input.environment && previous.apiUrl === input.apiUrl) throw new AppError("SUNAT_ENVIRONMENT_ROUTE", 409, "Usa la ruta asignada por el proveedor al nuevo ambiente; no reutilices la ruta del ambiente anterior.");
    const encrypted = encryptToken(input.token);
    const record = await tx.restaurantIntegrationCredential.upsert({
      where: { tenantId_provider: { tenantId: scope.tenantId, provider } },
      create: { tenantId: scope.tenantId, provider, environment: input.environment, apiUrl: input.apiUrl, ...encrypted, updatedById: scope.actorId },
      update: { environment: input.environment, apiUrl: input.apiUrl, ...encrypted, updatedById: scope.actorId, status: "PENDING", lastError: null },
    });
    await tx.auditLog.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, userId: scope.actorId, action: "UPDATE_CREDENTIALS", entityType: "RestaurantIntegrationCredential", entityId: record.id, metadata: JSON.stringify({ provider, apiUrl: input.apiUrl, tokenHint: encrypted.tokenHint }) } });
  });
  return getSunatConnectionStatus(scope.tenantId);
}

export async function nubefactRequest(tenantId: string, payload: Record<string, unknown>, environment: string, expectedApiUrl?: string) {
  const credential = await prisma.restaurantIntegrationCredential.findUnique({ where: { tenantId_provider: { tenantId, provider } } });
  if (!credential) throw new AppError("SUNAT_CREDENTIALS_MISSING", 409, "Guarda las credenciales de NubeFact antes de conectar SUNAT.");
  if (credential.environment !== environment || !["BETA", "PRODUCTION"].includes(environment)) throw new AppError("SUNAT_ENVIRONMENT_MISMATCH", 409, "Guarda las credenciales específicas del ambiente seleccionado antes de emitir o consultar.");
  if (expectedApiUrl && credential.apiUrl !== expectedApiUrl) throw new AppError("SUNAT_ACCOUNT_CHANGED", 409, "La ruta del proveedor cambió. Restaura la cuenta original para conciliar este documento.");
  if (!isOfficialNubefactUrl(credential.apiUrl)) throw new AppError("SUNAT_INVALID_ROUTE", 409, "La ruta guardada no pertenece al API oficial de NubeFact.");
  const response = await fetch(credential.apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: decryptToken(credential) },
    body: JSON.stringify(payload),
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await response.text();
  let data: Record<string, unknown>;
  try { data = JSON.parse(raw) as Record<string, unknown>; }
  catch { throw new AppError("SUNAT_INVALID_RESPONSE", 502, "El proveedor no devolvió una respuesta JSON válida."); }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new AppError("SUNAT_INVALID_RESPONSE", 502, "El proveedor devolvió una respuesta inesperada.");
  // Official JSON manual: code 24 explicitly means the identity was not found.
  if (!response.ok && payload.operacion === "consultar_comprobante" && [400, 404].includes(response.status) && data?.errors && String(data.codigo) === "24") return data;
  if (!response.ok) throw new AppError("SUNAT_PROVIDER_ERROR", 502, `NubeFact respondió ${response.status}.`, data);
  return data;
}

export async function testSunatConnection(scope: TenantScope, environment: string) {
  try {
    const result = await nubefactRequest(scope.tenantId, { operacion: "consultar_comprobante", tipo_de_comprobante: 2, serie: "BTEST", numero: 0 }, environment);
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


/** Only the provider's documented absence code permits replaying the same payload. */
export async function consultNubefact(tenantId: string, payload: Record<string, unknown>, environment: string, expectedApiUrl?: string) {
  const data = await nubefactRequest(tenantId, payload, environment, expectedApiUrl);
  return data?.errors && String(data.codigo) === "24" ? null : data;
}
