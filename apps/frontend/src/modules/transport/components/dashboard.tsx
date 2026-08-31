"use client";

import { AlertTriangle, BarChart3, CircleDollarSign, Route, ShieldCheck, Truck, UserRoundCheck } from "lucide-react";
import type { TransportData } from "@movendi/contracts";
import { Card, DataTable, PageHeader, StatCard, StatusBadge } from "@/shared/components/ui";
import type { BadgeTone } from "@/shared/components/ui/StatusBadge";
import { formatDateTime } from "@/shared/lib/format";
import { Badge, money } from "./transport-ui";
export function Dashboard({ data }: { data: TransportData }) {
  const nextTrips = data.trips.filter((trip) => !["DELIVERED", "CANCELLED"].includes(trip.status)).slice(0, 6);
  const alerts = [
    ...(data.metrics.openIncidents ? [{ text: `${data.metrics.openIncidents} incidentes requieren atención`, tone: "danger" as BadgeTone }] : []),
    ...(data.metrics.expiringDocuments ? [{ text: `${data.metrics.expiringDocuments} documentos vencen en 30 días`, tone: "warning" as BadgeTone }] : []),
    ...data.inventory.filter((item) => item.stock <= item.minimumStock).slice(0, 3).map((item) => ({ text: `Stock bajo: ${item.name} (${item.stock} ${item.unit})`, tone: "warning" as BadgeTone })),
  ];
  return <>
    <PageHeader eyebrow="TRANSPORTE V2" title="Centro de control operativo" description="Viajes, disponibilidad, seguridad y rentabilidad en una sola vista." icon={BarChart3} />
    <div className="stats-grid stats-grid--four"><StatCard label="Viajes activos" value={String(data.metrics.activeTrips)} detail={`${data.trips.length} registrados`} icon={Route} /><StatCard label="Flota disponible" value={String(data.metrics.availableVehicles)} detail={`${data.metrics.fleetUtilizationPct}% de utilización`} icon={Truck} tone="emerald" /><StatCard label="Conductores disponibles" value={String(data.metrics.availableDrivers)} detail="considera ciclo de descanso" icon={UserRoundCheck} tone="violet" /><StatCard label="Margen mensual" value={money(data.metrics.monthProfitCents)} detail={`${money(data.metrics.monthRevenueCents)} ingresos`} icon={CircleDollarSign} tone="amber" /></div>
    <div className="management-grid">
      <Card className="table-card"><div className="management-heading"><div><span className="section-kicker">DESPACHO</span><h2>Próximos viajes</h2></div></div><DataTable rows={nextTrips} rowKey={(row) => row.id} columns={[
        { key: "code", header: "Viaje", cell: (row) => <span className="table-primary"><strong>{row.code}</strong><span>{row.customer.legalName}</span></span> },
        { key: "route", header: "Ruta", cell: (row) => `${row.route.origin.name} → ${row.route.destination.name}` },
        { key: "date", header: "Salida", sortValue: (row) => row.scheduledStartAt, cell: (row) => formatDateTime(row.scheduledStartAt) },
        { key: "status", header: "Estado", cell: (row) => <Badge value={row.status} /> },
      ]} /></Card>
      <Card className="table-card"><div className="management-heading"><div><span className="section-kicker">ALERTAS</span><h2>Atención requerida</h2></div></div><div className="transport-alert-list">{alerts.length ? alerts.map((item) => <div key={item.text}><AlertTriangle size={17} /><span>{item.text}</span><StatusBadge tone={item.tone}>Revisar</StatusBadge></div>) : <div><ShieldCheck size={17} /><span>Sin alertas críticas pendientes.</span><StatusBadge tone="success">Operativo</StatusBadge></div>}</div></Card>
    </div>
  </>;
}

