import { AppError, errorResponse } from "@/core/auth/errors";
import { requireSession } from "@/core/auth/session";
import { canManagePlatformResource, isPlatformRole } from "@/core/platform/access";
import { parseRestaurantCatalogWorkbook } from "@/core/platform/catalog-workbook";
import { loadRestaurantCatalogWorkbookContext } from "@/core/platform/catalog-workbook-context";

type Context = { params: Promise<{ tenantId: string }> };
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request, context: Context) {
  try {
    const session = await requireSession();
    if (!isPlatformRole(session.platformRole) || !canManagePlatformResource(session.platformRole, "businesses")) throw new AppError("FORBIDDEN", 403, "No tienes permiso para administrar implementaciones.");
    const { tenantId } = await context.params;
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("FILE_REQUIRED", 400, "Selecciona una plantilla Excel.");
    if (file.size <= 0 || file.size > MAX_FILE_BYTES) throw new AppError("FILE_SIZE_INVALID", 413, "El archivo debe pesar menos de 5 MB.");
    if (!file.name.toLowerCase().endsWith(".xlsx")) throw new AppError("FILE_TYPE_INVALID", 400, "Solo se admiten archivos .xlsx generados por MOVENDI GO.");
    const source = await loadRestaurantCatalogWorkbookContext(tenantId);
    let result;
    try { result = await parseRestaurantCatalogWorkbook(Buffer.from(await file.arrayBuffer()), tenantId, source.areas); }
    catch (error) {
      const expectedMessage = error instanceof Error && ["El archivo Excel supera los límites seguros permitidos.", "Usa la plantilla de Carta descargada desde MOVENDI GO.", "La plantilla pertenece a otro negocio.", "La plantilla está incompleta. No cambies los nombres de las hojas.", "El archivo contiene demasiadas hojas."].includes(error.message) ? error.message : "No pudimos interpretar el archivo. Descarga una plantilla nueva, complétala sin cambiar sus hojas y vuelve a subirla.";
      throw new AppError("WORKBOOK_INVALID", 400, expectedMessage);
    }
    return Response.json({ ok: result.valid, ...result, message: result.valid ? "Plantilla maestra validada y cargada en la interfaz. Revisa y guarda cada paso." : "Corrige los errores indicados y vuelve a subir la plantilla." }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return errorResponse(error); }
}
