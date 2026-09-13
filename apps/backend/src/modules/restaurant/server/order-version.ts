import type { Prisma } from "@prisma/client";
import type { TenantScope } from "@/core/auth/types";
import { AppError } from "@/core/auth/errors";

// Every order mutation claims the version it validated, including paid kitchen work.
export async function claimOrder(tx: Prisma.TransactionClient, scope: TenantScope, order: { id: string; version: number }, allowPaidPreparation = false) {
  const claimed = await tx.restaurantOrder.updateMany({
    where: { id: order.id, tenantId: scope.tenantId, branchId: scope.branchId, version: order.version, status: { notIn: allowPaidPreparation ? ["CANCELLED"] : ["COMPLETED", "CANCELLED"] } },
    data: { version: { increment: 1 } },
  });
  if (claimed.count !== 1) throw new AppError("ORDER_CHANGED", 409, "El pedido cambió durante la operación. Actualízalo antes de volver a intentar.");
}
