import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";
import { prisma } from "@/core/database/prisma";
import { requireSession } from "@/core/auth/session";
import { AppError, errorResponse } from "@/core/auth/errors";
import { assertTenantWriteEntitlement } from "@/core/platform/entitlements";
import { storeObject, readStoredObject, deleteStoredObject } from "@/core/storage/service";
import { assertRestaurantModule } from "@/modules/restaurant/server/access";
import { withInventoryTransaction } from "@/modules/inventory/server/service";

export const runtime = "nodejs";
export const maxDuration = 90;
const chunkSize = 4 * 1024 * 1024;
type Part = { index: number; total: number; objectId: string; sha256: string; size: number };
async function context(request: Request, permission: string) {
  const session = await requireSession(permission);
  if (session.tenantType !== "RESTAURANT") throw new AppError("FORBIDDEN", 403, "Solo disponible para restaurantes.");
  assertRestaurantModule(session, "menu");
  const id = z.string().min(1).parse(new URL(request.url).searchParams.get("id"));
  const job = await prisma.restaurantMenuImport.findFirst({ where: { id, tenantId: session.tenantId, branchId: session.branchId } });
  if (!job) throw new AppError("NOT_FOUND", 404, "Importación no encontrada.");
  return { session, job };
}
async function sourceBytes(tenantId: string, manifest: string) {
  const parts = (JSON.parse(manifest) as Part[]).sort((a, b) => a.index - b.index);
  if (!parts.length || parts.length !== parts[0].total || parts.some((part, index) => part.index !== index || part.total !== parts.length)) throw new AppError("SOURCE_INCOMPLETE", 409, "Vuelve a seleccionar el PDF para terminar de conservarlo.");
  const buffers: Buffer[] = [];
  for (const part of parts) {
    const object = await prisma.storedObject.findFirst({ where: { id: part.objectId, tenantId, purpose: "RESTAURANT_MENU_SOURCE" } });
    if (!object) throw new AppError("SOURCE_NOT_FOUND", 404, "No se encontró el archivo conservado.");
    const bytes = await readStoredObject(object);
    if (bytes.length !== part.size || createHash("sha256").update(bytes).digest("hex") !== part.sha256) throw new AppError("SOURCE_CORRUPTED", 409, "El archivo conservado no coincide con el original.");
    buffers.push(bytes);
  }
  return Buffer.concat(buffers);
}
export async function POST(request: Request) {
  try {
    const { session, job } = await context(request, "restaurant:menu:write");
    await assertTenantWriteEntitlement(session.tenantId);
    if (job.sourceVerified) return Response.json({ ok: true });
    const url = new URL(request.url);
    const index = z.coerce.number().int().min(0).max(12).parse(url.searchParams.get("index"));
    const total = z.coerce.number().int().min(1).max(13).parse(url.searchParams.get("total"));
    if (index >= total) throw new AppError("INVALID_PART", 400, "Parte de archivo inválida.");
    // Bound the stream even if Content-Length is absent or forged.
    const reader = request.body?.getReader();
    if (!reader) throw new AppError("INVALID_FILE", 400, "Falta el archivo.");
    const buffers: Uint8Array[] = []; let size = 0;
    for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > chunkSize) { await reader.cancel(); throw new AppError("FILE_TOO_LARGE", 413, "Cada parte debe ocupar hasta 4 MB."); } buffers.push(part.value); }
    if (!size || (index < total - 1 && size !== chunkSize) || (index === total - 1 && (total - 1) * chunkSize + size > 50 * 1024 * 1024)) throw new AppError("INVALID_FILE", 400, "Tamaño de archivo inválido.");
    const bytes = Buffer.concat(buffers), sha256 = createHash("sha256").update(bytes).digest("hex");
    const old = (JSON.parse(job.sourceManifest) as Part[]).find((part) => part.index === index);
    if (old) { if (old.sha256 !== sha256 || old.total !== total) throw new AppError("SOURCE_MISMATCH", 409, "Selecciona el mismo PDF original."); return Response.json({ ok: true }); }
    const stored = await storeObject({ tenantId: session.tenantId, actorId: session.userId, purpose: "RESTAURANT_MENU_SOURCE", originalName: `${job.id}-${index}.part`, mimeType: "application/octet-stream", data: bytes, scanStatus: "NOT_SCANNED" });
    let linked = false;
    try {
      linked = await withInventoryTransaction(async (tx) => {
        const current = await tx.restaurantMenuImport.findUniqueOrThrow({ where: { id: job.id } });
        const parts = JSON.parse(current.sourceManifest) as Part[];
        if (parts.some((part) => part.total !== total)) throw new AppError("SOURCE_MISMATCH", 409, "Selecciona el mismo PDF original.");
        const previous = parts.find((part) => part.index === index);
        if (previous) { if (previous.sha256 !== sha256) throw new AppError("SOURCE_MISMATCH", 409, "Selecciona el mismo PDF original."); return false; }
        parts.push({ index, total, objectId: stored.id, sha256, size });
        await tx.restaurantMenuImport.update({ where: { id: job.id }, data: { sourceManifest: JSON.stringify(parts) } });
        return true;
      });
    } finally { if (!linked) await deleteStoredObject(stored); }
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
export async function PATCH(request: Request) {
  try {
    const { session, job } = await context(request, "restaurant:menu:write");
    await assertTenantWriteEntitlement(session.tenantId);
    if (job.sourceVerified) return Response.json({ ok: true });
    const bytes = await sourceBytes(session.tenantId, job.sourceManifest);
    if (createHash("sha256").update(bytes).digest("hex") !== job.sourceHash || bytes.subarray(0, 5).toString() !== "%PDF-") throw new AppError("SOURCE_MISMATCH", 409, "El archivo no coincide con el PDF original.");
    let document;
    try { document = await PDFDocument.load(bytes); } catch { throw new AppError("INVALID_FILE", 400, "No se pudo abrir el PDF."); }
    if (document.getPageCount() !== job.pageCount) throw new AppError("SOURCE_MISMATCH", 409, "La cantidad de páginas no coincide.");
    await prisma.restaurantMenuImport.update({ where: { id: job.id }, data: { sourceVerified: true } });
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
export async function GET(request: Request) {
  try {
    const { session, job } = await context(request, "restaurant:menu-history:read");
    if (!job.sourceVerified) throw new AppError("SOURCE_NOT_FOUND", 404, "Esta importación no conserva el PDF original.");
    const parts = (JSON.parse(job.sourceManifest) as Part[]).sort((a, b) => a.index - b.index);
    const requested = new URL(request.url).searchParams.get("part");
    if (requested === null) return Response.json({ filename: job.filename, parts: parts.length, sha256: job.sourceHash }, { headers: { "Cache-Control": "private, no-store" } });
    const index = z.coerce.number().int().min(0).max(12).parse(requested);
    const part = parts.find((part) => part.index === index);
    if (!part) throw new AppError("NOT_FOUND", 404, "Parte no encontrada.");
    const object = await prisma.storedObject.findFirst({ where: { id: part.objectId, tenantId: session.tenantId, purpose: "RESTAURANT_MENU_SOURCE" } });
    if (!object) throw new AppError("SOURCE_NOT_FOUND", 404, "Archivo no disponible.");
    const bytes = await readStoredObject(object);
    if (createHash("sha256").update(bytes).digest("hex") !== part.sha256) throw new AppError("SOURCE_CORRUPTED", 409, "El archivo conservado no coincide con el original.");
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/octet-stream", "Content-Disposition": "attachment", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return errorResponse(error); }
}
