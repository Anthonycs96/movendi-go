import { AppError } from "@/core/auth/errors";
export function salonSectionFor(resource: string, action?: string) {
  if (resource === "appointments") return action === "checkout" ? "checkout" : "appointments";
  if (["sales", "cash"].includes(resource)) return "checkout";
  if (["staff", "schedules", "blocks"].includes(resource)) return "team";
  if (["services", "products", "promotions"].includes(resource)) return "services";
  if (resource === "customers") return "clients";
  if (["reports", "commissions"].includes(resource)) return "reports";
  if (resource === "payment-methods") return "settings";
  return resource;
}
export function assertSalonModule(session: { enabledModules: string[] }, section: string) {
  if (session.enabledModules.length && !session.enabledModules.includes(section)) throw new AppError("MODULE_ACCESS_DENIED", 403, "Esta sección no está habilitada para tu negocio.");
}
export const salonSectionPermissions: Record<string, string> = { dashboard: "dashboard:read", appointments: "barbershop:appointments:read", clients: "customers:read", team: "barbershop:team:read", services: "services:read", inventory: "inventory:read", checkout: "barbershop:cash:write", reports: "barbershop:reports:read", settings: "settings:write" };
export function salonPermission(resource: string, method: string, action?: string) {
  if (resource === "payment-methods") return "settings:write";
  if (resource === "appointments" && action === "checkout") return "barbershop:cash:write";
  if (resource === "customers") return method === "GET" ? "customers:read" : "customers:write";
  if (["staff", "schedules", "blocks"].includes(resource)) return method === "GET" ? "barbershop:team:read" : "barbershop:team:write";
  if (["services", "products", "promotions"].includes(resource)) return method === "GET" ? "services:read" : "services:write";
  if (resource === "appointments") return method === "GET" ? "barbershop:appointments:read" : "barbershop:appointments:write";
  if (resource === "sales" && action === "refund") return "barbershop:refunds:write";
  if (["sales", "cash"].includes(resource)) return "barbershop:cash:write";
  if (resource === "commissions") return method === "GET" ? "barbershop:reports:read" : "barbershop:commissions:write";
  if (resource === "reports") return "barbershop:reports:read";
  throw new AppError("NOT_FOUND", 404, "Operación de barbería no encontrada.");
}
