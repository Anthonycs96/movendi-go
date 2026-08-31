import type { RestaurantData } from "./types";
import { FloorWorkspace } from "./components/FloorWorkspace";
import { KitchenWorkspace } from "./components/KitchenWorkspace";
import { RestaurantDashboard } from "./components/RestaurantDashboard";
import { RestaurantDirectory } from "./components/RestaurantDirectory";
import { RestaurantReports } from "./components/RestaurantReports";
import { ErrorState } from "@/shared/components/ui";
import type { CoreTenantData } from "@movendi/contracts";
import { InventoryWorkspace } from "@/modules/inventory/InventoryWorkspace";

export function RestaurantWorkspace({
  section,
  data,
  core,
  platformAdmin = false,
}: {
  section: string;
  data: RestaurantData;
  core: CoreTenantData;
  platformAdmin?: boolean;
}) {
  if (section === "dashboard")
    return (
      <RestaurantDashboard
        data={data}
        locale={core.tenant.locale}
        currency={core.tenant.currency}
      />
    );
  if (section === "floor")
    return (
      <FloorWorkspace
        data={data}
        businessName={core.tenant.shortName}
        locale={core.tenant.locale}
      />
    );
  if (section === "kitchen")
    return <KitchenWorkspace data={data} locale={core.tenant.locale} businessName={core.tenant.shortName} />;
  if (section === "reports")
    return data.reports ? (
      <RestaurantReports reports={data.reports} />
    ) : (
      <ErrorState />
    );
  if (section === "inventory") return data.inventoryModule ? <InventoryWorkspace data={data.inventoryModule} tenantType="RESTAURANT" currency={core.tenant.currency} locale={core.tenant.locale} /> : <ErrorState />;
  return (
    <RestaurantDirectory
      section={
        section as
          | "menu"
          | "promotions"
          | "orders"
          | "clients"
          | "checkout"
          | "settings"
      }
      data={data}
      core={core}
      platformAdmin={platformAdmin}
    />
  );
}
