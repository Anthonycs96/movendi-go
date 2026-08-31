"use client";

import { BarChart3, CircleDollarSign, ClipboardList, PackageOpen } from "lucide-react";
import type { TransportData } from "@movendi/contracts";
import { Card, DataTable, PageHeader, StatCard } from "@/shared/components/ui";
import { Badge, money } from "./transport-ui";
export function Reports({ data }: { data: TransportData }) {
  const reportConfiguration = data.configuration.modules.reports;
  const trips = reportConfiguration.includeDraftTrips ? data.trips : data.trips.filter((item) => item.status !== "DRAFT");
  const delivered = trips.filter((item) => item.status === "DELIVERED");
  return <><PageHeader eyebrow="ANÁLISIS" title="Rentabilidad y desempeño" description={`Indicadores calculados con corte operativo a las ${String(reportConfiguration.cutoffHour).padStart(2, "0")}:00${reportConfiguration.includeDraftTrips ? ", incluyendo borradores" : ""}.`} icon={BarChart3} /><div className="stats-grid stats-grid--four"><StatCard label="Ingresos del mes" value={money(data.metrics.monthRevenueCents)} detail="pagos contabilizados" icon={CircleDollarSign} tone="emerald" /><StatCard label="Egresos del mes" value={money(data.metrics.monthExpenseCents)} detail="pagos y gastos aprobados" icon={ClipboardList} tone="amber" /><StatCard label="Margen" value={money(data.metrics.monthProfitCents)} detail="resultado operativo" icon={BarChart3} tone="violet" /><StatCard label="Viajes entregados" value={String(delivered.length)} detail={`${trips.length} considerados`} icon={PackageOpen} /></div><Card className="table-card"><DataTable rows={trips} rowKey={(row) => row.id} columns={[{ key: "trip", header: "Viaje", cell: (row) => row.code }, { key: "customer", header: "Cliente", cell: (row) => row.customer.legalName }, { key: "freight", header: "Flete", align: "right", cell: (row) => money(row.freightCents) }, { key: "expenses", header: "Gasto liquidado", align: "right", cell: (row) => money(row.settlement?.expenseCents ?? 0) }, { key: "margin", header: "Margen", align: "right", cell: (row) => money(row.settlement?.balanceCents ?? row.freightCents) }, { key: "status", header: "Estado", cell: (row) => <Badge value={row.status} /> }]} /></Card></>;
}
