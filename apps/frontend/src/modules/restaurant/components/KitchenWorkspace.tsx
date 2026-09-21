"use client";

import { useEffect, useMemo, useState } from "react";
import { useRestaurantLive } from "./use-restaurant-live";
import { ChefHat } from "lucide-react";
import type { RestaurantData } from "../types";
import {
  Card,
  Select,
  EmptyState,
  OperationButton,
  PageHeader,
  StatusBadge,
} from "@/shared/components/ui";
import { formatTime } from "@/shared/lib/format";
import { localizeCode } from "@/shared/lib/localization";
import { preparationLabels } from "./OrderService";
import { KitchenPrintStation } from "./KitchenPrintStation";

function kitchenTone(createdAt: string, warningMinutes: number, criticalMinutes: number): "danger" | "warning" | "info" {
  const minutes = (Date.now() - new Date(createdAt).getTime()) / 60_000;
  return minutes >= criticalMinutes ? "danger" : minutes >= warningMinutes ? "warning" : "info";
}

export function KitchenWorkspace({
  data,
  locale,
  businessName,
  canWrite,
}: {
  data: RestaurantData;
  locale: string;
  businessName: string;
  canWrite: boolean;
}) {
  const activePrinters = useMemo(() => data.printDevices.filter((printer) => printer.active), [data.printDevices]);
  const { connected } = useRestaurantLive();
  const [now, setNow] = useState(0);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const [view, setView] = useState("ORDERS");
  const [area, setArea] = useState("ALL");
  const areas = [...new Map(data.kitchen.flatMap((order) => order.items.map((item) => [item.preparationAreaKey, item.preparationAreaName] as const))).entries()];
  const tickets = data.kitchen.flatMap((order) => {
    const groups = [...new Set(order.items.filter((item) => !["CANCELLED", "SERVED", "HELD"].includes(item.status)).map((item) => item.preparationAreaKey))];
    return groups.filter((key) => area === "ALL" || area === key).map((key) => {
      const items = order.items.filter((item) => item.preparationAreaKey === key && !["CANCELLED", "SERVED", "HELD"].includes(item.status));
      const state = items.every((item) => item.status === "READY") ? "READY" : items.some(item => item.status === "READY") ? "PARTIALLY_READY" : items.some(item => item.status === "PREPARING") ? "PREPARING" : "QUEUED";
      return { ...order, areaKey: key, areaName: items[0].preparationAreaName, items, kitchenTicket: order.kitchenTicket ? { ...order.kitchenTicket, status: state } : null };
    });
  });
  const production = [...tickets.reduce((groups, ticket) => {
    for (const item of ticket.items.filter((line) => line.status !== "READY")) {
      const key = `${ticket.areaKey}:${item.name}:${item.notes ?? ""}:${item.status}`;
      const existing = groups.get(key) ?? { key, name: item.name, notes: item.notes, area: ticket.areaName, quantity: 0, orders: [] as string[], status: item.status };
      existing.quantity += item.quantity;
      existing.orders.push(`${ticket.code} (${item.quantity})`);
      groups.set(key, existing);
    }
    return groups;
  }, new Map<string, { key: string; name: string; notes: string | null; area: string; quantity: number; orders: string[]; status: string }>()).values()];
  return (
    <>
      <PageHeader
        eyebrow="Producción"
        title="Cocina"
        description="Cada área avanza sus propios productos. El pedido queda listo cuando todas terminan."
        actions={
          <div className="live-chip live-chip--amber">
            <span />
            {connected ? `${data.kitchen.length} activas · Conectado` : "Sin conexión · Reintentando"}
          </div>
        }
      />
      {canWrite ? <KitchenPrintStation businessName={businessName} printers={activePrinters} defaultPrinterId={data.printSettings.defaultPrinterId} /> : null}
      <div className="kitchen-area-filter"><label htmlFor="kitchen-area">Área de preparación</label><Select id="kitchen-area" value={area} onChange={(event) => setArea(event.target.value)}><option value="ALL">Todas las áreas</option>{areas.map(([key, name]) => <option key={key} value={key}>{localizeCode(name, locale)}</option>)}</Select></div>
      <div className="workspace-tabs" role="group" aria-label="Vista de cocina"><button type="button" aria-pressed={view === "ORDERS"} onClick={() => setView("ORDERS")}>Por pedido</button><button type="button" aria-pressed={view === "PRODUCTION"} onClick={() => setView("PRODUCTION")}>Por producción</button></div>
      {view === "PRODUCTION" ? <section className="kitchen-grid" aria-label="Producción pendiente">{production.length ? production.map((group) => <Card className="kitchen-ticket kitchen-production-card" key={group.key}><header><div><small>{localizeCode(group.area, locale)} · {localizeCode(group.status, locale)}</small><h3>{group.quantity} × {group.name}</h3></div></header>{group.notes ? <p><strong>Observación: {group.notes}</strong></p> : null}<p>{group.orders.join(" · ")}</p><small>Avanza cada pedido desde la vista Por pedido para conservar su entrega individual.</small></Card>) : <EmptyState title="Sin producción pendiente" description="Los pedidos listos se consultan en la vista Por pedido." />}</section> : tickets.length ? (
        <section className="kitchen-grid">
          {tickets.map((order) => (
            <Card className="kitchen-ticket" key={`${order.id}:${order.areaKey}`}>
              <header>
                <div>
                  <span>{order.code} · {localizeCode(order.areaName, locale)}{order.paid ? " · Pagado" : ""}</span>
                  <h3>
                    {order.table?.name ??
                      (order.source === "DELIVERY"
                        ? "Delivery"
                        : "Para llevar")}
                  </h3>
                  {order.source === "DELIVERY" ? (
                    <small>
                      {order.customer?.name} · {order.deliveryAddress}
                    </small>
                  ) : null}
                </div>
                <StatusBadge
                  tone={
                    order.kitchenTicket?.status === "READY"
                      ? "success"
                      : kitchenTone(order.kitchenTicket?.createdAt ?? order.createdAt, data.configuration.kitchen.warningMinutes, data.configuration.kitchen.criticalMinutes)
                  }
                >
                  {preparationLabels[order.kitchenTicket?.status ?? ""] ?? localizeCode(order.kitchenTicket?.status, locale)}
                </StatusBadge>
              </header>
              <div className="ticket-time">
                <ChefHat size={15} />
                {formatTime(order.createdAt)} · {now ? `${Math.max(0, Math.floor((now - Date.parse(order.createdAt)) / 60000))} min de espera` : "Calculando espera…"}
              </div>
              <ul>
                {order.items.map((item) => (
                  <li key={item.id}>
                    <b>{item.quantity}×</b>
                    <span>
                      {item.name}
                      {item.notes ? <small>{item.notes}</small> : null}
                    </span>
                    <StatusBadge
                      tone={item.status === "READY" ? "success" : item.status === "PREPARING" ? "warning" : "neutral"}
                    >
                      {preparationLabels[item.status] ?? localizeCode(item.status, locale)}
                    </StatusBadge>
                    {canWrite && order.kitchenTicket && ["PENDING", "QUEUED", "PREPARING"].includes(item.status) ? <OperationButton endpoint={`/api/operations/restaurant/kitchen/${order.kitchenTicket.id}/status`} body={{ itemIds: [item.id], status: item.status === "PREPARING" || item.stockModeSnapshot === "RESALE" ? "READY" : "PREPARING" }} variant="primary">{item.status === "PREPARING" || item.stockModeSnapshot === "RESALE" ? "Marcar listo" : "Preparar"} · {item.name}</OperationButton> : null}
                  </li>
                ))}
              </ul>
              {canWrite && order.kitchenTicket && order.items.some(item => ["PENDING", "QUEUED", "PREPARING"].includes(item.status)) ? <footer>
                <OperationButton endpoint={`/api/operations/restaurant/kitchen/${order.kitchenTicket.id}/status`} body={{ status: "READY", confirmed: true, itemIds: order.items.filter(item => ["PENDING", "QUEUED", "PREPARING"].includes(item.status)).map(item => item.id) }} confirmMessage={`¿Marcar todos los productos de ${order.areaName} como listos? Confirma que están preparados; las otras áreas no cambiarán.`}>Marcar todos listos</OperationButton>
              </footer> : null}
            </Card>
          ))}
        </section>
      ) : (
        <Card>
          <EmptyState
            title="Cocina al día"
            description="No hay comandas pendientes en esta sucursal."
          />
        </Card>
      )}
    </>
  );
}
