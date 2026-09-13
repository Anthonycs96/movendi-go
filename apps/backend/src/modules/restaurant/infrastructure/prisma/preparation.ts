import "server-only";
import { prisma } from "@/core/database/prisma";
import { withSerializableTransaction } from "@/core/database/transactions";
import { AppError } from "@/core/auth/errors";
import type { TenantScope } from "@/core/auth/types";
import { getRestaurantConfiguration, hasStoredRestaurantConfiguration } from "../../server/configuration";
import { claimOrder } from "../../server/order-version";
import { cancelOrderIngredients, aggregatePreparationStatus } from "../../server/preparation";
import { createRoutedPrintJobs } from "../../server/printing";
import { changePreparation, changeOrderState } from "../../application/change-preparation";
import { required } from "../../server/owned";
export async function updateKitchen(scope: TenantScope, id: string, input: { status: string; itemIds?: string[] }) {
  const configuration = await getRestaurantConfiguration(scope.tenantId, scope.branchId);
  const ticket = await required(prisma.kitchenTicket.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId }, select: { id: true, orderId: true, status: true, order: { select: { id: true, version: true, tableId: true, source: true, status: true, sale: { select: { id: true } } } } } }), "La comanda");
  if (["SERVED", "CANCELLED", "HELD"].includes(ticket.status) || ticket.order.status === "CANCELLED") throw new AppError("TICKET_CLOSED", 409, "La comanda ya está cerrada y no admite cambios.");
  await withSerializableTransaction((tx) => changePreparation({
    claim: async () => {
      if (ticket.order.sale && input.status === "CANCELLED") throw new AppError("REFUND_REQUIRED", 409, "Este pedido está pagado. Registra la devolución desde la venta.");
      await claimOrder(tx, scope, ticket.order, true);
    },
    lines: () => tx.orderItem.findMany({ where: { orderId: ticket.orderId, tenantId: scope.tenantId, status: { not: "CANCELLED" } } }),
    cancelIngredients: () => cancelOrderIngredients(tx, scope, ticket.orderId, "Comanda anulada desde cocina").then(() => { }),
    updateLines: async (ids) => {
      await tx.orderItem.updateMany({ where: { id: { in: ids }, tenantId: scope.tenantId, orderId: ticket.orderId }, data: { status: input.status } });
    },
    finish: async () => {
      const remaining = await tx.orderItem.findMany({ where: { orderId: ticket.orderId }, select: { status: true } });
      const aggregate = aggregatePreparationStatus(remaining.map((line) => line.status));
      await tx.kitchenTicket.update({ where: { id: ticket.id }, data: { status: aggregate } });
      await tx.restaurantOrder.update({ where: { id: ticket.orderId }, data: { status: ticket.order.sale ? "COMPLETED" : aggregate === "QUEUED" ? "PLACED" : aggregate, completedAt: aggregate === "CANCELLED" ? new Date() : undefined, ...(ticket.order.source === "DELIVERY" && ["READY", "CANCELLED"].includes(aggregate) ? { deliveryStatus: aggregate } : {}) } });
      if (aggregate === "SERVED" && ticket.order.sale && ticket.order.tableId) await tx.diningTable.update({ where: { id: ticket.order.tableId }, data: { status: configuration.floor.cleaningRequired ? "CLEANING" : "AVAILABLE" } });
      if (aggregate === "CANCELLED" && ticket.order.tableId) await tx.diningTable.update({ where: { id: ticket.order.tableId }, data: { status: "AVAILABLE" } });
      if (aggregate === "CANCELLED") await createRoutedPrintJobs(tx, scope, { orderId: ticket.orderId, type: "CANCELLATION", lines: [], orderNotes: "COMANDA ANULADA DESDE COCINA" });
    },
    audit: async () => { await tx.auditLog.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, userId: scope.actorId, action: "STATUS_CHANGE", entityType: "KitchenTicket", entityId: ticket.id, metadata: JSON.stringify({ status: input.status }) } }); },
  }, input, { allowCancellation: configuration.kitchen.allowKitchenCancellation, statuses: configuration.kitchen.ticketStatuses }));
  return { ok: true, message: "Comanda actualizada." };
}

export async function updateOrderState(scope: TenantScope, id: string, input: { status: string; reason?: string }) {
  if (input.status === "COMPLETED") throw new AppError("CHECKOUT_REQUIRED", 409, "Completa el cobro para cerrar el pedido y registrar su venta.");
  const configuration = await getRestaurantConfiguration(scope.tenantId, scope.branchId);
  const storedConfiguration = await hasStoredRestaurantConfiguration(scope.tenantId);
  const order = await required(prisma.restaurantOrder.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId }, select: { id: true, version: true, tableId: true, status: true, sale: { select: { id: true } } } }), "El pedido");
  if (order.sale || ["COMPLETED", "CANCELLED"].includes(order.status)) throw new AppError("ORDER_CLOSED", 409, "El pedido ya está cerrado y no admite cambios.");
  const currentStatus = configuration.orders.statuses.find((item) => item.active && item.key === order.status);
  if (!currentStatus?.allowedNext.includes(input.status)) throw new AppError("INVALID_STATUS_TRANSITION", 409, `No se puede cambiar de ${order.status} a ${input.status} según el flujo configurado.`);
  if (storedConfiguration && input.status === "CANCELLED" && configuration.orders.requireCancellationReason && !input.reason) throw new AppError("CANCELLATION_REASON_REQUIRED", 400, "Selecciona o escribe el motivo de cancelación.");
  await withSerializableTransaction((tx) => changeOrderState({
    claim: () => claimOrder(tx, scope, order),
    cancel: async () => {
      await cancelOrderIngredients(tx, scope, order.id, input.reason || "Pedido cancelado");
      await tx.restaurantOrder.update({ where: { id: order.id }, data: { status: "CANCELLED", completedAt: new Date(), notes: input.reason || undefined } });
      await tx.kitchenTicket.updateMany({ where: { orderId: order.id }, data: { status: "CANCELLED" } });
      await tx.orderItem.updateMany({ where: { orderId: order.id }, data: { status: "CANCELLED" } });
      if (order.tableId) await tx.diningTable.update({ where: { id: order.tableId }, data: { status: "AVAILABLE" } });
      await createRoutedPrintJobs(tx, scope, { orderId: order.id, type: "CANCELLATION", lines: [], orderNotes: "PEDIDO COMPLETO ANULADO" });
    },
    update: async () => {
      await tx.restaurantOrder.update({ where: { id: order.id }, data: { status: input.status } });
      if (["PREPARING", "READY", "SERVED"].includes(input.status)) {
        const areas = await tx.orderItem.findMany({ where: { orderId: order.id, status: { notIn: ["CANCELLED", "SERVED"] } }, select: { preparationAreaKey: true } });
        if (new Set(areas.map((line) => line.preparationAreaKey)).size > 1) throw new AppError("USE_KITCHEN_STATIONS", 409, "Actualiza cada área desde Cocina para conservar su avance independiente.");
        await tx.kitchenTicket.updateMany({ where: { orderId: order.id }, data: { status: input.status } });
        await tx.orderItem.updateMany({ where: { orderId: order.id, status: { not: "CANCELLED" } }, data: { status: input.status } });
      }
    },
    audit: async () => { await tx.auditLog.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, userId: scope.actorId, action: "STATUS_CHANGE", entityType: "RestaurantOrder", entityId: order.id, metadata: JSON.stringify({ status: input.status }) } }); },
  }, input.status));
  return { ok: true, message: "Estado del pedido actualizado." };
}
