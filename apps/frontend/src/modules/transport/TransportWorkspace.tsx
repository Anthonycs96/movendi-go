"use client";

import dynamic from "next/dynamic";
import { RouteLoading } from "@/shared/components/layout/RouteLoading";

import type { CoreTenantData, TransportData } from "@movendi/contracts";

import { TransportDataControls } from "./components/transport-data-controls";
import { ExternalDataTableRows } from "@/shared/components/ui/DataTable";

import { ErrorState } from "@/shared/components/ui";

type TransportWorkspaceProps = {
  section: string;
  data: TransportData;
  core: CoreTenantData;
  platformAdmin?: boolean;
};

const Dashboard = dynamic(() => import("./components/dashboard").then((module) => module.Dashboard), { loading: RouteLoading });
const Documents = dynamic(() => import("./components/documents").then((module) => module.Documents), { loading: RouteLoading });
const Finance = dynamic(() => import("./components/finance").then((module) => module.Finance), { loading: RouteLoading });
const Fleet = dynamic(() => import("./components/fleet").then((module) => module.Fleet), { loading: RouteLoading });
const FuelWorkspace = dynamic(() => import("./components/fuel").then((module) => module.FuelWorkspace), { loading: RouteLoading });
const Maintenance = dynamic(() => import("./components/maintenance").then((module) => module.Maintenance), { loading: RouteLoading });
const Operations = dynamic(() => import("./components/operations").then((module) => module.Operations), { loading: RouteLoading });
const Reports = dynamic(() => import("./components/reports").then((module) => module.Reports), { loading: RouteLoading });
const Masters = dynamic(() => import("./components/settings").then((module) => module.Masters), { loading: RouteLoading });
const Tires = dynamic(() => import("./components/tires").then((module) => module.Tires), { loading: RouteLoading });
const Drivers = dynamic(() => import("./components/workforce").then((module) => module.Drivers), { loading: RouteLoading });
const InventoryWorkspace = dynamic(() => import("@/modules/inventory/InventoryWorkspace").then((module) => module.InventoryWorkspace), { loading: RouteLoading });

export function TransportWorkspace({ section, data, core, platformAdmin = false }: TransportWorkspaceProps) {
  let workspace;
  if (section === "dashboard") workspace = <Dashboard data={data} />;
  else if (section === "operations") workspace = <Operations data={data} />;
  else if (section === "fleet") workspace = <Fleet data={data} />;
  else if (section === "drivers") workspace = <Drivers data={data} />;
  else if (section === "documents") workspace = <Documents data={data} />;
  else if (section === "finance") workspace = <Finance data={data} />;
  else if (section === "fuel") workspace = <FuelWorkspace data={data} />;
  else if (section === "maintenance") workspace = <Maintenance data={data} />;
  else if (section === "tires") workspace = <Tires data={data} />;
  else if (section === "inventory") workspace = data.inventoryModule ? <InventoryWorkspace data={data.inventoryModule} tenantType="TRANSPORT" currency={core.tenant.currency} locale={core.tenant.locale} /> : <ErrorState />;
  else if (section === "reports") workspace = <Reports data={data} />;
  else workspace = <Masters data={data} core={core} platformAdmin={platformAdmin} />;
  const paginatedRows = data.pagination ? data[data.pagination.resource as keyof TransportData] : null;
  return <ExternalDataTableRows rows={Array.isArray(paginatedRows) ? paginatedRows : null}><TransportDataControls pagination={data.pagination} />{workspace}</ExternalDataTableRows>;
}
