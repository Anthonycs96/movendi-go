"use client";

import { useEffect, useState } from "react";
import type { RestaurantStaffActivity } from "@movendi/contracts";
import { RefreshCw, Users } from "lucide-react";
import { Button, Card, Field, Select } from "@/shared/components/ui";
import { formatDateTime } from "@/shared/lib/format";
import { localizeCode } from "@/shared/lib/localization";

const entities: Record<string, string> = { RestaurantOrder: "pedido", KitchenTicket: "comanda", DiningTable: "mesa", DiningArea: "ambiente", Sale: "venta", CashSession: "caja", CashMovement: "movimiento de caja", Customer: "cliente", Product: "producto", Category: "categoría", Promotion: "promoción", RestaurantPrintJob: "impresión", Membership: "usuario", User: "usuario", Role: "rol" };
const actions: Record<string, string> = { UPDATE_PASSWORD: "Cambio de contraseña", OPEN: "Apertura", QUEUE: "Envío a cocina", TRANSFER: "Traslado", DELIVERY_STATUS_CHANGE: "Estado de entrega actualizado", CASH_IN: "Ingreso de efectivo", CASH_OUT: "Retiro de efectivo", PRINT_COMMAND: "Comanda impresa", PRINT_FAILED: "Fallo de impresión", REPRINT_COMMAND: "Reimpresión", REFUND: "Devolución", CANCEL: "Cancelación" };
function description(event: { action: string; entityType: string }) {
  return `${actions[event.action] ?? localizeCode(event.action)} · ${entities[event.entityType] ?? "registro operativo"}`;
}

export function StaffActivity() {
  const [worker, setWorker] = useState("");
  const [days, setDays] = useState("1");
  const [cursor, setCursor] = useState("");
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<RestaurantStaffActivity | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function load() {
      if (pending) return;
      pending = true;
      try {
        const params = new URLSearchParams({ days, worker, cursor });
        const response = await fetch(`/api/data/restaurant-staff?${params}`, { cache: "no-store", signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message ?? "No pudimos consultar la actividad.");
        if (!controller.signal.aborted) { setData(result); setError(""); }
      } catch (reason) {
        if (!controller.signal.aborted) { setData(null); setError(reason instanceof Error ? reason.message : "No pudimos consultar la actividad."); }
      } finally { pending = false; if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    const timer = window.setInterval(() => { if (!cursor && document.visibilityState === "visible") void load(); }, 15_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [worker, days, cursor, revision]);
  function reset() { setLoading(true); setError(""); setCursor(""); }
  return <Card className="staff-activity" aria-label="Actividad del personal">
    <header><div><h2><Users size={20} /> Actividad del personal</h2><p>Acciones registradas en esta sucursal. Los pedidos se atribuyen a quien los creó; no indican presencia ni actividad fuera del sistema.</p></div><Button type="button" variant="secondary" disabled={loading} onClick={() => { reset(); setRevision((value) => value + 1); }}><RefreshCw size={16} /> Actualizar</Button></header>
    <div className="staff-activity__filters">
      <Field label="Trabajador"><Select aria-label="Filtrar trabajador" value={worker} onChange={(event) => { reset(); setWorker(event.target.value); }}><option value="">Todo el personal</option>{data?.workers.map((item) => <option key={item.id} value={item.id}>{item.name}{item.active ? "" : " (inactivo)"}</option>)}</Select></Field>
      <Field label="Período"><Select aria-label="Período de actividad" value={days} onChange={(event) => { reset(); setDays(event.target.value); }}><option value="1">Últimas 24 horas</option><option value="7">Últimos 7 días</option></Select></Field>
      <span>{data ? `Actualizado: ${formatDateTime(data.updatedAt)}${cursor ? " · Historial" : " · Cada 15 s"}` : ""}</span>
    </div>
    {loading ? <p role="status">Consultando actividad…</p> : error ? <p role="alert">{error} Usa Actualizar para reintentar.</p> : data ? <>
      <div className="staff-activity__workers">{data.workers.filter((item) => !worker || item.id === worker).map((item) => <article key={item.id}><strong>{item.name}</strong><small>{item.role}{item.active ? "" : " · Inactivo"}</small><b>{item.openOrders} pedidos abiertos creados</b><p>{item.lastActivity ? description(item.lastActivity) : "Sin acciones registradas en el período"}</p>{item.lastActivity ? <time dateTime={item.lastActivity.createdAt}>{formatDateTime(item.lastActivity.createdAt)}</time> : null}</article>)}</div>
      {!data.workers.length ? <p>No hay personal registrado en esta sucursal.</p> : null}
      <h3>Registro de operaciones</h3>
      <ol className="staff-activity__events">{data.events.map((event) => <li key={event.id}><div><strong>{event.user?.name ?? "Sistema"}</strong><span>{description(event)}</span></div><time dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time></li>)}</ol>
      {!data.events.length ? <p>No hay operaciones para este filtro.</p> : null}
      <div className="staff-activity__pages">{cursor ? <Button variant="secondary" onClick={() => { setLoading(true); setCursor(""); }}>Volver a recientes</Button> : null}{data.nextCursor ? <Button variant="secondary" onClick={() => { setLoading(true); setCursor(data.nextCursor!); }}>Ver anteriores</Button> : null}</div>
    </> : null}
  </Card>;
}
