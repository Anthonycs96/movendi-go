import { AppError, errorResponse } from "@/core/auth/errors";
import { requireTenantScope } from "@/core/auth/session";
import { assertTenantWriteEntitlement } from "@/core/platform/entitlements";
import { previewOperationalWorkbook } from "@/modules/transport/server/operational-import";

const MAX_FILE_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const scope = await requireTenantScope("transport:operations:write");
    await assertTenantWriteEntitlement(scope.tenantId);
    const form = await request.formData();
    const file = form.get("file");
    const profileId = String(form.get("profileId") ?? "").trim() || null;
    if (!(file instanceof File)) throw new AppError("FILE_REQUIRED", 400, "Selecciona un archivo Excel.");
    if (!file.name.toLowerCase().endsWith(".xlsx")) throw new AppError("FILE_TYPE_INVALID", 400, "Solo se admiten archivos .xlsx.");
    if (!file.size || file.size > MAX_FILE_BYTES) throw new AppError("FILE_SIZE_INVALID", 413, "El archivo debe pesar menos de 8 MB.");
    const preview = await previewOperationalWorkbook(scope, Buffer.from(await file.arrayBuffer()), file.name, profileId);
    return Response.json({ ok: true, ...preview, message: preview.invalidRows ? "Previsualización lista con observaciones." : "Previsualización validada y lista para confirmar." }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return errorResponse(error); }
}
