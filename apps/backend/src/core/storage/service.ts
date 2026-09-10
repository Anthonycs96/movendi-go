import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { StoredObject } from "@prisma/client";
import { prisma } from "@/core/database/prisma";
import { AppError } from "@/core/auth/errors";
import { logEvent } from "@/core/observability/logging";
import { objectStorageProvider, type StorageProviderName } from "./provider";

function safeName(value: string) {
  const cleaned = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
  return cleaned || "archivo.bin";
}

function safeHeaderName(value: string) { return safeName(value).replace(/["\\\r\n]/g, "_"); }

export async function storeObject(input: { tenantId: string; actorId: string; purpose: "TRANSPORT_EXPORT" | "TRANSPORT_DOCUMENT" | "RESTAURANT_MENU_SOURCE"; originalName: string; mimeType: string; data: Buffer; expiresAt?: Date | null; scanStatus: string }) {
  const provider = objectStorageProvider();
  const originalName = safeName(input.originalName);
  const purposeSegment = input.purpose === "TRANSPORT_EXPORT" ? "exports" : "documents";
  const key = `tenants/${safeName(input.tenantId)}/${purposeSegment}/${randomUUID()}/${originalName}`;
  const sha256 = createHash("sha256").update(input.data).digest("hex");
  await provider.put(key, input.data, input.mimeType, { tenant: input.tenantId, purpose: input.purpose, sha256 });
  try {
    const stored = await prisma.storedObject.create({ data: { tenantId: input.tenantId, createdById: input.actorId, provider: provider.name, bucket: provider.bucket, key, originalName, mimeType: input.mimeType, sizeBytes: input.data.byteLength, sha256, purpose: input.purpose, scanStatus: input.scanStatus, expiresAt: input.expiresAt ?? null } });
    logEvent("info", "object_stored", { objectId: stored.id, tenantId: input.tenantId, provider: provider.name, purpose: input.purpose, sizeBytes: input.data.byteLength });
    return stored;
  } catch (error) {
    await provider.delete(key).catch((cleanupError) => logEvent("error", "orphan_object_cleanup_failed", { provider: provider.name, key, error: cleanupError }));
    throw error;
  }
}

function providerFor(record: Pick<StoredObject, "provider" | "bucket">) {
  const provider = objectStorageProvider();
  if (provider.name !== record.provider || provider.bucket !== record.bucket) throw new Error(`El objeto usa ${record.provider}/${record.bucket}, pero el servicio está configurado como ${provider.name}/${provider.bucket}.`);
  return provider;
}

export async function readStoredObject(record: StoredObject) {
  if (record.status !== "ACTIVE" || (record.expiresAt && record.expiresAt <= new Date())) throw new AppError("FILE_NOT_AVAILABLE", 410, "El archivo ya no está disponible.");
  return providerFor(record).read(record.key);
}

export async function storedObjectDownloadResponse(record: StoredObject) {
  if (record.status !== "ACTIVE") throw new AppError("FILE_NOT_AVAILABLE", 410, "El archivo ya no está disponible.");
  if (record.expiresAt && record.expiresAt <= new Date()) throw new AppError("FILE_EXPIRED", 410, "El archivo expiró.");
  const provider = providerFor(record);
  const filename = safeHeaderName(record.originalName);
  const ttl = Math.max(60, Math.min(3_600, Number(process.env.SIGNED_URL_TTL_SECONDS ?? 300)));
  const signedUrl = await provider.signedReadUrl(record.key, filename, record.mimeType, ttl);
  if (signedUrl) return Response.redirect(signedUrl, 302);
  const body = await provider.read(record.key);
  return new Response(new Uint8Array(body), { headers: { "Content-Type": record.mimeType, "Content-Length": String(body.byteLength), "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

export async function deleteStoredObject(record: StoredObject) {
  if (record.status === "DELETED") return;
  const provider = providerFor(record);
  await provider.delete(record.key);
  await prisma.storedObject.update({ where: { id: record.id }, data: { status: "DELETED", deletedAt: new Date() } });
  logEvent("info", "object_deleted", { objectId: record.id, tenantId: record.tenantId, provider: record.provider, purpose: record.purpose });
}

export function isCloudStorage(provider: string): provider is Exclude<StorageProviderName, "local"> { return provider === "gcs" || provider === "s3"; }
