import "server-only";
import type { Prisma } from "@prisma/client";
import { AppError } from "@/core/auth/errors";
import { recordSaleUseCase, SalesError, PaymentError, validatePaymentAllocation, type PaymentAllocation, type RecordSaleInput, type SaleScope } from "../public";
import { PrismaSaleRepository } from "../infrastructure/prisma/prisma-sale-repository";

/** Participates in the caller's transaction; it never commits independently. */
export async function recordSale(transaction: Prisma.TransactionClient, scope: SaleScope, input: RecordSaleInput) {
  try { return await recordSaleUseCase(new PrismaSaleRepository(transaction, scope), input); }
  catch (error) {
    if (error instanceof SalesError) throw new AppError(error.code, error.code === "INVALID_SALE" ? 400 : 409, error.message);
    if (error instanceof PaymentError) throw new AppError(error.code, 400, error.message);
    throw error;
  }
}

export function validateSalePayments(totalCents: number, payments: PaymentAllocation[], receivedCents?: number) {
  try { return validatePaymentAllocation(totalCents, payments, receivedCents); }
  catch (error) {
    if (error instanceof PaymentError) throw new AppError(error.code, 400, error.message);
    throw error;
  }
}
