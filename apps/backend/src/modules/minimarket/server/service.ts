import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { TenantScope } from "@/core/auth/types";
import { AppError } from "@/core/auth/errors";
import { TransactionConflictError, withSerializableTransaction } from "@/core/database/transactions";
import { checkout, type CheckoutInput } from "../application/checkout";
import { PrismaCheckoutPort } from "../infrastructure/prisma/checkout-port";
import { RetailError } from "../domain/retail";

export const scoped = (scope: TenantScope) => ({ tenantId: scope.tenantId, branchId: scope.branchId });
export async function auditRetail(tx: Prisma.TransactionClient, scope: TenantScope, action: string, entityId: string, metadata?: unknown) {
  await tx.auditLog.create({ data: { ...scoped(scope), userId: scope.actorId, action: `MINIMARKET_${action}`, entityType: "RetailOperation", entityId, metadata: metadata === undefined ? undefined : JSON.stringify(metadata) } });
}
export async function businessDate(tx: Prisma.TransactionClient, scope: TenantScope) {
  const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: scope.tenantId }, select: { timezone: true } });
  return new Intl.DateTimeFormat("en-CA", { timeZone: tenant.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
/** The persisted receipt and audit commit with every business effect. */
export async function retailOperation<T>(scope: TenantScope, kind: string, input: { idempotencyKey: string; [key: string]: unknown }, operation: (tx: Prisma.TransactionClient, operationId: string) => Promise<T>): Promise<T> {
  const digest = (value: string) => createHash("sha256").update(value).digest("hex");
  const id = `retail_${digest(`${scope.tenantId}:${scope.branchId}:${input.idempotencyKey}`)}`;
  const payloadHash = digest(stable(input));
  try {
    return await withSerializableTransaction(async (tx) => {
      const branch = await tx.branch.findFirst({ where: { id: scope.branchId, tenantId: scope.tenantId, active: true, tenant: { type: "MINIMARKET" } } });
      if (!branch) throw new AppError("MODULE_ACCESS_DENIED", 403, "Minimarket no está habilitado en esta sucursal.");
      const previous = await tx.retailOperation.findFirst({ where: { id, ...scoped(scope) } });
      if (previous) {
        if (previous.kind !== kind || previous.payloadHash !== payloadHash) throw new AppError("IDEMPOTENCY_CONFLICT", 409, "Esta solicitud ya se utilizó con otros datos.");
        return JSON.parse(previous.result) as T;
      }
      // Claim the key before effects; a concurrent duplicate is retried and replays.
      try { await tx.retailOperation.create({ data: { id, ...scoped(scope), kind, payloadHash, result: "null" } }); }
      catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new TransactionConflictError("Solicitud concurrente."); throw error; }
      const result = await operation(tx, id);
      await tx.retailOperation.update({ where: { id }, data: { result: JSON.stringify(result) } });
      await auditRetail(tx, scope, kind, id, result);
      return result;
    });
  } catch (error) {
    if (error instanceof RetailError) throw new AppError(error.code, error.code === "PRODUCT_NOT_FOUND" ? 404 : 409, error.message);
    throw error;
  }
}
export function checkoutRetail(scope: TenantScope, input: CheckoutInput) {
  return retailOperation(scope, "SALE", input, async (tx) => checkout(new PrismaCheckoutPort(tx, scope, await businessDate(tx, scope)), input));
}
