"use client";
import { useState } from "react";
import { salonInstant, salonLocalDateTime, type AppointmentDto, type BarbershopData } from "@movendi/contracts";
import { Button, Field, Input, OperationForm, Select } from "@/shared/components/ui";
import { formatCurrencyCents as money } from "@/shared/lib/format";
import { salonCan, useSalonResource } from "./salon-ui";
import styles from "./Salon.module.css";
export function AppointmentEditor({ data, appointment }: { data: BarbershopData; appointment?: AppointmentDto }) {
  return <OperationForm allowed={salonCan(data, "barbershop:appointments:write")} title={appointment ? "Reprogramar cita" : "Nueva cita"} triggerLabel={appointment ? "Reprogramar" : "Nueva cita"} endpoint={`/api/operations/barbershop/appointments${appointment ? `/${appointment.id}/reschedule` : ""}`} method={appointment ? "PATCH" : "POST"} description={`Horarios en ${data.timezone ?? "America/Lima"}. La disponibilidad se confirma al guardar.`} submitLabel={appointment ? "Actualizar cita" : "Guardar cita"}><AppointmentFields data={data} appointment={appointment} /></OperationForm>;
}
function AppointmentFields({ data, appointment }: { data: BarbershopData; appointment?: AppointmentDto }) {
  const timezone = data.timezone ?? "America/Lima";
  const [serviceId, setServiceId] = useState(appointment?.service.id ?? ""), [staffId, setStaffId] = useState(appointment?.staff.id ?? ""), [startsAt, setStartsAt] = useState(appointment ? salonLocalDateTime(appointment.startsAt, timezone) : ""), [query, setQuery] = useState("");
  const service = data.services.find((s) => s.id === serviceId), staff = data.staff.find((s) => s.id === staffId), date = startsAt.slice(0, 10) || salonLocalDateTime(new Date(), timezone).slice(0, 10);
  const schedule = staff?.schedules.find((h) => h.weekday === new Date(`${date}T12:00:00Z`).getUTCDay());
  const suggestions: string[] = [];
  const { data: dayAppointments } = useSalonResource<AppointmentDto[]>(`/api/barbershop/appointments?date=${date}`);
  if (service && schedule && dayAppointments) {
    const start = Number(schedule.startsAt.slice(0, 2)) * 60 + Number(schedule.startsAt.slice(3));
    const end = Number(schedule.endsAt.slice(0, 2)) * 60 + Number(schedule.endsAt.slice(3));
    for (let m = start; m + service.durationMinutes <= end; m += 15) {
      const value = `${date}T${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      let instant: Date;
      try { instant = salonInstant(value, timezone); } catch { continue; }
      const until = new Date(instant.getTime() + service.durationMinutes * 60000);
      if (instant < new Date()) continue;
      if (dayAppointments.some((a) => a.id !== appointment?.id && a.staff.id === staffId && !["CANCELLED", "NO_SHOW"].includes(a.status) && new Date(a.startsAt) < until && new Date(a.endsAt) > instant)) continue;
      if (data.blocks?.some((b) => b.staffId === staffId && new Date(b.startsAt) < until && new Date(b.endsAt) > instant)) continue;
      suggestions.push(value);
    }
  }
  return <>
    {!appointment ? <><Field label="Buscar cliente"><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nombre, celular o DNI" /></Field><Field label="Cliente"><Select name="customerId" required defaultValue=""><option value="">Selecciona un cliente</option>{data.customers.filter((c) => c.active && `${c.name} ${c.phone} ${c.dni}`.toLowerCase().includes(query.toLowerCase())).map((c) => <option key={c.id} value={c.id}>{c.name} · {c.phone ?? c.dni}</option>)}</Select></Field></> : null}
    <Field label="Servicio"><Select name="serviceId" value={serviceId} required onChange={(e) => { setServiceId(e.target.value); setStaffId(""); }}><option value="">Selecciona un servicio</option>{data.services.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name} · {s.durationMinutes} min · {money(s.priceCents)}</option>)}</Select></Field>
    <Field label="Profesional"><Select name="staffId" value={staffId} required onChange={(e) => setStaffId(e.target.value)}><option value="">Selecciona un profesional</option>{data.staff.filter((s) => s.active && (!service?.staffIds?.length || service.staffIds.includes(s.id))).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
    <Field label="Fecha y hora"><Input name="startsAt" type="datetime-local" required value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></Field>
    {staffId && serviceId ? <div><p>Horarios sugeridos para {date}</p><div className={styles.toolbar}>{suggestions.slice(0, 24).map((value) => <Button key={value} type="button" variant="secondary" size="sm" onClick={() => setStartsAt(value)}>{value.slice(11)}</Button>)}</div>{!suggestions.length ? <p className={styles.muted}>Sin horarios libres en la vista cargada. Elige otro día o profesional.</p> : null}</div> : null}
    <Field label="Notas de la atención"><textarea className="input" name="notes" maxLength={2000} defaultValue={appointment?.notes ?? ""} placeholder="Corte habitual, fórmula de color, tipo de cabello…" /></Field>
  </>;
}
