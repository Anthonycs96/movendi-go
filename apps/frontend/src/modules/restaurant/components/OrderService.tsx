"use client";
import type { RestaurantOrderDto } from "../types";
import { OperationButton, StatusBadge } from "@/shared/components/ui";
import { formatTime } from "@/shared/lib/format";

export const preparationLabels: Record<string, string> = { HELD: "Sin enviar", PENDING: "Pendiente", QUEUED: "Pendiente", PREPARING: "En preparación", PARTIALLY_READY: "Parcialmente listo", READY: "Listo para servir", SERVED: "Servido", CANCELLED: "Cancelado" };
export function ItemService({ item, orderId, canServe }: { item: RestaurantOrderDto["items"][number]; orderId: string; canServe: boolean }) {
  return <div className="item-service"><StatusBadge tone={item.status === "READY" ? "success" : item.status === "PREPARING" ? "warning" : "neutral"}>{preparationLabels[item.status] ?? item.status}</StatusBadge>
    {item.servedAt ? <small>Servido {formatTime(item.servedAt)}</small> : item.readyAt ? <small>Listo {formatTime(item.readyAt)}</small> : null}
    {canServe && item.status === "READY" ? <OperationButton endpoint={`/api/operations/restaurant/orders/${orderId}/serve`} body={{ itemIds: [item.id] }} variant="primary">Servir {item.name}</OperationButton> : null}
  </div>;
}
export function ServeReady({ order, canServe }: { order: RestaurantOrderDto; canServe: boolean }) {
  const ready = order.items.filter(item => item.status === "READY");
  return canServe && ready.length > 0 ? <OperationButton endpoint={`/api/operations/restaurant/orders/${order.id}/serve`} body={{ itemIds: ready.map(item => item.id) }} confirmMessage={`¿Confirmas que entregaste los ${ready.length} productos listos? Los demás seguirán en preparación.`}>Marcar listos como servidos ({ready.length})</OperationButton> : null;
}
