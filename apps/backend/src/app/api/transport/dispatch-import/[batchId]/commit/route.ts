import { AppError, errorResponse } from "@/core/auth/errors";
import { requireTenantScope } from "@/core/auth/session";
import { assertTenantWriteEntitlement } from "@/core/platform/entitlements";
import { commitOperationalImport } from "@/modules/transport/server/operational-import";

type Context = { params: Promise<{ batchId: string }> };

export async function POST(_request: Request, context: Context) {
  try {
    const scope = await requireTenantScope("transport:operations:write");
    await assertTenantWriteEntitlement(scope.tenantId, true);
    const { batchId } = await context.params;
    if (!batchId) throw new AppError("IMPORT_BATCH_REQUIRED", 400, "Falta el lote a confirmar.");
    const result = await commitOperationalImport(scope, batchId);
    return Response.json({ ok: true, ...result, message: `${result.created} viaje(s) creados y ${result.updated} actualizados.` });
  } catch (error) { return errorResponse(error); }
}
