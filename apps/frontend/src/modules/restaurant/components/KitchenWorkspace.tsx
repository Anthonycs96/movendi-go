"use client";

import { useState } from "react";
import { useLiveRefresh } from "@/shared/lib/use-live-refresh";
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
  useLiveRefresh(10_000);
  const [area, setArea] = useState("ALL");
  const areas = [...new Map(data.kitchen.flatMap((order) => order.items.map((item) => [item.preparationAreaKey, item.preparationAreaName] as const))).entries()];
  const tickets = data.kitchen.flatMap((order) => {
    const groups = [...new Set(order.items.filter((item) => !["CANCELLED", "SERVED", "HELD"].includes(item.status)).map((item) => item.preparationAreaKey))];
    return groups.filter((key) => area === "ALL" || area === key).map((key) => {
      const items = order.items.filter((item) => item.preparationAreaKey === key && !["CANCELLED", "SERVED", "HELD"].includes(item.status));
      const state = items.every((item) => item.status === "READY") ? "READY" : items.some((item) => item.status === "PREPARING" || item.status === "READY") ? "PREPARING" : "QUEUED";
      return { ...order, areaKey: key, areaName: items[0].preparationAreaName, items, kitchenTicket: order.kitchenTicket ? { ...order.kitchenTicket, status: state } : null };
    });
  });
  return (
    <>
      <PageHeader
        eyebrow="Producción"
        title="Cocina"
        description="Cada área avanza sus propios productos. El pedido queda listo cuando todas terminan."
        actions={
          <div className="live-chip live-chip--amber">
            <span />
            {data.kitchen.length} activas
          </div>
        }
      />
      {canWrite ? <KitchenPrintStation businessName={businessName} printers={data.printDevices.filter((printer) => printer.active)} /> : null}
      <div className="kitchen-area-filter"><label htmlFor="kitchen-area">Área de preparación</label><Select id="kitchen-area" value={area} onChange={(event) => setArea(event.target.value)}><option value="ALL">Todas las áreas</option>{areas.map(([key, name]) => <option key={key} value={key}>{localizeCode(name, locale)}</option>)}</Select></div>
      {tickets.length ? (
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
                  {localizeCode(order.kitchenTicket?.status, locale)}
                </StatusBadge>
              </header>
              <div className="ticket-time">
                <ChefHat size={15} />
                {formatTime(order.createdAt)}
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
                      tone={item.status === "READY" ? "success" : "neutral"}
                    >
                      {localizeCode(item.status, locale)}
                    </StatusBadge>
                  </li>
                ))}
              </ul>
              {canWrite ? <footer>
                {order.kitchenTicket && order.items.some((item) => ["PENDING", "QUEUED"].includes(item.status)) ? (
                  <OperationButton
                    endpoint={`/api/operations/restaurant/kitchen/${order.kitchenTicket.id}/status`}
                    body={{ status: "PREPARING", itemIds: order.items.filter((item) => ["PENDING", "QUEUED"].includes(item.status)).map((item) => item.id) }}
                    variant="primary"
                  >
                    Iniciar preparación
                  </OperationButton>
                ) : null}
                {order.kitchenTicket && order.items.some((item) => item.status === "PREPARING") ? (
                  <OperationButton
                    endpoint={`/api/operations/restaurant/kitchen/${order.kitchenTicket.id}/status`}
                    body={{ status: "READY", itemIds: order.items.filter((item) => item.status === "PREPARING").map((item) => item.id) }}
                    variant="primary"
                  >
                    Marcar listo
                  </OperationButton>
                ) : null}
                {order.kitchenTicket && order.items.some((item) => item.status === "READY") ? (
                  <OperationButton
                    endpoint={`/api/operations/restaurant/kitchen/${order.kitchenTicket.id}/status`}
                    body={{ status: "SERVED", itemIds: order.items.filter((item) => item.status === "READY").map((item) => item.id) }}
                    variant="primary"
                  >
                    Entregado
                  </OperationButton>
                ) : null}
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
