import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { AppError } from "@/core/auth/errors";
import { TransactionConflictError } from "@/core/database/transactions";
import { CashError, CashConcurrencyError, openCashUseCase, closeCashUseCase, registerCashMovementUseCase, applyCashEffectUseCase, type CashScope, type OpenCashInput, type CashMovementInput } from "../public";
import { PrismaCashRepository } from "../infrastructure/prisma/prisma-cash-repository";

async function translate<T>(operation: () => Promise<T>) {
  try { return await operation(); }
  catch (error) {
    if (error instanceof CashConcurrencyError) throw new TransactionConflictError(error.message);
    if (error instanceof CashError) throw new AppError(error.code, error.code === "NOT_FOUND" ? 404 : ["INVALID_AMOUNT", "CASH_DIFFERENCE_REASON_REQUIRED"].includes(error.code) ? 400 : error.code === "CASH_DIFFERENCE_APPROVAL_REQUIRED" ? 403 : 409, error.message);
    throw error;
  }
}

export function openCashSession(tx: Prisma.TransactionClient, scope: CashScope, input: Omit<OpenCashInput, "requestId"> & { idempotencyKey?: string }) {
  const { idempotencyKey, ...data } = input;
  const requestId = idempotencyKey ? `cash_${createHash("sha256").update(`${scope.tenantId}:${scope.branchId}:${idempotencyKey}`).digest("hex")}` : undefined;
  return translate(() => openCashUseCase(new PrismaCashRepository(tx, scope), { ...data, requestId }));
}
export function closeCashSession(tx: Prisma.TransactionClient, scope: CashScope, input: Parameters<typeof closeCashUseCase>[1]) {
  return translate(() => closeCashUseCase(new PrismaCashRepository(tx, scope), input));
}
export function registerCashMovement(tx: Prisma.TransactionClient, scope: CashScope, input: Omit<CashMovementInput, "requestId"> & { idempotencyKey?: string }) {
  const { idempotencyKey, ...data } = input;
  const requestId = idempotencyKey ? `cm_${createHash("sha256").update(`${scope.tenantId}:${scope.branchId}:${input.cashSessionId}:${idempotencyKey}`).digest("hex")}` : undefined;
  return translate(() => registerCashMovementUseCase(new PrismaCashRepository(tx, scope), { ...data, requestId }));
}
export async function applyCashEffect(tx: Prisma.TransactionClient, scope: CashScope, id: string, deltaCents: number, failure?: { code: string; message: string }) {
  try { return await translate(() => applyCashEffectUseCase(new PrismaCashRepository(tx, scope), id, deltaCents)); }
  catch (error) {
    if (failure && error instanceof AppError && error.code === "CASH_UNAVAILABLE") throw new AppError(failure.code, 409, failure.message);
    throw error;
  }
}
