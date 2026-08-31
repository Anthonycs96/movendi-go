import type { BarbershopData } from "./types";
import { AppointmentsWorkspace } from "./components/AppointmentsWorkspace";
import { BarbershopDashboard } from "./components/BarbershopDashboard";
import { DirectoryWorkspace } from "./components/DirectoryWorkspace";
import type { CoreTenantData } from "@movendi/contracts";
import { InventoryWorkspace } from "@/modules/inventory/InventoryWorkspace";
import { ErrorState } from "@/shared/components/ui";

export function BarbershopWorkspace({ section, data, core, platformAdmin = false }: { section: string; data: BarbershopData; core: CoreTenantData; platformAdmin?: boolean }) {
  if (section === "dashboard") return <BarbershopDashboard data={data} />;
  if (section === "appointments") return <AppointmentsWorkspace data={data} />;
  if (section === "inventory") return data.inventoryModule ? <InventoryWorkspace data={data.inventoryModule} tenantType="BARBERSHOP" currency={core.tenant.currency} locale={core.tenant.locale} /> : <ErrorState />;
  return <DirectoryWorkspace section={section as "clients" | "team" | "services" | "checkout" | "settings"} data={data} core={core} platformAdmin={platformAdmin} />;
}
