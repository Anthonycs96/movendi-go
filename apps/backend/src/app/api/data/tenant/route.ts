import { AppError, errorResponse } from "@/core/auth/errors";
import { requireSession, toSessionView } from "@/core/auth/session";
import { getCoreTenantData } from "@/core/tenancy/data";
import { prisma } from "@/core/database/prisma";
import { getBarbershopData } from "@/modules/barbershop/server/data";
import { getRestaurantData } from "@/modules/restaurant/server/data";
import { normalizeRestaurantReportPeriod } from "@/modules/restaurant/server/reports";
import { getTransportData, normalizeTransportDataSection, normalizeTransportQuery } from "@/modules/transport/server/data";
import { getInventoryData } from "@/modules/inventory/server/data";
import { hasPermission } from "@/core/auth/permissions";
import { assertRestaurantModule } from "@/modules/restaurant/server/access";

export const dynamic = "force-dynamic";

const restaurantSectionPermissions: Record<string, string> = {
  dashboard: "dashboard:read",
  floor: "restaurant:floor:read",
  orders: "restaurant:orders:read",
  kitchen: "restaurant:kitchen:read",
  clients: "customers:read",
  menu: "restaurant:menu:read",
  inventory: "inventory:read",
  promotions: "restaurant:promotions:read",
  checkout: "restaurant:cash:write",
  reports: "restaurant:reports:read",
  settings: "settings:write",
};

export async function GET(request: Request) {
  const startedAt = performance.now();
  try {
    const session = await requireSession();
    const searchParams = new URL(request.url).searchParams;
    const requestedSection = searchParams.get("section");
    if (session.tenantType === "RESTAURANT") {
      assertRestaurantModule(session, requestedSection ?? "dashboard");
      const required = restaurantSectionPermissions[requestedSection ?? "dashboard"];
      if (required && !hasPermission(session.permissions, required)) throw new AppError("FORBIDDEN", 403, "No tienes permiso para consultar esta sección del restaurante.");
    }
    const restaurantReportPeriod = searchParams.has("period") ? normalizeRestaurantReportPeriod(searchParams.get("period")) : null;
    const transportSection = normalizeTransportDataSection(requestedSection);
    const transportQuery = normalizeTransportQuery(searchParams);
    const scope = { tenantId: session.tenantId, branchId: session.branchId, actorId: session.userId, permissions: session.permissions };
    if (requestedSection === "inventory" && !hasPermission(session.permissions, "inventory:read")) throw new AppError("FORBIDDEN", 403, "No tienes permiso para consultar el inventario.");
    const [branches, core, industryData, inventoryModule] = await Promise.all([
      prisma.branch.findMany({ where: { tenantId: session.tenantId, active: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
      getCoreTenantData(scope, !requestedSection || requestedSection === "settings"),
      session.tenantType === "BARBERSHOP" ? getBarbershopData(scope, requestedSection) : session.tenantType === "RESTAURANT" ? getRestaurantData(scope, requestedSection === "reports" ? restaurantReportPeriod : undefined, requestedSection) : getTransportData(scope, transportSection, transportQuery),
      requestedSection === "inventory" ? getInventoryData(scope, session.tenantType) : Promise.resolve(null),
    ]);
    const data = inventoryModule ? { ...industryData, inventoryModule } : industryData;
    const durationMs = performance.now() - startedAt;
    const slowThresholdMs = Number(process.env.SLOW_WORKSPACE_MS ?? 500);
    if (durationMs >= slowThresholdMs) console.warn(JSON.stringify({ event: "slow_workspace", tenantId: session.tenantId, section: requestedSection ?? "all", durationMs: Math.round(durationMs) }));
    return Response.json({
      session: toSessionView(session),
      branches,
      industry: session.tenantType === "BARBERSHOP" ? "barbershop" : session.tenantType === "RESTAURANT" ? "restaurant" : "transport",
      data,
      core,
    }, { headers: {
      "Cache-Control": "private, no-store",
      "Server-Timing": `workspace;dur=${durationMs.toFixed(1)}`,
      "X-Workspace-Scope": session.tenantType === "TRANSPORT" ? `transport:${transportSection}` : `${session.tenantType.toLowerCase()}:${requestedSection ?? "all"}`,
    } });
  } catch (error) {
    return errorResponse(error);
  }
}
