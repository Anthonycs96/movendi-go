"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChefHat } from "lucide-react";
import type { RestaurantData } from "../types";
import {
  Card,
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
}: {
  data: RestaurantData;
  locale: string;
  businessName: string;
}) {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), 10_000);
    return () => window.clearInterval(timer);
  }, [router]);
  return (
    <>
      <PageHeader
        eyebrow="Producción"
        title="Cocina"
        description="Comandas ordenadas por llegada y estados sincronizados con salón."
        actions={
          <div className="live-chip live-chip--amber">
            <span />
            {data.kitchen.length} activas
          </div>
        }
      />
      <KitchenPrintStation businessName={businessName} printers={data.printDevices.filter((printer) => printer.active)} />
      {data.kitchen.length ? (
        <section className="kitchen-grid">
          {data.kitchen.map((order) => (
            <Card className="kitchen-ticket" key={order.id}>
              <header>
                <div>
                  <span>{order.code}</span>
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
              <footer>
                {order.kitchenTicket?.status === "QUEUED" ? (
                  <OperationButton
                    endpoint={`/api/operations/restaurant/kitchen/${order.kitchenTicket.id}/status`}
                    body={{ status: "PREPARING" }}
                    variant="primary"
                  >
                    Iniciar preparación
                  </OperationButton>
                ) : null}
                {order.kitchenTicket?.status === "PREPARING" ? (
                  <OperationButton
                    endpoint={`/api/operations/restaurant/kitchen/${order.kitchenTicket.id}/status`}
                    body={{ status: "READY" }}
                    variant="primary"
                  >
                    Marcar listo
                  </OperationButton>
                ) : null}
                {order.kitchenTicket?.status === "READY" ? (
                  <OperationButton
                    endpoint={`/api/operations/restaurant/kitchen/${order.kitchenTicket.id}/status`}
                    body={{ status: "SERVED" }}
                    variant="primary"
                  >
                    Entregado
                  </OperationButton>
                ) : null}
                {order.kitchenTicket ? (
                  <OperationButton
                    endpoint={`/api/operations/restaurant/kitchen/${order.kitchenTicket.id}/status`}
                    body={{ status: "CANCELLED" }}
                    variant="danger"
                    confirmMessage="¿Cancelar la comanda y liberar la mesa?"
                  >
                    Cancelar
                  </OperationButton>
                ) : null}
              </footer>
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
