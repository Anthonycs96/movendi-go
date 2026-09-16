import { AppError } from "@/core/auth/errors";
import { hasPermission } from "@/core/auth/permissions";
import type { AuthSession } from "@/core/auth/types";
export const minimarketSections: Record<string, string> = { dashboard: "minimarket:reports:read", pos: "minimarket:sales:write", catalog: "minimarket:catalog:read", inventory: "inventory:read", purchases: "inventory:read", sales: "minimarket:sales:read", checkout: "minimarket:cash:read", clients: "customers:read", reports: "minimarket:reports:read", settings: "settings:write" };
export function minimarketPermission(resource: string, method: string, action?: string) {
  if (resource === "promotions") return "minimarket:promotions:write";
  if (resource === "imports") return "minimarket:catalog:write";
  if (resource === "suppliers") return method === "GET" ? "inventory:read" : "minimarket:suppliers:write";
  if (resource === "payables") return method === "GET" ? "minimarket:payables:read" : "minimarket:payables:write";
  if (resource === "transfers") return method === "GET" ? "inventory:read" : "minimarket:transfers:write";
  if (resource === "fiscal") return "settings:write";
  if (resource === "fiscal-jobs") return "minimarket:sales:write";
  if (resource === "sales") return action === "refund" ? "minimarket:refunds:write" : method === "GET" ? "minimarket:sales:read" : "minimarket:sales:write";
  if (resource === "presentations" && method === "PATCH") return "minimarket:prices:write";
  if (["products", "presentations"].includes(resource)) return method === "GET" ? "minimarket:catalog:read" : "minimarket:catalog:write";
  if (["purchases", "counts"].includes(resource)) return method === "GET" ? "inventory:read" : `minimarket:${resource}:write`;
  if (resource === "cash") return method === "GET" ? "minimarket:cash:read" : action === "close" ? "minimarket:cash:close" : action === "movement" ? "minimarket:cash:movement" : "minimarket:cash:open";
  if (resource === "customers") return method === "GET" ? "customers:read" : "customers:write";
  throw new AppError("NOT_FOUND", 404, "Operación de Minimarket no encontrada.");
}
export function minimarketSection(resource: string, method: string) {
  if (["promotions", "imports"].includes(resource)) return "catalog";
  if (["suppliers", "payables"].includes(resource)) return "purchases";
  if (resource === "transfers") return "inventory";
  return ({ fiscal: "settings", "fiscal-jobs": "sales", products: "catalog", presentations: "catalog", purchases: "purchases", counts: "inventory", cash: "checkout", customers: "clients", sales: method === "GET" ? "sales" : "pos" } as Record<string, string>)[resource];
}
export function assertMinimarketAccess(session: AuthSession, section: string, permission = minimarketSections[section]) {
  if (session.tenantType !== "MINIMARKET") throw new AppError("MODULE_ACCESS_DENIED", 403, "Este módulo corresponde a Minimarket.");
  if (!minimarketSections[section]) throw new AppError("NOT_FOUND", 404, "Sección no encontrada.");
  if (!session.enabledModules.includes(section)) throw new AppError("MODULE_DISABLED", 403, "Esta sección está deshabilitada.");
  if (!permission || !hasPermission(session.permissions, permission)) throw new AppError("FORBIDDEN", 403, "No tienes permiso para esta operación.");
}
