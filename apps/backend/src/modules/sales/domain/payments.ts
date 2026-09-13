export class PaymentError extends Error {
  constructor(public readonly code: "INVALID_PAYMENT" | "PAYMENT_TOTAL_MISMATCH" | "INVALID_TENDER" | "INSUFFICIENT_TENDER", message: string) { super(message); this.name = "PaymentError"; }
}

export type PaymentAllocation = { method: string; amountCents: number; reference: string | null };

export function validatePaymentAllocation(totalCents: number, payments: PaymentAllocation[], receivedCents?: number | null) {
  const validAmount = (value: number) => Number.isSafeInteger(value) && value >= 0 && value <= 2_147_483_647;
  if (!validAmount(totalCents) || !payments.length || payments.some((payment) => !payment.method.trim() || !validAmount(payment.amountCents))) throw new PaymentError("INVALID_PAYMENT", "Los pagos deben tener un método y un importe válido en centavos.");
  const paidCents = payments.reduce((sum, payment) => sum + payment.amountCents, 0);
  if (paidCents !== totalCents) throw new PaymentError("PAYMENT_TOTAL_MISMATCH", `Los pagos deben sumar exactamente S/ ${(totalCents / 100).toFixed(2)}.`);
  const cashCents = payments.filter((payment) => payment.method === "CASH").reduce((sum, payment) => sum + payment.amountCents, 0);
  if (receivedCents != null && !validAmount(receivedCents)) throw new PaymentError("INVALID_TENDER", "El efectivo recibido debe ser un importe válido en centavos.");
  if (receivedCents != null && cashCents === 0) throw new PaymentError("INVALID_TENDER", "El efectivo recibido solo corresponde a pagos en efectivo.");
  if (receivedCents != null && receivedCents < cashCents) throw new PaymentError("INSUFFICIENT_TENDER", "El efectivo recibido es menor al efectivo a cobrar.");
  return { cashCents, changeCents: receivedCents == null ? null : receivedCents - cashCents, paymentMethod: payments.length > 1 ? "SPLIT" : payments[0].method };
}
