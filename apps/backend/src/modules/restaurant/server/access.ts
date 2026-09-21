import type { AuthSession } from "@/core/auth/types";
import { AppError } from "@/core/auth/errors";

const resourceModules: Record<string, string> = {
  "cash-registers": "settings", configuration: "settings", sunat: "settings", sales: "checkout", cash: "checkout",
  "preparation-areas": "settings", "print-devices": "settings", "area-printers": "settings", "print-settings": "settings", "print-routes": "settings",
  tables: "floor", areas: "floor", orders: "orders", kitchen: "kitchen",
  customers: "clients", categories: "menu", products: "menu", promotions: "promotions",
};

export function assertRestaurantModule(session: Pick<AuthSession, "tenantType" | "enabledModules">, module: string | undefined) {
  if (session.tenantType === "RESTAURANT" && module && session.enabledModules.length && !session.enabledModules.includes(module)) {
    throw new AppError("MODULE_DISABLED", 403, "Este módulo está deshabilitado para el restaurante.");
  }
}

export function restaurantOperationModule(resource: string, action?: string) {
  return resource === "orders" && action === "checkout" ? "checkout" : resourceModules[resource];
}
