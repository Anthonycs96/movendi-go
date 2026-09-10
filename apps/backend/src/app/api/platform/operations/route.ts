import { z } from "zod";
import { requireSession } from "@/core/auth/session";
import { AppError, errorResponse } from "@/core/auth/errors";
import { prisma } from "@/core/database/prisma";
import { mistralStatus, saveMistralKey } from "@/core/platform/mistral";
import { updateTicket } from "@/modules/restaurant/server/launch";
export async function GET() {
  try {
    const session = await requireSession();
    if (!["SUPER_ADMIN", "SUPPORT"].includes(session.platformRole ?? "")) throw new AppError("FORBIDDEN", 403, "Solo administradores y soporte de plataforma.");
    const [mistral, backups, tickets] = await Promise.all([mistralStatus(), prisma.externalBackupRun.findMany({ orderBy: { startedAt: "desc" }, take: 10 }), prisma.restaurantSupportTicket.findMany({ where: { status: { not: "CLOSED" } }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }], take: 100 })]);
    const tenants = await prisma.tenant.findMany({ where: { id: { in: tickets.map((ticket) => ticket.tenantId) } }, select: { id: true, name: true } });
    return Response.json({ checkedAt: new Date().toISOString(), mistral, backups, tickets: tickets.map((ticket) => ({ ...ticket, business: tenants.find((tenant) => tenant.id === ticket.tenantId)?.name ?? "Empresa" })), canConfigure: session.platformRole === "SUPER_ADMIN" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const session = await requireSession();
    if (session.platformRole !== "SUPER_ADMIN") throw new AppError("FORBIDDEN", 403, "Solo el administrador de plataforma configura Mistral.");
    const { token } = z.object({ token: z.string().trim().min(10).max(2000) }).parse(await request.json());
    const status = await saveMistralKey(token, session.userId);
    await prisma.auditLog.create({ data: { tenantId: session.tenantId, userId: session.userId, entityType: "PlatformIntegration", entityId: "MISTRAL", action: "UPDATE_CREDENTIALS", metadata: JSON.stringify({ tokenHint: status.tokenHint }) } });
    return Response.json({ ok: true, message: "Clave guardada y autenticación verificada. Falta probar una página de tu carta.", status });
  } catch (error) { return errorResponse(error); }
}
export async function PUT(request: Request) {
  try {
    const session = await requireSession();
    if (!["SUPER_ADMIN", "SUPPORT"].includes(session.platformRole ?? "")) throw new AppError("FORBIDDEN", 403, "No tienes permisos de soporte.");
    return Response.json(await updateTicket(session.userId, await request.json()));
  } catch (error) { return errorResponse(error); }
}
