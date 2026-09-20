import { requireSession } from "@/core/auth/session";
import { AppError, errorResponse } from "@/core/auth/errors";
import { assertTenantWriteEntitlement } from "@/core/platform/entitlements";
import { assertMinimarketAccess } from "@/modules/minimarket/server/access";
import { savePaymentQr } from "@/modules/minimarket/server/payment-qr";
import { prisma } from "@/core/database/prisma";
import { hasPermission } from "@/core/auth/permissions";

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    assertMinimarketAccess(session, hasPermission(session.permissions, "settings:write") && session.enabledModules.includes("settings") ? "settings" : "pos");
    const image = await prisma.retailPaymentQr.findFirst({ where: { id: new URL(request.url).searchParams.get("id") ?? "", tenantId: session.tenantId, branchId: session.branchId } });
    if (!image) throw new AppError("NOT_FOUND", 404, "QR no encontrado en esta sucursal.");
    return new Response(Buffer.from(image.imageBase64, "base64"), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const session = await requireSession("settings:write");
    assertMinimarketAccess(session, "settings");
    if (request.headers.get("x-retail-context") !== [session.tenantId, session.branchId, session.userId].join(":")) throw new AppError("RETAIL_CONTEXT_CHANGED", 409, "Cambió la sucursal. Actualiza la página antes de guardar.");
    await assertTenantWriteEntitlement(session.tenantId);
    // Bound actual bytes, including chunked uploads.
    const reader = request.body?.getReader(), chunks: Uint8Array[] = [];
    let length = 0;
    if (!reader) throw new AppError("INVALID_QR_IMAGE", 400, "Selecciona una imagen.");
    for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 2 * 1024 * 1024 + 16384) { await reader.cancel(); throw new AppError("PAYLOAD_TOO_LARGE", 413, "La imagen supera los 2 MB permitidos."); } chunks.push(value); }
    const form = await new Request(request.url, { method: "POST", headers: { "Content-Type": request.headers.get("content-type") ?? "" }, body: Buffer.concat(chunks) }).formData();
    const file = form.get("image"), remove = form.get("remove") === "true";
    if (!remove && !(file instanceof File)) throw new AppError("INVALID_QR_IMAGE", 400, "Selecciona una imagen.");
    const result = await savePaymentQr({ tenantId: session.tenantId, branchId: session.branchId, actorId: session.userId, permissions: session.permissions }, String(form.get("method") ?? ""), String(form.get("payee") ?? ""), remove ? null : new Uint8Array(await (file as File).arrayBuffer()));
    return Response.json(result);
  } catch (error) { return errorResponse(error); }
}
