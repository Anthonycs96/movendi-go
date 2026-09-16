import "server-only";
import type { Prisma } from "@prisma/client";
import type { TenantScope } from "@/core/auth/types";
import { AppError } from "@/core/auth/errors";
import { TransactionConflictError } from "@/core/database/transactions";

/** Shared inventory purchasing ledger; the caller owns its transaction and cash policy. */
export async function recordSupplierPayment(tx: Prisma.TransactionClient, scope: TenantScope, input: { payableId: string; amountCents: number; method: string; reference?: string }) {
  const payable = await tx.inventoryPayable.findFirst({ where: { id: input.payableId, tenantId: scope.tenantId, branchId: scope.branchId } });
  if (!payable) throw new AppError("NOT_FOUND", 404, "Cuenta por pagar no encontrada.");
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0 || input.amountCents > payable.totalCents - payable.paidCents) throw new AppError("PAYABLE_LIMIT", 409, "El pago debe ser positivo y no superar el saldo pendiente.");
  const updated = await tx.inventoryPayable.updateMany({ where: { id: payable.id, paidCents: payable.paidCents }, data: { paidCents: { increment: input.amountCents } } });
  if (updated.count !== 1) throw new TransactionConflictError("El saldo del proveedor cambió. Reintenta el pago.");
  const payment = await tx.inventorySupplierPayment.create({ data: { payableId: payable.id, actorId: scope.actorId, amountCents: input.amountCents, method: input.method, reference: input.reference } });
  return { id: payment.id, balanceCents: payable.totalCents - payable.paidCents - input.amountCents, currency: payable.currency };
}
