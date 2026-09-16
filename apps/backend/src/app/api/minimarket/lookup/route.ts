import { requireSession, requireTenantScope } from "@/core/auth/session";
import { AppError, errorResponse } from "@/core/auth/errors";
import { assertMinimarketAccess } from "@/modules/minimarket/server/access";
import { lookupBarcode } from "@/modules/minimarket/server/lookup";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const section = params.get("section") ?? "pos";
    if (!["pos", "catalog", "inventory", "purchases"].includes(section)) throw new AppError("FORBIDDEN", 403, "Selecciona una sección de consulta habilitada.");
    // The context uses the existing section/module permission, never a client-supplied scope.
    const session = await requireSession();
    assertMinimarketAccess(session, section);
    const scope = await requireTenantScope();
    const result = await lookupBarcode(scope, params.get("code") ?? "");
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
