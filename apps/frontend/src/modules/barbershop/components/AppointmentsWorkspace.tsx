"use client";

import { useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, UserCheck } from "lucide-react";
import type { BarbershopData } from "../types";
import { Card, DataTable, Field, Input, OperationButton, OperationForm, PageHeader, SearchInput, Select, StatCard, StatusBadge } from "@/shared/components/ui";
import { formatCurrencyCents, formatDateInput, formatDateTimeInput, formatShortDate, formatTime } from "@/shared/lib/format";

const statusTone: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = { PENDING: "warning", CONFIRMED: "info", COMPLETED: "success", CANCELLED: "danger", NO_SHOW: "neutral" };
const statusLabels: Record<string, string> = { PENDING: "Pendiente", CONFIRMED: "Confirmada", COMPLETED: "Completada", CANCELLED: "Cancelada", NO_SHOW: "No asistió" };

export function AppointmentsWorkspace({ data }: { data: BarbershopData }) {
  const [query, setQuery] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState("");
  const [staffId, setStaffId] = useState("");
  const rows = useMemo(() => data.appointments.filter((item) => {
    const matchesQuery = `${item.customer.name} ${item.staff.name} ${item.service.name}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (!date || formatDateInput(item.startsAt) === date) && (!status || item.status === status) && (!staffId || item.staff.id === staffId);
  }), [data.appointments, date, query, staffId, status]);

  return <>
    <PageHeader eyebrow="Operación" title="Reservas" description={`${rows.length} citas en la vista actual.`} icon={CalendarDays} actions={<OperationForm title="Nueva cita" description="La disponibilidad se valida antes de guardar." endpoint="/api/operations/barbershop/appointments" triggerLabel="Nueva cita" submitLabel="Guardar cita"><Field label="Cliente"><Select name="customerId" required defaultValue=""><option value="" disabled>Selecciona un cliente</option>{data.customers.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}{item.dni ? ` · DNI ${item.dni}` : ""}</option>)}</Select></Field><Field label="Servicio"><Select name="serviceId" required defaultValue=""><option value="" disabled>Selecciona un servicio</option>{data.services.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name} · {formatCurrencyCents(item.priceCents)}</option>)}</Select></Field><Field label="Barbero"><Select name="staffId" required defaultValue=""><option value="" disabled>Selecciona un profesional</option>{data.staff.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field><Field label="Fecha y hora"><Input name="startsAt" type="datetime-local" required /></Field><Field label="Notas"><Input name="notes" placeholder="Preferencias u observaciones" /></Field></OperationForm>} />
    <section className="stats-grid appointment-stats"><StatCard label="Total" value={String(rows.length)} detail="Citas visibles" icon={CalendarDays} tone="blue" /><StatCard label="Confirmadas" value={String(rows.filter((item) => item.status === "CONFIRMED").length)} detail="Listas para atender" icon={CheckCircle2} tone="blue" /><StatCard label="Pendientes" value={String(rows.filter((item) => item.status === "PENDING").length)} detail="Por confirmar" icon={Clock3} tone="blue" /><StatCard label="Completadas" value={String(rows.filter((item) => item.status === "COMPLETED").length)} detail="Atenciones cerradas" icon={UserCheck} tone="blue" /></section>
    <Card className="table-card">
      <div className="filters appointment-filters">
        <SearchInput value={query} onChange={(event) => setQuery(event.target.value)} onClear={() => setQuery("")} placeholder="Buscar cliente, servicio o barbero" />
        <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} aria-label="Filtrar por fecha" />
        <Select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filtrar por estado"><option value="">Todos los estados</option>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Select>
        <Select value={staffId} onChange={(event) => setStaffId(event.target.value)} aria-label="Filtrar por barbero"><option value="">Todos los barberos</option>{data.staff.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</Select>
        <span className="filter-spacer" /><span className="results-count">{rows.length} citas</span>
      </div>
      <DataTable rows={rows} rowKey={(row) => row.id} columns={[
        { key: "date", header: "Fecha y hora", sortValue: (row) => new Date(row.startsAt), cell: (row) => <span className="table-primary"><strong>{formatShortDate(row.startsAt, true)}</strong><span>{formatTime(row.startsAt)}</span></span> },
        { key: "customer", header: "Cliente", sortValue: (row) => row.customer.name, cell: (row) => <span className="table-primary"><strong>{row.customer.name}</strong><span>{row.customer.phone ?? "Sin teléfono"}</span></span> },
        { key: "service", header: "Servicio", cell: (row) => <span className="table-primary"><strong>{row.service.name}</strong><span>{row.staff.name}</span></span> },
        { key: "status", header: "Estado", cell: (row) => <StatusBadge tone={statusTone[row.status]} dot>{statusLabels[row.status] ?? row.status}</StatusBadge> },
        { key: "total", header: "Importe", align: "right", cell: (row) => formatCurrencyCents(row.priceCents) },
        { key: "actions", header: "Acciones", cell: (row) => <div className="table-actions">
          {!row.paid && !["COMPLETED", "CANCELLED", "NO_SHOW"].includes(row.status) ? <OperationForm title="Reprogramar cita" description="La nueva hora se validará contra la agenda del profesional." endpoint={`/api/operations/barbershop/appointments/${row.id}/reschedule`} method="PATCH" triggerLabel="Reprogramar" submitLabel="Actualizar cita"><Field label="Servicio"><Select name="serviceId" required defaultValue={row.service.id}>{data.services.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field><Field label="Barbero"><Select name="staffId" required defaultValue={row.staff.id}>{data.staff.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field><Field label="Fecha y hora"><Input name="startsAt" type="datetime-local" required defaultValue={formatDateTimeInput(row.startsAt)} /></Field><Field label="Notas"><Input name="notes" defaultValue={row.notes ?? ""} /></Field></OperationForm> : null}
          {row.status === "PENDING" ? <OperationButton endpoint={`/api/operations/barbershop/appointments/${row.id}/status`} body={{ status: "CONFIRMED" }}>Confirmar</OperationButton> : null}
          {!row.paid && !["CANCELLED", "NO_SHOW"].includes(row.status) ? <OperationForm title="Cobrar cita" description={`Total: ${formatCurrencyCents(row.priceCents)}. Solo el efectivo aumenta el saldo de caja.`} endpoint={`/api/operations/barbershop/appointments/${row.id}/checkout`} triggerLabel="Cobrar" submitLabel="Registrar cobro"><Field label="Medio de pago"><Select name="paymentMethod" defaultValue="CASH" required><option value="CASH">Efectivo</option><option value="CARD">Tarjeta</option><option value="YAPE">Yape</option><option value="PLIN">Plin</option><option value="TRANSFER">Transferencia</option><option value="OTHER">Otro</option></Select></Field></OperationForm> : null}
          {!row.paid && ["PENDING", "CONFIRMED"].includes(row.status) ? <OperationButton endpoint={`/api/operations/barbershop/appointments/${row.id}/status`} body={{ status: "NO_SHOW" }} variant="ghost" confirmMessage="¿Marcar que el cliente no asistió?">No asistió</OperationButton> : null}
          {!["COMPLETED", "CANCELLED", "NO_SHOW"].includes(row.status) ? <OperationButton endpoint={`/api/operations/barbershop/appointments/${row.id}/status`} body={{ status: "CANCELLED" }} variant="ghost" confirmMessage="¿Cancelar esta cita?">Cancelar</OperationButton> : null}
        </div> },
      ]} />
    </Card>
  </>;
}
