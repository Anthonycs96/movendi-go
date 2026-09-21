import "server-only";
import { prisma } from "@/core/database/prisma";
import { hasPermission } from "@/core/auth/permissions";
import { TransactionConflictError, withSerializableTransaction } from "@/core/database/transactions";
import { AppError } from "@/core/auth/errors";
import type { TenantScope } from "@/core/auth/types";
import { getRestaurantConfiguration, hasStoredRestaurantConfiguration } from "../../server/configuration";
import { claimOrder } from "../../server/order-version";
import { cancelOrderIngredients, aggregatePreparationStatus } from "../../server/preparation";
import { createRoutedPrintJobs } from "../../server/printing";
import { changePreparation, changeOrderState } from "../../application/change-preparation";
import { required } from "../../server/owned";
export async function updateKitchen(scope: TenantScope, id: string, input: { status: string; itemIds?: string[]; confirmed?: boolean }) {
  const permission = input.status === "SERVED" ? "restaurant:orders:serve" : input.status === "CANCELLED" ? "restaurant:orders:cancel" : "restaurant:kitchen:write";
  if (!hasPermission(scope.permissions, permission)) throw new AppError("FORBIDDEN", 403, "No tienes permiso para esta operación.");
  const configuration = await getRestaurantConfiguration(scope.tenantId, scope.branchId);
  await withSerializableTransaction(async (tx) => {
    const ticket = await required(tx.kitchenTicket.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId }, select: { id: true, orderId: true, status: true, order: { select: { id: true, version: true, tableId: true, source: true, status: true, sale: { select: { id: true } } } } } }), "La comanda");
    if (["SERVED", "CANCELLED", "HELD"].includes(ticket.status) || ticket.order.status === "CANCELLED") throw new AppError("TICKET_CLOSED", 409, "La comanda ya está cerrada y no admite cambios.");
    let changedItemIds: string[] = [];
    await changePreparation({
      claim: async () => {
        if (ticket.order.sale && input.status === "CANCELLED") throw new AppError("REFUND_REQUIRED", 409, "Este pedido está pagado. Registra la devolución desde la venta.");
        try { await claimOrder(tx, scope, ticket.order, true); }
        catch (error) { if (error instanceof AppError && error.code === "ORDER_CHANGED") throw new TransactionConflictError(error.message); throw error; }
      },
      lines: async () => {
        const route = { kitchenArea: true, areaAssignmentMode: true, preparationAreaId: true, category: { select: { preparationAreaId: true } } } as const;
        const lines = await tx.orderItem.findMany({ where: { orderId: ticket.orderId, tenantId: scope.tenantId, status: { not: "CANCELLED" } }, include: { product: { select: route }, parentProduct: { select: route } } });
        return lines.map(line => {
          const product = line.product.areaAssignmentMode === "INHERIT_FROM_PRODUCT" && line.parentProduct ? line.parentProduct : line.product;
          return { ...line, preparationAreaKey: line.recipeSnapshot === null && line.preparationAreaKey === "GENERAL" ? product.preparationAreaId ?? product.category.preparationAreaId ?? product.kitchenArea : line.preparationAreaKey };
        });
      },
      cancelIngredients: () => cancelOrderIngredients(tx, scope, ticket.orderId, "Comanda anulada desde cocina").then(() => { }),
      updateLines: async (ids) => {
        changedItemIds = ids;
        await tx.orderItem.updateMany({ where: { id: { in: ids }, tenantId: scope.tenantId, orderId: ticket.orderId, status: { not: input.status } }, data: { status: input.status,
          ...(input.status === "PREPARING" ? { startedAt: new Date(), startedByUserId: scope.actorId } : {}),
          ...(input.status === "READY" ? { readyAt: new Date(), readyByUserId: scope.actorId } : {}),
          ...(input.status === "SERVED" ? { servedAt: new Date(), servedByUserId: scope.actorId } : {}),
        } });
      },
      finish: async () => {
        const remaining = await tx.orderItem.findMany({ where: { orderId: ticket.orderId }, select: { status: true } });
        const aggregate = aggregatePreparationStatus(remaining.map((line) => line.status));
        await tx.kitchenTicket.update({ where: { id: ticket.id }, data: { status: aggregate } });
        await tx.restaurantOrder.update({ where: { id: ticket.orderId }, data: { status: ticket.order.sale ? "COMPLETED" : aggregate === "QUEUED" ? "PLACED" : aggregate === "PARTIALLY_READY" ? "PREPARING" : aggregate, completedAt: aggregate === "CANCELLED" ? new Date() : undefined, ...(ticket.order.source === "DELIVERY" && ["READY", "CANCELLED"].includes(aggregate) ? { deliveryStatus: aggregate } : {}) } });
        if (aggregate === "SERVED" && ticket.order.sale && ticket.order.tableId) await tx.diningTable.update({ where: { id: ticket.order.tableId }, data: { status: configuration.floor.cleaningRequired ? "CLEANING" : "AVAILABLE" } });
        if (aggregate === "CANCELLED" && ticket.order.tableId) await tx.diningTable.update({ where: { id: ticket.order.tableId }, data: { status: "AVAILABLE" } });
        if (aggregate === "CANCELLED") await createRoutedPrintJobs(tx, scope, { orderId: ticket.orderId, type: "CANCELLATION", lines: [], orderNotes: "COMANDA ANULADA DESDE COCINA" });
      },
      audit: async () => { await tx.auditLog.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, userId: scope.actorId, action: "STATUS_CHANGE", entityType: "KitchenTicket", entityId: ticket.id, metadata: JSON.stringify({ status: input.status, itemIds: changedItemIds, confirmed: input.confirmed }) } }); },
    }, input, { allowCancellation: configuration.kitchen.allowKitchenCancellation, statuses: configuration.kitchen.ticketStatuses });
  });
  return { ok: true, message: "Comanda actualizada." };
}

export async function updateOrderState(scope: TenantScope, id: string, input: { status: string; reason?: string }) {
  if (["PREPARING", "READY", "SERVED", "PARTIALLY_READY"].includes(input.status)) throw new AppError("USE_ITEM_ACTIONS", 409, "Actualiza los productos desde Cocina o Servir para conservar su avance.");
  if (input.status === "COMPLETED") throw new AppError("CHECKOUT_REQUIRED", 409, "Completa el cobro para cerrar el pedido y registrar su venta.");
  const permission = input.status === "CANCELLED" ? "restaurant:orders:cancel" : "restaurant:orders:write";
  if (!hasPermission(scope.permissions, permission)) throw new AppError("FORBIDDEN", 403, "No tienes permiso para esta operación.");
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
    },
    audit: async () => { await tx.auditLog.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, userId: scope.actorId, action: "STATUS_CHANGE", entityType: "RestaurantOrder", entityId: order.id, metadata: JSON.stringify({ status: input.status }) } }); },
  }, input.status));
  return { ok: true, message: "Estado del pedido actualizado." };
}
