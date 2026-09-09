"use client";

import dynamic from "next/dynamic";
import { RouteLoading } from "@/shared/components/layout/RouteLoading";

import type { RestaurantData } from "./types";

import { ErrorState } from "@/shared/components/ui";
import type { CoreTenantData } from "@movendi/contracts";

import { hasPermission } from "@/core/auth/permissions";

const CashWorkspace = dynamic(() => import("./components/CashWorkspace").then((module) => module.CashWorkspace), { loading: RouteLoading });
const CustomerClub = dynamic(() => import("./components/CustomerClub").then((module) => module.CustomerClub), { loading: RouteLoading });
const RestaurantHistory = dynamic(() => import("./components/RestaurantHistory").then((module) => module.RestaurantHistory), { loading: RouteLoading });
const FloorWorkspace = dynamic(() => import("./components/FloorWorkspace").then((module) => module.FloorWorkspace), { loading: RouteLoading });
const KitchenWorkspace = dynamic(() => import("./components/KitchenWorkspace").then((module) => module.KitchenWorkspace), { loading: RouteLoading });
const RestaurantDashboard = dynamic(() => import("./components/RestaurantDashboard").then((module) => module.RestaurantDashboard), { loading: RouteLoading });
const RestaurantDirectory = dynamic(() => import("./components/RestaurantDirectory").then((module) => module.RestaurantDirectory), { loading: RouteLoading });
const RestaurantReports = dynamic(() => import("./components/RestaurantReports").then((module) => module.RestaurantReports), { loading: RouteLoading });
const InventoryWorkspace = dynamic(() => import("@/modules/inventory/InventoryWorkspace").then((module) => module.InventoryWorkspace), { loading: RouteLoading });

export function RestaurantWorkspace({
  section,
  data,
  core,
  permissions,
  platformAdmin = false,
}: {
  section: string;
  data: RestaurantData;
  core: CoreTenantData;
  permissions: string[];
  platformAdmin?: boolean;
}) {
  if (section === "checkout") return <CashWorkspace data={data} permissions={permissions} />;
  if (section === "clients") return <CustomerClub data={data} permissions={permissions} />;
  if (section === "dashboard")
    return (
      <RestaurantDashboard
        data={data}
        locale={core.tenant.locale}
        permissions={permissions}
        currency={core.tenant.currency}
      />
    );
  if (section === "floor")
    return (
      <FloorWorkspace
        data={data}
        permissions={permissions}
        businessName={core.tenant.shortName}
        locale={core.tenant.locale}
      />
    );
  if (section === "kitchen")
    return <KitchenWorkspace data={data} locale={core.tenant.locale} businessName={core.tenant.shortName} canWrite={hasPermission(permissions, "restaurant:kitchen:write")} />;
  if (section === "reports")
    return data.reports ? (
      <RestaurantReports reports={data.reports} />
    ) : (
      <ErrorState />
    );
  if (section === "inventory") return data.inventoryModule ? <InventoryWorkspace data={data.inventoryModule} tenantType="RESTAURANT" currency={core.tenant.currency} locale={core.tenant.locale} canWrite={hasPermission(permissions, "inventory:write")} /> : <ErrorState />;
  return (
    <>
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
      permissions={permissions}
      platformAdmin={platformAdmin}
    />
    {section === "orders" ? <RestaurantHistory initialKind="orders" canRefund={data.canApproveRefund} canIssue={data.configuration.integrations.sunatEnabled && hasPermission(permissions, "restaurant:sunat:write")} /> : null}
    </>
  );
}
