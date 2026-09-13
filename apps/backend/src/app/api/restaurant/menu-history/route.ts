import { withSerializableTransaction } from "@/core/database/transactions";
import { z } from "zod";
import { prisma } from "@/core/database/prisma";
import { requireSession } from "@/core/auth/session";
import { hasPermission } from "@/core/auth/permissions";
import { AppError, errorResponse } from "@/core/auth/errors";
import { assertTenantWriteEntitlement } from "@/core/platform/entitlements";
import { assertRestaurantModule } from "@/modules/restaurant/server/access";

import { parseMenuHistory, revertMenuHistory } from "@/modules/restaurant/server/menu-history";

export async function GET(request: Request) {
  try {
    const session = await requireSession("restaurant:menu-history:read");
    if (session.tenantType !== "RESTAURANT") throw new AppError("FORBIDDEN", 403, "Solo disponible para restaurantes.");
    assertRestaurantModule(session, "menu");
    const url = new URL(request.url);
    const page = z.coerce.number().int().min(1).max(100000).parse(url.searchParams.get("page") ?? 1);
    const type = z.enum(["ALL", "PDF", "MANUAL"]).parse(url.searchParams.get("type") ?? "ALL");
    const where = { tenantId: session.tenantId, branchId: session.branchId, OR: [
      { entityType: "RestaurantMenuHistory", ...(type !== "ALL" ? { metadata: { contains: `"source":"${type}"` } } : {}) },
      ...(type !== "MANUAL" ? [{ entityType: "RestaurantMenuImport", action: "IMPORT_MENU" }] : []),
      ...(type !== "PDF" ? [{ entityType: "Product", action: { in: ["CREATE", "UPDATE"] } }] : []),
    ] };
    const [entries, count] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 20, include: { user: { select: { name: true } } } }),
      prisma.auditLog.count({ where }),
    ]);
    const reverted = await prisma.auditLog.findMany({ where: { tenantId: session.tenantId, branchId: session.branchId, entityType: "RestaurantMenuHistory", action: "MENU_REVERT", entityId: { in: entries.map((entry) => entry.id) } }, select: { entityId: true } });
    const importIds = entries.map((entry) => parseMenuHistory(entry.metadata)?.importId ?? (entry.entityType === "RestaurantMenuImport" ? entry.entityId : null)).filter((id): id is string => Boolean(id));
    const jobs = await prisma.restaurantMenuImport.findMany({ where: { id: { in: importIds }, tenantId: session.tenantId, branchId: session.branchId }, select: { id: true, filename: true, sourceVerified: true } });
    return Response.json({ page, pages: Math.max(1, Math.ceil(count / 20)), count, canRevert: hasPermission(session.permissions, "restaurant:menu-history:revert"), entries: entries.map((entry) => {
      const history = parseMenuHistory(entry.metadata);
      const job = jobs.find((job) => job.id === (history?.importId ?? entry.entityId));
      return { id: entry.id, createdAt: entry.createdAt, actor: entry.user?.name ?? "Usuario no disponible", action: entry.action, history, filename: job?.filename, importId: job?.id, sourceAvailable: job?.sourceVerified ?? false, reverted: reverted.some((item) => item.entityId === entry.id) };
    }) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession("restaurant:menu-history:revert");
    if (!hasPermission(session.permissions, "restaurant:menu-history:read") || !hasPermission(session.permissions, "restaurant:menu:write")) throw new AppError("FORBIDDEN", 403, "Necesitas ver el historial y administrar la carta para revertir.");
    if (session.tenantType !== "RESTAURANT") throw new AppError("FORBIDDEN", 403, "Solo disponible para restaurantes.");
    assertRestaurantModule(session, "menu");
    await assertTenantWriteEntitlement(session.tenantId);
    const input = z.object({ id: z.string().min(1), reason: z.string().trim().min(5).max(500), confirmed: z.literal(true) }).parse(await request.json());
    return Response.json(await withSerializableTransaction((tx) => revertMenuHistory(tx, { tenantId: session.tenantId, branchId: session.branchId, actorId: session.userId }, input.id, input.reason)));
  } catch (error) { return errorResponse(error); }
}
