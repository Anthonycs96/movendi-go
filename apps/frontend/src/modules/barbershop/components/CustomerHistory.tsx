"use client";
import { useState } from "react";
import type { BarberCustomerDto, SalonHistory } from "@movendi/contracts";
import { Button, Dialog } from "@/shared/components/ui";
import { formatCurrencyCents as money, formatDateTime } from "@/shared/lib/format";
import { useSalonResource } from "./salon-ui";
import styles from "./Salon.module.css";
type Profile = { history: SalonHistory; visits: Array<{ id: string; startsAt: string; status: string; notes: string | null; service: { name: string }; staff: { name: string } }>; visitTotal: number; summary: { spentCents: number; sales: number; lastVisit: string | null } };
function ProfileBody({ id }: { id: string }) {
  const [page, setPage] = useState(1), { data, error } = useSalonResource<Profile>(`/api/barbershop/customers?id=${encodeURIComponent(id)}&page=${page}`);
  if (error) return <p role="alert">{error}</p>;
  if (!data) return <p role="status">Cargando historial…</p>;
  return <div className={styles.stack}><p>{data.summary.sales} ventas · Total {money(data.summary.spentCents)} · Última visita {data.summary.lastVisit ? formatDateTime(data.summary.lastVisit) : "Sin visitas"}</p><h3>Servicios y productos comprados</h3>{data.history.sales.map((sale) => <div key={sale.id} className={styles.notice}><strong>{sale.code} · {formatDateTime(sale.createdAt)} · {money(sale.totalCents)} {sale.status === "REFUNDED" ? "· Devuelta" : ""}</strong>{sale.lines.map((l, i) => <p key={i}>{l.quantity} × {l.name} · {l.staffName ?? "Venta de producto"}</p>)}</div>)}<h3>Citas y observaciones</h3>{data.visits.map((v) => <div key={v.id}><strong>{formatDateTime(v.startsAt)} · {v.service.name}</strong><p>{v.staff.name} · {({ PENDING: "Pendiente", CONFIRMED: "Confirmada", COMPLETED: "Completada", CANCELLED: "Cancelada", NO_SHOW: "No asistió" } as Record<string, string>)[v.status]} · {v.notes ?? "Sin observaciones"}</p></div>)}<div className={styles.toolbar}><Button disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</Button><span>Página {page}</span><Button disabled={page * 30 >= Math.max(data.visitTotal, data.history.total)} onClick={() => setPage(page + 1)}>Siguiente</Button></div><p className={styles.muted}>Historial de la sucursal seleccionada. La ficha y preferencias del cliente se comparten entre sucursales.</p></div>;
}
export function CustomerHistory({ customer }: { customer: BarberCustomerDto }) {
  const [open, setOpen] = useState(false);
  return <><Button variant="secondary" size="sm" onClick={() => setOpen(true)}>Historial</Button><Dialog title={customer.name} description={customer.notes ?? "Sin preferencias registradas"} open={open} onClose={() => setOpen(false)}>{open ? <ProfileBody id={customer.id} /> : null}</Dialog></>;
}
