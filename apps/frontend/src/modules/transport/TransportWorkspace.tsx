"use client";

import type { CoreTenantData, TransportData } from "@movendi/contracts";
import { Dashboard } from "./components/dashboard";
import { Documents } from "./components/documents";
import { Finance } from "./components/finance";
import { Fleet } from "./components/fleet";
import { FuelWorkspace } from "./components/fuel";
import { Maintenance } from "./components/maintenance";
import { Operations } from "./components/operations";
import { Reports } from "./components/reports";
import { Masters } from "./components/settings";
import { Tires } from "./components/tires";
import { Drivers } from "./components/workforce";
import { TransportDataControls } from "./components/transport-data-controls";
import { ExternalDataTableRows } from "@/shared/components/ui/DataTable";
import { InventoryWorkspace } from "@/modules/inventory/InventoryWorkspace";
import { ErrorState } from "@/shared/components/ui";

type TransportWorkspaceProps = {
  section: string;
  data: TransportData;
  core: CoreTenantData;
  platformAdmin?: boolean;
};

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
