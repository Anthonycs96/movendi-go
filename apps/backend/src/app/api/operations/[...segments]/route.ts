import { handleMinimarketCommand } from "@/modules/minimarket/server/commands";
import { assertMinimarketAccess, minimarketPermission, minimarketSection } from "@/modules/minimarket/server/access";
import { prisma } from "@/core/database/prisma";
import { AppError, errorResponse } from "@/core/auth/errors";
import { requireSession, requireTenantScope } from "@/core/auth/session";
import { handleBarbershopCommand } from "@/modules/barbershop/server/commands";
import { handleRestaurantCommand } from "@/modules/restaurant/server/commands";
import { handleTransportCommand } from "@/modules/transport/server/commands";
import { handleCoreCommand } from "@/core/tenancy/commands";
import { handlePlatformCommand } from "@/core/platform/commands";
import { assertTenantWriteEntitlement } from "@/core/platform/entitlements";
import { handleInventoryOperation } from "@/core/composition/inventory";
import { assertRestaurantModule, restaurantOperationModule } from "@/modules/restaurant/server/access";

type Context = { params: Promise<{ segments: string[] }> };

function requiredPermission(moduleName: string, resource: string, method: string, action?: string) {
  if (moduleName === "minimarket") return minimarketPermission(resource, method, action);
  if (moduleName === "barbershop") {
    if (resource === "customers") return method === "GET" ? "customers:read" : "customers:write";
    if (resource === "staff" || resource === "schedules") return method === "GET" ? "barbershop:team:read" : "barbershop:team:write";
    if (resource === "services") return method === "GET" ? "services:read" : "services:write";
    if (resource === "appointments") return method === "GET" ? "barbershop:appointments:read" : "barbershop:appointments:write";
    if (resource === "cash") return "barbershop:cash:write";
  }
  if (moduleName === "restaurant") {
    if (resource === "orders" && action === "checkout") return "restaurant:cash:write";
    if (resource === "sales" && ["electronic-document", "credit-note"].includes(action ?? "")) return "restaurant:sunat:write";
    if (resource === "configuration") return method === "GET" ? "restaurant:configuration:read" : "restaurant:configuration:write";
    if (resource === "sunat") return method === "GET" ? "restaurant:sunat:read" : "restaurant:sunat:write";
    if (resource === "sales") return "restaurant:cash:write";
    if (["preparation-areas", "print-devices", "area-printers", "print-settings", "print-routes"].includes(resource)) return method === "GET" ? "restaurant:printing:read" : "restaurant:printing:write";
    if (resource === "tables" || resource === "areas") return method === "GET" ? "restaurant:floor:read" : "restaurant:floor:write";
    if (resource === "orders") return method === "GET" ? "restaurant:orders:read" : "restaurant:orders:write";
    if (resource === "kitchen") return method === "GET" ? "restaurant:kitchen:read" : "restaurant:kitchen:write";
    if (resource === "print-jobs") return method === "GET" ? "restaurant:printing:read" : "restaurant:printing:write";
    if (resource === "cash") return "restaurant:cash:write";
    if (resource === "customers") return method === "GET" ? "customers:read" : "customers:write";
    if (["categories", "products"].includes(resource)) return method === "GET" ? "restaurant:menu:read" : "restaurant:menu:write";
    if (resource === "promotions") return method === "GET" ? "restaurant:promotions:read" : "restaurant:promotions:write";
    return method === "GET" ? "restaurant:menu:read" : "restaurant:menu:write";
  }
  if (moduleName === "transport") {
    if (["configuration", "custom-fields", "workflows", "resource-presets", "import-profiles", "document-templates", "dispatch-views"].includes(resource)) return "settings:write";
    if (["parties", "locations", "routes"].includes(resource)) return method === "GET" ? "transport:masters:read" : "transport:masters:write";
    if (["vehicles", "trailers"].includes(resource)) return method === "GET" ? "transport:fleet:read" : "transport:fleet:write";
    if (["drivers", "leaves", "work-logs"].includes(resource)) return method === "GET" ? "transport:drivers:read" : "transport:drivers:write";
    if (["operations", "trips", "assignments", "tracking", "incidents"].includes(resource)) return method === "GET" ? "transport:operations:read" : "transport:operations:write";
    if (resource === "documents") return method === "GET" ? "transport:documents:read" : "transport:documents:write";
    if (["expenses", "settlements", "payments"].includes(resource)) return method === "GET" ? "transport:finance:read" : "transport:finance:write";
    if (resource === "fuel") return method === "GET" ? "transport:fuel:read" : "transport:fuel:write";
    if (["maintenance", "maintenance-plans", "maintenance-components", "maintenance-plan-assignments", "maintenance-schedules", "inventory"].includes(resource)) return method === "GET" ? "transport:maintenance:read" : "transport:maintenance:write";
    if (resource === "tires") return method === "GET" ? "transport:tires:read" : "transport:tires:write";
    return method === "GET" ? "transport:read" : "transport:write";
  }
  return undefined;
}

function consumesMonthlyOperation(moduleName: string, resource: string, method: string, id?: string) {
  return method === "POST" && !id && ((moduleName === "barbershop" && resource === "appointments")
    || (moduleName === "restaurant" && resource === "orders")
    || (moduleName === "transport" && resource === "trips"));
}

async function bodyOf(request: Request) {
  if (["GET", "HEAD"].includes(request.method)) return undefined;
  try { return await request.json(); } catch { return {}; }
}

async function handle(request: Request, context: Context) {
  try {
    const { segments } = await context.params;
    const [moduleName, resource, id] = segments;
    if (!moduleName || !resource) throw new AppError("NOT_FOUND", 404, "Operación no encontrada.");

    if (moduleName === "platform") {
      const session = await requireSession();
      return Response.json(await handlePlatformCommand(request.method, segments.slice(1), await bodyOf(request), session));
    }

    if (moduleName === "core" && resource === "customers" && id) {
      const session = await requireSession("customers:read");
      const customer = await prisma.customer.findFirst({ where: { id, tenantId: session.tenantId, active: true }, select: { id: true, name: true, phone: true, email: true } });
      if (!customer) throw new AppError("NOT_FOUND", 404, "Cliente no encontrado.");
      if (request.method !== "GET") throw new AppError("FORBIDDEN", 403, "Operación no permitida.");
      return Response.json(customer);
    }

    if (moduleName === "core") {
      const scope = await requireTenantScope("settings:write");
      await assertTenantWriteEntitlement(scope.tenantId);
      return Response.json(await handleCoreCommand(request.method, segments.slice(1), await bodyOf(request), scope));
    }

    if (moduleName === "inventory") {
      const permission = ["GET", "HEAD"].includes(request.method) ? "inventory:read" : "inventory:write";
      const inventorySession = await requireSession(permission);
      assertRestaurantModule(inventorySession, "inventory");
      if (inventorySession.tenantType === "MINIMARKET") throw new AppError("RETAIL_INVENTORY_REQUIRED", 409, "Usa Inventario de Minimarket para conservar la trazabilidad de lotes.");
      const scope = await requireTenantScope(permission);
      if (!["GET", "HEAD"].includes(request.method)) await assertTenantWriteEntitlement(scope.tenantId);
      return Response.json(await handleInventoryOperation(request.method, segments.slice(1), await bodyOf(request), scope, inventorySession.tenantType));
    }

    const session = await requireSession(requiredPermission(moduleName, resource, request.method, segments[3]));
    const expectedType = moduleName === "barbershop" ? "BARBERSHOP" : moduleName === "restaurant" ? "RESTAURANT" : moduleName === "transport" ? "TRANSPORT" : moduleName === "minimarket" ? "MINIMARKET" : null;
    if (!expectedType) throw new AppError("NOT_FOUND", 404, "Módulo no encontrado.");
    if (session.tenantType !== expectedType) throw new AppError("MODULE_ACCESS_DENIED", 403, "Este módulo no está habilitado para tu empresa.");
    if (moduleName === "minimarket") assertMinimarketAccess(session, minimarketSection(resource, request.method), minimarketPermission(resource, request.method, segments[3]));
    if (moduleName === "restaurant") assertRestaurantModule(session, restaurantOperationModule(resource, segments[3]));
    if (!["GET", "HEAD"].includes(request.method)) await assertTenantWriteEntitlement(session.tenantId, moduleName !== "restaurant" && consumesMonthlyOperation(moduleName, resource, request.method, id));
    const scope = await requireTenantScope(requiredPermission(moduleName, resource, request.method, segments[3]));
    if (moduleName === "minimarket" && request.headers.has("x-retail-context") && request.headers.get("x-retail-context") !== [scope.tenantId, scope.branchId, scope.actorId].join(":")) throw new AppError("RETAIL_CONTEXT_CHANGED", 409, "Cambió el usuario o la sucursal. Vuelve al contexto original para recuperar la operación.");
    const body = await bodyOf(request);
    const result = moduleName === "barbershop"
      ? await handleBarbershopCommand(request.method, segments.slice(1), body, scope)
      : moduleName === "restaurant"
        ? await handleRestaurantCommand(request.method, segments.slice(1), body, scope)
        : moduleName === "minimarket" ? await handleMinimarketCommand(request.method, segments.slice(1), body, scope) : await handleTransportCommand(request.method, segments.slice(1), body, scope);
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
