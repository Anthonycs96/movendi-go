import { AppError, errorResponse } from "@/core/auth/errors";
import { requireSession } from "@/core/auth/session";
import { assertTenantWriteEntitlement } from "@/core/platform/entitlements";
import { receiverScanner, scannerReceiverSchema, scannerSenderSchema, senderScanner } from "@/modules/minimarket/server/scanner";

export async function POST(request: Request) {
  try {
    const reader = request.body?.getReader(), chunks: Uint8Array[] = [];
    let length = 0;
    if (!reader) throw new AppError("INVALID_INPUT", 400, "Faltan los datos de la lectura.");
    for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 4000) { await reader.cancel(); throw new AppError("PAYLOAD_TOO_LARGE", 413, "La lectura supera el tamaño permitido."); } chunks.push(value); }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new AppError("INVALID_INPUT", 400, "Los datos de la lectura no son válidos."); }
    if (!body || typeof body !== "object") throw new AppError("INVALID_INPUT", 400, "Los datos de la lectura no son válidos.");
    let result;
    if (["pair", "scan", "status"].includes(body.action)) result = await senderScanner(scannerSenderSchema.parse(body));
    else {
      const session = await requireSession();
      if (request.headers.get("x-retail-context") !== [session.tenantId, session.branchId, session.userId].join(":")) throw new AppError("RETAIL_CONTEXT_CHANGED", 409, "Cambió el usuario o la sucursal. Actualiza la página.");
      await assertTenantWriteEntitlement(session.tenantId);
      result = await receiverScanner(session, scannerReceiverSchema.parse(body));
    }
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
