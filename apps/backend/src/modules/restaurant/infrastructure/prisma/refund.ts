import { refundSaleUseCase } from "../../application/refund-sale";
import { applyCashEffect, registerCashMovement } from "@/modules/cash/server/service";
import { reverseRestaurantSaleInventory } from "@/modules/restaurant/server/sale-inventory";
import { withSerializableTransaction } from "@/core/database/transactions";
import "server-only";
import { AppError } from "@/core/auth/errors";
import type { TenantScope } from "@/core/auth/types";
import { hasPermission } from "@/core/auth/permissions";
import { getRestaurantConfiguration } from "../../server/configuration";
import { prisma } from "@/core/database/prisma";
import { queueFullRefundDocument } from "@/modules/invoicing/server/outbox";


export type RefundInput = { reason: string; stockDisposition: "RESTOCK" | "WASTE"; paymentConfirmed: true };
export async function executeRefund(scope: TenantScope, saleId: string, input: RefundInput) {
  const configuration = await getRestaurantConfiguration(scope.tenantId, scope.branchId);
  const membership = await prisma.membership.findFirst({ where: { tenantId: scope.tenantId, userId: scope.actorId, active: true }, include: { role: true } });
  if (!hasPermission(scope.permissions, "restaurant:cash:approve") && !configuration.sales.approvalRoleKeys.includes(membership?.role.key ?? "")) throw new AppError("REFUND_APPROVAL_REQUIRED", 403, "La devolución requiere un administrador o un rol autorizado para aprobar caja.");
  return withSerializableTransaction(async (tx) => {
    const sale = await tx.sale.findFirst({ where: { id: saleId, tenantId: scope.tenantId, branchId: scope.branchId, orderId: { not: null } }, include: { refund: true, payments: true, electronicDocument: true, inventoryMovements: true } });
    if (!sale) throw new AppError("NOT_FOUND", 404, "La venta no pertenece a esta sede.");
    if (sale.refund) {
      if (sale.refund.reason !== input.reason || sale.refund.stockDisposition !== input.stockDisposition) throw new AppError("REFUND_EXISTS", 409, "La venta ya tiene una devolución registrada. Consulta su detalle.");
      return { ok: true, id: sale.refund.id, message: "La devolución ya quedó registrada; no se duplicó dinero ni inventario." };
    }
    if (sale.status !== "PAID") throw new AppError("SALE_NOT_PAID", 409, "Solo se pueden devolver ventas pagadas.");
    if (sale.electronicDocument && sale.electronicDocument.status !== "ISSUED") throw new AppError("FISCAL_STATUS_PENDING", 409, "Consulta el resultado del comprobante antes de devolver esta venta.");
    const payments = sale.payments.length ? sale.payments : [{ method: sale.paymentMethod, amountCents: sale.totalCents, reference: null }];
    const cashCents = payments.filter((payment) => payment.method === "CASH").reduce((sum, payment) => sum + payment.amountCents, 0);
    const cash = await tx.cashSession.findFirst({ where: { tenantId: scope.tenantId, branchId: scope.branchId, status: "OPEN" } });
    return refundSaleUseCase({
      claim: async () => {
        const claimed = await tx.sale.updateMany({ where: { id: sale.id, status: "PAID" }, data: { status: "REFUNDED" } });
        if (claimed.count !== 1) throw new AppError("SALE_CHANGED", 409, "La venta cambió. Consulta su estado antes de reintentar.");
      },
      refundCash: async () => {
        if (cashCents && !cash) throw new AppError("CASH_CLOSED", 409, "Abre una caja para devolver efectivo.");
        if (cash) {
          try {
            if (cashCents) await registerCashMovement(tx, scope, { cashSessionId: cash.id, type: "OUT", amountCents: cashCents, reason: `Devolución ${sale.code}: ${input.reason}` });
            else await applyCashEffect(tx, scope, cash.id, 0);
          } catch (error) {
            if (error instanceof AppError && ["CASH_UNAVAILABLE", "NOT_FOUND"].includes(error.code)) throw new AppError("REFUND_CASH_INSUFFICIENT", 409, "La caja debe estar abierta y tener efectivo suficiente para la devolución.");
            throw error;
          }
        }
      },
      restock: async () => {
        if (input.stockDisposition === "RESTOCK" && sale.inventoryMovements.some((movement) => movement.type === "SALE_CONSUMPTION") && !sale.inventoryMovements.some((movement) => movement.type === "SALE_RETURN")) await reverseRestaurantSaleInventory(tx, scope, sale.id, input.reason);
      },
      cancelPreparation: async () => {
        if (sale.orderId) {
          const order = await tx.restaurantOrder.update({ where: { id: sale.orderId }, data: { version: { increment: 1 } }, select: { tableId: true } });
          await tx.kitchenTicket.updateMany({ where: { orderId: sale.orderId }, data: { status: "CANCELLED" } });
          if (order.tableId) await tx.diningTable.update({ where: { id: order.tableId }, data: { status: configuration.floor.cleaningRequired ? "CLEANING" : "AVAILABLE" } });
        }
      },
      restorePoints: async () => {
        if (sale.customerId && (sale.loyaltyPointsEarned > 0 || sale.loyaltyPointsRedeemed > 0)) {
          const customer = await tx.customer.findUniqueOrThrow({ where: { id: sale.customerId } });
          await tx.customer.update({ where: { id: customer.id }, data: { loyaltyPoints: customer.loyaltyPoints - sale.loyaltyPointsEarned + sale.loyaltyPointsRedeemed } });
        }
      },
      record: () => tx.saleRefund.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, saleId: sale.id, actorId: scope.actorId, reason: input.reason, stockDisposition: input.stockDisposition, totalCents: sale.totalCents, cashCents, payments: JSON.stringify(payments), cashSessionId: cash?.id, creditStatus: sale.electronicDocument?.status === "ISSUED" ? "PENDING" : "NOT_REQUIRED" } }),
      audit: async (refund) => {
        await tx.auditLog.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, userId: scope.actorId, action: "REFUND", entityType: "Sale", entityId: sale.id, metadata: JSON.stringify({ refundId: refund.id, ...input, totalCents: sale.totalCents, cashCents, originalCashSessionId: sale.cashSessionId, refundCashSessionId: cash?.id }) } });
      },
      queueDocument: async (refund) => {
        const job = await queueFullRefundDocument(tx, scope, sale.id);
        return { ok: true, id: refund.id, message: `Devolución total registrada. ${input.stockDisposition === "RESTOCK" ? "Insumos recuperables repuestos." : "Los insumos preparados no vuelven al stock."}${job ? " Nota de crédito en cola." : refund.creditStatus === "PENDING" ? " Emite la nota de crédito desde esta venta." : ""}` };
      },
    });
  });
}
