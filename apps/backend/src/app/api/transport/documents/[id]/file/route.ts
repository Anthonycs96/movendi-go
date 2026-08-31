import { AppError, errorResponse } from "@/core/auth/errors";
import { requireSession } from "@/core/auth/session";
import { audit } from "@/core/audit/audit";
import { prisma } from "@/core/database/prisma";
import { storedObjectDownloadResponse } from "@/core/storage/service";

type Context = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: Context) {
  try {
    const session = await requireSession("transport:documents:read");
    if (session.tenantType !== "TRANSPORT") throw new AppError("MODULE_ACCESS_DENIED", 403, "El archivo pertenece al módulo Transporte.");
    const { id } = await context.params;
    const document = await prisma.transportDocument.findFirst({ where: { id, tenantId: session.tenantId }, include: { storageObject: true } });
    if (!document) throw new AppError("DOCUMENT_NOT_FOUND", 404, "Documento no encontrado.");
    await audit({ tenantId: session.tenantId, branchId: session.branchId, actorId: session.userId, permissions: session.permissions }, "DOWNLOAD", "TransportDocument", document.id, document.storageObjectId ? { storageObjectId: document.storageObjectId } : undefined);
    if (document.storageObject) return storedObjectDownloadResponse(document.storageObject);
    if (document.fileUrl) {
      const legacyUrl = new URL(document.fileUrl);
      if (!["http:", "https:"].includes(legacyUrl.protocol)) throw new AppError("FILE_NOT_AVAILABLE", 410, "La referencia del archivo no es válida.");
      return Response.redirect(legacyUrl, 302);
    }
    throw new AppError("FILE_NOT_FOUND", 404, "Este documento no tiene archivo adjunto.");
  } catch (error) {
    return errorResponse(error);
  }
}
