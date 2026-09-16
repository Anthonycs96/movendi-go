/** Provider boundary for future acquiring adapters. A typed reference is not proof of settlement. */
export type PaymentIntent = { tenantId: string; branchId: string; idempotencyKey: string; amountCents: number; currency: string; method: string; reference: string | null };
export type PaymentConfirmation =
  | { state: "MANUAL"; reference: string | null }
  | { state: "PENDING" | "UNKNOWN" | "REJECTED"; providerPaymentId: string; message: string }
  | { state: "CONFIRMED"; providerPaymentId: string; tenantId: string; amountCents: number; currency: string; confirmedAt: string };
export interface PaymentConfirmationPort {
  /** Query/confirm outside the stock transaction; adapter must reuse the original provider identity. */
  confirm(intent: PaymentIntent): Promise<PaymentConfirmation>;
  reconcile(intent: PaymentIntent, providerPaymentId: string): Promise<PaymentConfirmation>;
}
