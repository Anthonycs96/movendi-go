import "server-only";
import type { Prisma } from "@prisma/client";
import type { TenantScope } from "@/core/auth/types";
import { AppError } from "@/core/auth/errors";
import { recordSale } from "@/modules/sales/server/service";
import type { RecordSaleInput } from "@/modules/sales/public";

export async function recordRestaurantSale(tx: Prisma.TransactionClient, scope: TenantScope, input: Omit<RecordSaleInput, "origin" | "detail"> & { orderId: string }) {
  const { orderId, ...financial } = input;
  const order = await tx.restaurantOrder.findFirst({ where: { id: orderId, tenantId: scope.tenantId, branchId: scope.branchId }, include: { items: { where: { status: { not: "CANCELLED" } } } } });
  if (!order) throw new AppError("NOT_FOUND", 404, "El pedido no existe en esta empresa o sucursal.");
  const customer = financial.customerId ? await tx.customer.findFirst({ where: { id: financial.customerId, tenantId: scope.tenantId }, select: { name: true, dni: true } }) : null;
  return recordSale(tx, scope, {
    ...financial, origin: { kind: "ORDER", id: order.id },
    detail: {
      ...(order.taxRatePct == null ? {} : { fiscal: { taxRatePct: order.taxRatePct, taxIncluded: order.taxIncluded ?? false, customerName: customer?.name ?? "CLIENTE VARIOS", customerDocument: customer?.dni?.replace(/\D/g, "") ?? "" } }),
      subtotalCents: order.subtotalCents,
      // Preserve the server's already calculated taxes, service and delivery;
      // changing current configuration must not reprice the order at checkout.
      chargesCents: order.totalCents - order.subtotalCents + order.discountCents,
      lines: order.items.map((line) => ({ sourceLineId: line.id, name: line.name, quantity: line.quantity, unitPriceCents: line.unitPriceCents, unitCostCents: line.unitCostCents, totalCents: line.totalCents, taxCategory: line.taxCategory })),
    },
  });
}
