import { AppError, errorResponse } from "@/core/auth/errors";
import { requireSession } from "@/core/auth/session";
import { prisma } from "@/core/database/prisma";
import { assertRestaurantModule } from "@/modules/restaurant/server/access";
import type { RestaurantStaffActivity } from "@movendi/contracts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await requireSession("restaurant:staff:read");
    if (session.tenantType !== "RESTAURANT") throw new AppError("FORBIDDEN", 403, "Esta consulta es exclusiva del restaurante.");
    assertRestaurantModule(session, "floor");
    const params = new URL(request.url).searchParams;
    const days = params.get("days") ?? "1";
    const workerId = params.get("worker") || undefined;
    if (!["1", "7"].includes(days)) throw new AppError("VALIDATION_ERROR", 400, "Selecciona un período válido.");
    const since = new Date(Date.now() - Number(days) * 86_400_000);
    const scope = { tenantId: session.tenantId, branchId: session.branchId };
    const activityScope = { ...scope, createdAt: { gte: since } };
    const members = await prisma.membership.findMany({
      where: { tenantId: session.tenantId, OR: [{ branchId: session.branchId }, { branchId: null }] },
      orderBy: { user: { name: "asc" } },
      select: { active: true, role: { select: { name: true } }, user: { select: {
        id: true, name: true, active: true,
        auditLogs: { where: activityScope, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: { action: true, entityType: true, createdAt: true } },
        _count: { select: { createdOrders: { where: { ...scope, status: { notIn: ["COMPLETED", "CANCELLED"] } } } } },
      } } },
    });
    if (workerId && !members.some((member) => member.user.id === workerId)) throw new AppError("NOT_FOUND", 404, "Trabajador no encontrado en esta sucursal.");
    const cursorId = params.get("cursor");
    const cursor = cursorId ? await prisma.auditLog.findFirst({ where: { ...activityScope, id: cursorId, userId: workerId }, select: { id: true, createdAt: true } }) : null;
    if (cursorId && !cursor) throw new AppError("VALIDATION_ERROR", 400, "Actualiza la actividad para continuar.");
    const events = await prisma.auditLog.findMany({
      where: { ...activityScope, userId: workerId, ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51,
      select: { id: true, action: true, entityType: true, createdAt: true, user: { select: { id: true, name: true } } },
    });
    const data: RestaurantStaffActivity = {
      updatedAt: new Date().toISOString(), since: since.toISOString(),
      workers: members.map(({ user, role, active }) => ({ id: user.id, name: user.name, role: role.name, active: active && user.active, openOrders: user._count.createdOrders, lastActivity: user.auditLogs[0] ? { ...user.auditLogs[0], createdAt: user.auditLogs[0].createdAt.toISOString() } : null })),
      events: events.slice(0, 50).map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
      nextCursor: events.length > 50 ? events[49].id : null,
    };
    return Response.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
