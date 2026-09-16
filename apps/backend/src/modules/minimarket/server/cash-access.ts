import type { Prisma } from "@prisma/client";
import type { TenantScope } from "@/core/auth/types";
import { AppError } from "@/core/auth/errors";
import { hasPermission } from "@/core/auth/permissions";

export const managesCash = (scope: TenantScope) => hasPermission(scope.permissions, "minimarket:cash:manage");
export async function assertRetailCash(tx: Prisma.TransactionClient, scope: TenantScope, id: string) {
  const cash = await tx.cashSession.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId } });
  if (!cash) throw new AppError("NOT_FOUND", 404, "La caja no existe en esta sucursal.");
  if (cash.status !== "OPEN") throw new AppError("CASH_UNAVAILABLE", 409, "Selecciona una caja abierta de esta sucursal.");
  if (cash.openedById !== scope.actorId && !managesCash(scope)) throw new AppError("FORBIDDEN", 403, "Esta caja pertenece a otro cajero. Abre tu propia caja.");
  return cash;
}
