import { hasPermission } from "./permissions";

const restaurantSections = ["dashboard", "floor", "orders", "kitchen", "clients", "menu", "inventory", "promotions", "checkout", "reports", "settings"];

/** Administrators can manage every restaurant section; action permissions still apply. */
export function effectiveModules(tenantType: string, modules: string[], permissions: string[] = []): string[] {
  // Legacy public registrations saved [] (all modules), before setup initialization.
  if (tenantType === "MINIMARKET" && !modules.length) return ["dashboard", "pos", "catalog", "inventory", "purchases", "sales", "checkout", "clients", "reports", "settings"];
  if (tenantType === "RESTAURANT" && hasPermission(permissions, "settings:write") && modules.length) {
    return [...new Set([...modules, ...restaurantSections])];
  }
  // An empty list is the existing convention for all modules enabled.
  if (tenantType !== "RESTAURANT" || !modules.length || modules.includes("reports")) return modules;
  return [...modules, "reports"];
}
