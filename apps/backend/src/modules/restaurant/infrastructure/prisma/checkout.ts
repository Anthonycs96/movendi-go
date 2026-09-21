import { operationCode } from "../../server/operation-code";
import "server-only";
import { prisma } from "@/core/database/prisma";
import { withSerializableTransaction } from "@/core/database/transactions";
import { hasPermission } from "@/core/auth/permissions";
import { AppError } from "@/core/auth/errors";
import type { TenantScope } from "@/core/auth/types";
import { applyCashEffect } from "@/modules/cash/server/service";
import { validateSalePayments } from "@/modules/sales/server/service";
import { loyaltyRedemptionLimit } from "@movendi/contracts";
import { recordRestaurantSale } from "../../server/sale-registration";
import { consumeRestaurantSaleInventory } from "../../server/sale-inventory";
import { getRestaurantConfiguration, assertRestaurantConfigured } from "../../server/configuration";
import { queueRestaurantSaleDocument } from "../../server/sunat";
import { claimOrder } from "../../server/order-version";
import { checkoutOrderUseCase } from "../../application/checkout";
import { assertOrderPayable } from "../../domain/checkout";

export type CheckoutInput = { cashSessionId?: string; redeemPoints: number; receivedAmount?: number; paymentMethod?: string; payments?: Array<{ method: string; amount: number; reference?: string }> };
import { required } from "../../server/owned";

export async function checkoutRestaurantOrder(scope: TenantScope, id: string, input: CheckoutInput) {
  if (!hasPermission(scope.permissions, "restaurant:orders:charge")) throw new AppError("FORBIDDEN", 403, "No tienes permiso para cobrar pedidos.");
  const configuration = await getRestaurantConfiguration(scope.tenantId, scope.branchId);
  const order = await required(prisma.restaurantOrder.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId }, include: { sale: true, kitchenTicket: true } }), "El pedido");
  assertOrderPayable(order);
  const customer = order.customerId ? await prisma.customer.findFirst({ where: { id: order.customerId, tenantId: scope.tenantId, active: true }, select: { loyaltyPoints: true } }) : null;
  const club = configuration.customers;
  if (input.redeemPoints && (!club.loyaltyEnabled || !club.redemptionEnabled || !customer)) throw new AppError("REDEMPTION_UNAVAILABLE", 409, "Activa el canje y vincula un cliente activo al pedido.");
  const maximumPoints = loyaltyRedemptionLimit(order.totalCents, order.deliveryFeeCents, order.subtotalCents, order.discountCents, configuration.sales.maxDiscountPct, club.maxRedemptionPct, club.pointValueCents, customer?.loyaltyPoints ?? 0);
  if (input.redeemPoints > maximumPoints) throw new AppError("REDEMPTION_LIMIT", 409, `Puedes canjear hasta ${maximumPoints} puntos en este pedido. Actualiza el saldo.`);
  const loyaltyDiscountCents = input.redeemPoints * club.pointValueCents;
  const payableCents = order.totalCents - loyaltyDiscountCents;
  const sessions = await prisma.cashSession.findMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId, status: "OPEN", ...(input.cashSessionId ? { id: input.cashSessionId } : {}) }, take: 2 });
  if (input.cashSessionId && !sessions.length) throw new AppError("CASH_CLOSED", 409, "La caja seleccionada no está abierta en esta sucursal.");
  if (sessions.length > 1) throw new AppError("SELECT_CASH_SESSION", 400, "Selecciona la caja que recibirá este cobro.");
  const cash = sessions[0];
  if (!cash && configuration.sales.requireOpenCash) throw new AppError("CASH_CLOSED", 409, "Abre una caja antes de cobrar.");
  const payments = input.payments?.length
    ? input.payments.map((payment) => ({ method: payment.method, amountCents: Math.round(payment.amount * 100), reference: payment.reference || null }))
    : [{ method: input.paymentMethod!, amountCents: payableCents, reference: null }];
  if (payments.length > 1 && !configuration.sales.splitPaymentsEnabled) throw new AppError("SPLIT_PAYMENTS_DISABLED", 409, "Los pagos divididos no están habilitados para esta sede.");
  for (const payment of payments) assertRestaurantConfigured(configuration.sales.paymentMethods, payment.method, "El método de pago");
  const { cashCents: cashPaidCents, changeCents, paymentMethod } = validateSalePayments(payableCents, payments, input.receivedAmount === undefined ? undefined : Math.round(input.receivedAmount * 100));
  if (cashPaidCents > 0 && !cash) throw new AppError("CASH_CLOSED", 409, "Abre una caja para recibir efectivo.");
  const sale = await withSerializableTransaction((tx) => checkoutOrderUseCase({
    claim: () => claimOrder(tx, scope, order),
    redeemPoints: async () => {
      if (input.redeemPoints && order.customerId) {
        const redeemed = await tx.customer.updateMany({ where: { id: order.customerId, tenantId: scope.tenantId, active: true, loyaltyPoints: { gte: input.redeemPoints } }, data: { loyaltyPoints: { decrement: input.redeemPoints } } });
        if (!redeemed.count) throw new AppError("POINTS_CHANGED", 409, "El saldo de puntos cambió. Actualiza antes de cobrar.");
      }
    },
    receiveCash: async () => {
      if (cash) {
        await applyCashEffect(tx, scope, cash.id, cashPaidCents, { code: "CASH_CLOSED", message: "La caja se cerró durante el cobro. Actualiza la operación." });
      }
    },
    recordSale: () => recordRestaurantSale(tx, scope, { customerId: order.customerId, cashReceivedCents: input.receivedAmount !== undefined ? Math.round(input.receivedAmount * 100) : null, changeCents, loyaltyPointsRedeemed: input.redeemPoints, loyaltyDiscountCents, loyaltyPointsEarned: configuration.customers.loyaltyEnabled && order.customerId ? Math.floor((payableCents / 100) * configuration.customers.pointsPerCurrencyUnit) : 0, orderId: order.id, cashSessionId: cash?.id ?? null, cashierId: scope.actorId, code: operationCode(configuration.general.salePrefix), paymentMethod, subtotalCents: order.subtotalCents, discountCents: order.discountCents + loyaltyDiscountCents, promotionName: order.promotionName, totalCents: payableCents, payments }),
    consumeInventory: async (created) => { await consumeRestaurantSaleInventory(tx, scope, order.id, created.id, configuration.inventory.preventNegativeStock && !configuration.menu.allowOutOfStockSales, configuration.inventory.autoDeductRecipes); },
    completeOrder: async (created) => {
      await tx.restaurantOrder.update({ where: { id: order.id }, data: { status: "COMPLETED", completedAt: new Date(), totalCents: payableCents, discountCents: order.discountCents + loyaltyDiscountCents } });
      if (configuration.customers.loyaltyEnabled && order.customerId) await tx.customer.update({ where: { id: order.customerId }, data: { loyaltyPoints: { increment: created.loyaltyPointsEarned } } });
      if (order.tableId && (!order.kitchenTicket || order.kitchenTicket.status === "SERVED")) await tx.diningTable.update({ where: { id: order.tableId }, data: { status: configuration.floor.cleaningRequired ? "CLEANING" : "AVAILABLE" } });
    },
    audit: async (created) => { await tx.auditLog.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, userId: scope.actorId, action: "CHECKOUT", entityType: "Sale", entityId: created.id, metadata: JSON.stringify({ orderId: order.id, cashSessionId: cash?.id, payments, loyaltyPointsRedeemed: input.redeemPoints, loyaltyDiscountCents, cashReceivedCents: created.cashReceivedCents, changeCents: created.changeCents }) } }); },
    queueDocument: async (created) => {
      if (configuration.integrations.sunatEnabled && configuration.integrations.sunatAutoIssue) await queueRestaurantSaleDocument(tx, scope, created.id, configuration);
    },
  }));
  const electronicDocumentMessage = configuration.integrations.sunatEnabled && configuration.integrations.sunatAutoIssue ? " Comprobante en cola; aceptación pendiente." : "";
  return { ok: true, id: sale.id, message: `Venta registrada.${order.kitchenTicket && order.kitchenTicket.status !== "SERVED" ? " La preparación o el servicio siguen pendientes." : order.tableId ? " Mesa enviada a limpieza." : ""}${electronicDocumentMessage}` };
}
