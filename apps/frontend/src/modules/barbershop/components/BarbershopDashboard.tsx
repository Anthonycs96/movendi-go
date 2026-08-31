import Link from "next/link";
import { ArrowUpRight, Banknote, CalendarCheck, Clock3, Scissors, Users } from "lucide-react";
import type { BarbershopData } from "../types";
import { Card, PageHeader, StatCard, StatusBadge } from "@/shared/components/ui";
import { formatCurrencyCents, formatShortDate, formatTime, initials } from "@/shared/lib/format";

const tone: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = { PENDING: "warning", CONFIRMED: "info", COMPLETED: "success", CANCELLED: "danger", NO_SHOW: "neutral" };
const label: Record<string, string> = { PENDING: "Pendiente", CONFIRMED: "Confirmada", COMPLETED: "Completada", CANCELLED: "Cancelada", NO_SHOW: "No asistió" };

export function BarbershopDashboard({ data }: { data: BarbershopData }) {
  const upcoming = [...data.appointments].filter((item) => new Date(item.startsAt) >= new Date()).sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 5);
  const pending = data.appointments.filter((item) => item.status === "PENDING").length;

  return <>
    <PageHeader
      eyebrow="Resumen del negocio"
      title="Beauty"
      description="Agenda, atención, cobros y equipo en una experiencia propia."
      icon={Scissors}
      actions={<Link className="button button--primary button--md" href="appointments"><span>Nueva cita</span><ArrowUpRight size={15} /></Link>}
    />
    <section className="stats-grid stats-grid--five">
      <StatCard label="Reservas hoy" value={String(data.metrics.todayAppointments)} detail={`${data.metrics.confirmed} confirmadas`} icon={CalendarCheck} tone="blue" />
      <StatCard label="Completadas" value={String(data.metrics.completed)} detail="Flujo del día" icon={Clock3} tone="blue" />
      <StatCard label="Pendientes" value={String(pending)} detail="Por atender" icon={Clock3} tone="blue" />
      <StatCard label="Ingresos" value={formatCurrencyCents(data.metrics.todayRevenueCents)} detail="Ventas pagadas" icon={Banknote} tone="blue" />
      <StatCard label="Barberos" value={String(data.staff.filter((item) => item.active).length)} detail="Equipo activo" icon={Users} tone="blue" />
    </section>
    <section className="dashboard-grid dashboard-grid--single">
      <Card className="panel">
        <div className="panel__header"><div><h2>Próximas citas</h2><p>Reservas de hoy asignadas al equipo.</p></div><Link href="appointments">Ver agenda</Link></div>
        {upcoming.length ? upcoming.map((item) => <div className="appointment-row" key={item.id}><div className="appointment-row__time"><strong>{formatTime(item.startsAt)}</strong><span>{formatShortDate(item.startsAt)}</span></div><div className="mini-avatar">{initials(item.customer.name)}</div><div className="appointment-row__client"><strong>{item.customer.name}</strong><span>{item.service.name} · {item.staff.name}</span></div><StatusBadge tone={tone[item.status]} dot>{label[item.status] ?? item.status}</StatusBadge><strong className="appointment-row__price">{formatCurrencyCents(item.priceCents)}</strong></div>) : <div className="empty-panel"><CalendarCheck size={28} /><strong>Sin citas agendadas</strong><span>No hay reservas para mostrar en este momento.</span></div>}
      </Card>
    </section>
  </>;
}
