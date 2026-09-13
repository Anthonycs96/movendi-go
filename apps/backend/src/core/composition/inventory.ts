import "server-only";
import type { TenantScope } from "@/core/auth/types";
import { handleInventoryCommand } from "@/modules/inventory/server/commands";
import { getInventoryData } from "@/modules/inventory/server/data";
import { handleRestaurantInventoryCommand } from "@/modules/restaurant/server/inventory-commands";
import { getRestaurantInventoryData } from "@/modules/restaurant/server/inventory-data";
import { assertRestaurantConfigured, getRestaurantConfiguration, hasStoredRestaurantConfiguration } from "@/modules/restaurant/server/configuration";
import { RestaurantOnHandReservations } from "@/modules/restaurant/server/on-hand-reservations";
import type { InventoryCommandPolicies } from "@/modules/inventory/server/policies";

export async function handleInventoryOperation(method: string, segments: string[], body: unknown, scope: TenantScope, tenantType: string) {
  // Preserve the existing routes for recipes and returns while assigning their
  // implementation to the module that owns orders, products and recipes.
  if ((method === "POST" && segments[0] === "recipes" && segments[1]) || (method === "POST" && segments[0] === "returns")) {
    return handleRestaurantInventoryCommand(method, segments, body, scope);
  }
  const policies: InventoryCommandPolicies = tenantType === "RESTAURANT" ? {
    async validateUnit(unit) {
      if (await hasStoredRestaurantConfiguration(scope.tenantId)) assertRestaurantConfigured((await getRestaurantConfiguration(scope.tenantId, scope.branchId)).inventory.units, unit, "La unidad de inventario");
    },
    async preventNegativeStock() { return (await getRestaurantConfiguration(scope.tenantId, scope.branchId)).inventory.preventNegativeStock; },
    onHandReservations: (tx, countScope) => new RestaurantOnHandReservations(tx, countScope),
  } : {};
  return handleInventoryCommand(method, segments, body, scope, policies);
}

export async function getInventoryWorkspaceData(scope: TenantScope, tenantType: string) {
  const [inventory, industry] = await Promise.all([
    getInventoryData(scope),
    tenantType === "RESTAURANT" ? getRestaurantInventoryData(scope) : Promise.resolve({ products: [], sales: [] }),
  ]);
  return { ...inventory, ...industry };
}
