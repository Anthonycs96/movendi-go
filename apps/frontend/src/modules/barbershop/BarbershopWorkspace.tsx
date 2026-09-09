"use client";

import dynamic from "next/dynamic";
import { RouteLoading } from "@/shared/components/layout/RouteLoading";

import type { BarbershopData } from "./types";

import type { CoreTenantData } from "@movendi/contracts";

import { ErrorState } from "@/shared/components/ui";

const AppointmentsWorkspace = dynamic(() => import("./components/AppointmentsWorkspace").then((module) => module.AppointmentsWorkspace), { loading: RouteLoading });
const BarbershopDashboard = dynamic(() => import("./components/BarbershopDashboard").then((module) => module.BarbershopDashboard), { loading: RouteLoading });
const DirectoryWorkspace = dynamic(() => import("./components/DirectoryWorkspace").then((module) => module.DirectoryWorkspace), { loading: RouteLoading });
const InventoryWorkspace = dynamic(() => import("@/modules/inventory/InventoryWorkspace").then((module) => module.InventoryWorkspace), { loading: RouteLoading });

export function BarbershopWorkspace({ section, data, core, platformAdmin = false }: { section: string; data: BarbershopData; core: CoreTenantData; platformAdmin?: boolean }) {
  if (section === "dashboard") return <BarbershopDashboard data={data} />;
  if (section === "appointments") return <AppointmentsWorkspace data={data} />;
  if (section === "inventory") return data.inventoryModule ? <InventoryWorkspace data={data.inventoryModule} tenantType="BARBERSHOP" currency={core.tenant.currency} locale={core.tenant.locale} /> : <ErrorState />;
  return <DirectoryWorkspace section={section as "clients" | "team" | "services" | "checkout" | "settings"} data={data} core={core} platformAdmin={platformAdmin} />;
}
