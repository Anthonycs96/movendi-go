"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, UserCheck } from "lucide-react";
import type { BarbershopData } from "../types";
import { salonLocalDateTime } from "@movendi/contracts";
import { SalonCheckout } from "./SalonCheckout";
import { AppointmentEditor } from "./AppointmentEditor";
import { salonCan, salonRequest } from "./salon-ui";
import { Card, DataTable, Input, OperationButton, PageHeader, SearchInput, Select, StatCard, StatusBadge } from "@/shared/components/ui";
import { formatCurrencyCents } from "@/shared/lib/format";

const statusTone: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = { PENDING: "warning", CONFIRMED: "info", COMPLETED: "success", CANCELLED: "danger", NO_SHOW: "neutral" };
const statusLabels: Record<string, string> = { PENDING: "Pendiente", CONFIRMED: "Confirmada", COMPLETED: "Completada", CANCELLED: "Cancelada", NO_SHOW: "No asistió" };

export function AppointmentsWorkspace({ data }: { data: BarbershopData }) {
  const [query, setQuery] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState("");
  const [staffId, setStaffId] = useState("");
  const [selectedAppointments, setSelectedAppointments] = useState<BarbershopData["appointments"] | null>(null);
  const [dateError, setDateError] = useState("");
  useEffect(() => {
    let cancelled = false;
    if (date) salonRequest<BarbershopData["appointments"]>(`/api/barbershop/appointments?date=${date}`).then((rows) => { if (!cancelled) { setSelectedAppointments(rows); setDateError(""); } }).catch((e) => { if (!cancelled) setDateError(e.message); });
    return () => { cancelled = true; };
  }, [date, data.appointments]);
  const source = date && selectedAppointments ? selectedAppointments : data.appointments;
  const rows = useMemo(() => source.filter((item) => {
    const matchesQuery = `${item.customer.name} ${item.staff.name} ${item.service.name}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (!date || salonLocalDateTime(item.startsAt, data.timezone).slice(0, 10) === date) && (!status || item.status === status) && (!staffId || item.staff.id === staffId);
  }), [source, date, query, staffId, status, data.timezone]);

  return <>
    <PageHeader eyebrow="Operación" title="Reservas" description={`${rows.length} citas en la vista actual.`} icon={CalendarDays} actions={<AppointmentEditor data={data} />} />
    <section className="stats-grid appointment-stats"><StatCard label="Total" value={String(rows.length)} detail="Citas visibles" icon={CalendarDays} tone="blue" /><StatCard label="Confirmadas" value={String(rows.filter((item) => item.status === "CONFIRMED").length)} detail="Listas para atender" icon={CheckCircle2} tone="blue" /><StatCard label="Pendientes" value={String(rows.filter((item) => item.status === "PENDING").length)} detail="Por confirmar" icon={Clock3} tone="blue" /><StatCard label="Completadas" value={String(rows.filter((item) => item.status === "COMPLETED").length)} detail="Atenciones cerradas" icon={UserCheck} tone="blue" /></section>
    {dateError ? <p role="alert">{dateError}</p> : null}<Card className="table-card">
      <div className="filters appointment-filters">
        <SearchInput value={query} onChange={(event) => setQuery(event.target.value)} onClear={() => setQuery("")} placeholder="Buscar cliente, servicio o barbero" />
        <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} aria-label="Filtrar por fecha" />
        <Select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filtrar por estado"><option value="">Todos los estados</option>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Select>
        <Select value={staffId} onChange={(event) => setStaffId(event.target.value)} aria-label="Filtrar por barbero"><option value="">Todos los barberos</option>{data.staff.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</Select>
        <span className="filter-spacer" /><span className="results-count">{rows.length} citas</span>
      </div>
      <DataTable rows={rows} rowKey={(row) => row.id} columns={[
        { key: "date", header: "Fecha y hora", sortValue: (row) => new Date(row.startsAt), cell: (row) => <span className="table-primary"><strong>{salonLocalDateTime(row.startsAt, data.timezone).slice(0, 10)}</strong><span>{salonLocalDateTime(row.startsAt, data.timezone).slice(11)}</span></span> },
        { key: "customer", header: "Cliente", sortValue: (row) => row.customer.name, cell: (row) => <span className="table-primary"><strong>{row.customer.name}</strong><span>{row.customer.phone ?? "Sin teléfono"}</span></span> },
        { key: "service", header: "Servicio", cell: (row) => <span className="table-primary"><strong>{row.service.name}</strong><span>{row.staff.name}</span></span> },
        { key: "status", header: "Estado", cell: (row) => <StatusBadge tone={statusTone[row.status]} dot>{statusLabels[row.status] ?? row.status}</StatusBadge> },
        { key: "total", header: "Importe", align: "right", cell: (row) => formatCurrencyCents(row.priceCents) },
        { key: "actions", header: "Acciones", cell: (row) => <div className="table-actions">
          {!row.paid && salonCan(data, "barbershop:appointments:write") && !["COMPLETED", "CANCELLED", "NO_SHOW"].includes(row.status) ? <AppointmentEditor data={data} appointment={row} /> : null}
          {row.status === "PENDING" && salonCan(data, "barbershop:appointments:write") ? <OperationButton endpoint={`/api/operations/barbershop/appointments/${row.id}/status`} body={{ status: "CONFIRMED" }}>Confirmar</OperationButton> : null}
          {!row.paid && !["CANCELLED", "NO_SHOW"].includes(row.status) ? <SalonCheckout data={data} appointment={row} /> : null}
          {!row.paid && salonCan(data, "barbershop:appointments:write") && ["PENDING", "CONFIRMED"].includes(row.status) ? <OperationButton endpoint={`/api/operations/barbershop/appointments/${row.id}/status`} body={{ status: "NO_SHOW" }} variant="ghost" confirmMessage="¿Marcar que el cliente no asistió?">No asistió</OperationButton> : null}
          {salonCan(data, "barbershop:appointments:write") && !["COMPLETED", "CANCELLED", "NO_SHOW"].includes(row.status) ? <OperationButton endpoint={`/api/operations/barbershop/appointments/${row.id}/status`} body={{ status: "CANCELLED" }} variant="ghost" confirmMessage="¿Cancelar esta cita?">Cancelar</OperationButton> : null}
        </div> },
      ]} />
    </Card>
  </>;
}
