import "server-only";
import { z } from "zod";
import { AppError } from "@/core/auth/errors";
import type { TenantScope } from "@/core/auth/types";
import { hasPermission } from "@/core/auth/permissions";
import { getRestaurantConfiguration } from "./configuration";
import { prisma } from "@/core/database/prisma";
import { reverseRestaurantSaleInventory, withInventoryTransaction } from "@/modules/inventory/server/service";

const refundSchema = z.object({ reason: z.string().trim().min(5).max(300), stockDisposition: z.enum(["RESTOCK", "WASTE"]), paymentConfirmed: z.literal(true) });

export async function refundRestaurantSale(scope: TenantScope, saleId: string, body: unknown) {
  const parsed = refundSchema.safeParse(body);
  if (!parsed.success) throw new AppError("VALIDATION_ERROR", 400, "Indica el motivo, el destino de insumos y confirma la devolución del dinero.", parsed.error.flatten());
  const input = parsed.data;
  const configuration = await getRestaurantConfiguration(scope.tenantId, scope.branchId);
  const membership = await prisma.membership.findFirst({ where: { tenantId: scope.tenantId, userId: scope.actorId, active: true }, include: { role: true } });
  if (!hasPermission(scope.permissions, "restaurant:cash:approve") && !configuration.sales.approvalRoleKeys.includes(membership?.role.key ?? "")) throw new AppError("REFUND_APPROVAL_REQUIRED", 403, "La devolución requiere un administrador o un rol autorizado para aprobar caja.");
  return withInventoryTransaction(async (tx) => {
    const sale = await tx.sale.findFirst({ where: { id: saleId, tenantId: scope.tenantId, branchId: scope.branchId, orderId: { not: null } }, include: { refund: true, payments: true, electronicDocument: true, inventoryMovements: true } });
    if (!sale) throw new AppError("NOT_FOUND", 404, "La venta no pertenece a esta sede.");
    if (sale.refund) {
      if (sale.refund.reason !== input.reason || sale.refund.stockDisposition !== input.stockDisposition) throw new AppError("REFUND_EXISTS", 409, "La venta ya tiene una devolución registrada. Consulta su detalle.");
      return { ok: true, id: sale.refund.id, message: "La devolución ya quedó registrada; no se duplicó dinero ni inventario." };
    }
    if (sale.status !== "PAID") throw new AppError("SALE_NOT_PAID", 409, "Solo se pueden devolver ventas pagadas.");
    if (sale.electronicDocument && ["SENDING", "PENDING", "SUBMITTED"].includes(sale.electronicDocument.status)) throw new AppError("FISCAL_STATUS_PENDING", 409, "Consulta el resultado del comprobante antes de devolver esta venta.");
    const claimed = await tx.sale.updateMany({ where: { id: sale.id, status: "PAID" }, data: { status: "REFUNDED" } });
    if (claimed.count !== 1) throw new AppError("SALE_CHANGED", 409, "La venta cambió. Consulta su estado antes de reintentar.");
    const payments = sale.payments.length ? sale.payments : [{ method: sale.paymentMethod, amountCents: sale.totalCents, reference: null }];
    const cashCents = payments.filter((payment) => payment.method === "CASH").reduce((sum, payment) => sum + payment.amountCents, 0);
    const cash = await tx.cashSession.findFirst({ where: { tenantId: scope.tenantId, branchId: scope.branchId, status: "OPEN" } });
    if (cashCents && !cash) throw new AppError("CASH_CLOSED", 409, "Abre una caja para devolver efectivo.");
    if (cash) {
      const changed = await tx.cashSession.updateMany({ where: { id: cash.id, status: "OPEN", expectedCents: { gte: cashCents } }, data: { expectedCents: { decrement: cashCents } } });
      if (!changed.count) throw new AppError("REFUND_CASH_INSUFFICIENT", 409, "La caja debe estar abierta y tener efectivo suficiente para la devolución.");
    }
    if (cashCents && cash) {
      await tx.cashMovement.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, cashSessionId: cash.id, createdById: scope.actorId, type: "OUT", amountCents: cashCents, reason: `Devolución ${sale.code}: ${input.reason}` } });
    }
    if (input.stockDisposition === "RESTOCK" && sale.inventoryMovements.some((movement) => movement.type === "SALE_CONSUMPTION") && !sale.inventoryMovements.some((movement) => movement.type === "SALE_RETURN")) await reverseRestaurantSaleInventory(tx, scope, sale.id, input.reason);
    if (sale.orderId) {
      const order = await tx.restaurantOrder.update({ where: { id: sale.orderId }, data: { version: { increment: 1 } }, select: { tableId: true } });
      await tx.kitchenTicket.updateMany({ where: { orderId: sale.orderId }, data: { status: "CANCELLED" } });
      if (order.tableId) await tx.diningTable.update({ where: { id: order.tableId }, data: { status: configuration.floor.cleaningRequired ? "CLEANING" : "AVAILABLE" } });
    }
    if (sale.customerId && (sale.loyaltyPointsEarned > 0 || sale.loyaltyPointsRedeemed > 0)) {
      const customer = await tx.customer.findUniqueOrThrow({ where: { id: sale.customerId } });
      await tx.customer.update({ where: { id: customer.id }, data: { loyaltyPoints: customer.loyaltyPoints - sale.loyaltyPointsEarned + sale.loyaltyPointsRedeemed } });
    }
    const refund = await tx.saleRefund.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, saleId: sale.id, actorId: scope.actorId, reason: input.reason, stockDisposition: input.stockDisposition, totalCents: sale.totalCents, cashCents, payments: JSON.stringify(payments), cashSessionId: cash?.id, creditStatus: sale.electronicDocument?.status === "ISSUED" ? "PENDING" : "NOT_REQUIRED" } });
    await tx.auditLog.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, userId: scope.actorId, action: "REFUND", entityType: "Sale", entityId: sale.id, metadata: JSON.stringify({ refundId: refund.id, ...input, totalCents: sale.totalCents, cashCents, originalCashSessionId: sale.cashSessionId, refundCashSessionId: cash?.id }) } });
    return { ok: true, id: refund.id, message: `Devolución total registrada. ${input.stockDisposition === "RESTOCK" ? "Insumos recuperables repuestos." : "Los insumos preparados no vuelven al stock."}${refund.creditStatus === "PENDING" ? " Emite la nota de crédito desde esta venta." : ""}` };
  });
}
