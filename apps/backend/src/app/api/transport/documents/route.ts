import { AppError, errorResponse } from "@/core/auth/errors";
import { requireSession } from "@/core/auth/session";
import { assertTenantWriteEntitlement } from "@/core/platform/entitlements";
import { deleteStoredObject, storeObject } from "@/core/storage/service";
import { scanUploadedFile } from "@/core/storage/scanner";
import { validateUploadedDocument } from "@/core/storage/validation";
import { documentSchema } from "@/modules/transport/server/command-schemas";
import { parse } from "@/modules/transport/server/command-helpers";
import { assertDocumentOwner, createTransportDocument } from "@/modules/transport/server/commands/fleet";

export const dynamic = "force-dynamic";

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

export async function POST(request: Request) {
  try {
    const session = await requireSession("transport:documents:write");
    if (session.tenantType !== "TRANSPORT") throw new AppError("MODULE_ACCESS_DENIED", 403, "La carga documental pertenece al módulo Transporte.");
    await assertTenantWriteEntitlement(session.tenantId);
    const maxBytes = Math.max(1, Math.min(50, Number(process.env.DOCUMENT_MAX_MB ?? 10))) * 1024 * 1024;
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > maxBytes + 256 * 1024) throw new AppError("FILE_TOO_LARGE", 413, "La solicitud supera el tamaño permitido.");
    const form = await request.formData();
    const input = parse(documentSchema, { ownerType: text(form, "ownerType"), ownerId: text(form, "ownerId"), type: text(form, "type"), number: text(form, "number"), issuedAt: text(form, "issuedAt"), expiresAt: text(form, "expiresAt"), fileUrl: "", notes: text(form, "notes") });
    await assertDocumentOwner(session.tenantId, input.ownerType, input.ownerId);
    const fileValue = form.get("file");
    const file = fileValue instanceof File && fileValue.size ? fileValue : null;
    let stored = null;
    if (file) {
      const data = Buffer.from(await file.arrayBuffer());
      const { mimeType } = validateUploadedDocument(file, data);
      const scanStatus = await scanUploadedFile(data);
      stored = await storeObject({ tenantId: session.tenantId, actorId: session.userId, purpose: "TRANSPORT_DOCUMENT", originalName: file.name, mimeType, data, scanStatus });
    }
    try {
      const entity = await createTransportDocument(input, { tenantId: session.tenantId, branchId: session.branchId, actorId: session.userId, permissions: session.permissions }, stored?.id);
      return Response.json({ ok: true, id: entity.id, storageObjectId: stored?.id ?? null, scanStatus: stored?.scanStatus ?? null, message: stored ? "Documento y archivo almacenados de forma segura." : "Documento registrado sin archivo adjunto." });
    } catch (error) {
      if (stored) await deleteStoredObject(stored).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    return errorResponse(error);
  }
}
