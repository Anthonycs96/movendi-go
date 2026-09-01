import { AppError, errorResponse } from "@/core/auth/errors";
import { requireSession } from "@/core/auth/session";
import { canManagePlatformResource, isPlatformRole } from "@/core/platform/access";
import { buildRestaurantCatalogWorkbook } from "@/core/platform/catalog-workbook";
import { loadRestaurantCatalogWorkbookContext } from "@/core/platform/catalog-workbook-context";

type Context = { params: Promise<{ tenantId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const session = await requireSession();
    if (!isPlatformRole(session.platformRole) || !canManagePlatformResource(session.platformRole, "businesses")) throw new AppError("FORBIDDEN", 403, "No tienes permiso para administrar implementaciones.");
    const { tenantId } = await context.params;
    const source = await loadRestaurantCatalogWorkbookContext(tenantId);
    const workbook = await buildRestaurantCatalogWorkbook(source);
    const filename = `movendi-carta-${source.tenantSlug}.xlsx`;
    return new Response(workbook, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return errorResponse(error); }
}
