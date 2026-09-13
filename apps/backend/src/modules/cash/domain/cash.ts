export class CashError extends Error {
  constructor(public readonly code: "INVALID_AMOUNT" | "CASH_ALREADY_OPEN" | "IDEMPOTENCY_CONFLICT" | "NOT_FOUND" | "CASH_CHANGED" | "CASH_UNAVAILABLE" | "CASH_DIFFERENCE_APPROVAL_REQUIRED" | "CASH_DIFFERENCE_REASON_REQUIRED", message: string) { super(message); this.name = "CashError"; }
}
export class CashConcurrencyError extends Error {}

export function assertCashAmount(value: number, positive = false) {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0) || value > 2_147_483_647) throw new CashError("INVALID_AMOUNT", positive ? "El movimiento debe ser de al menos S/ 0.01." : "El importe de caja debe ser válido y expresado en centavos.");
}

export type ClosingPolicy = { toleranceCents: number; canApprove: boolean };
export function closingDifference(expectedCents: number, countedCents: number, notes?: string, policy?: ClosingPolicy) {
  assertCashAmount(countedCents);
  const differenceCents = countedCents - expectedCents;
  if (policy && Math.abs(differenceCents) > policy.toleranceCents) {
    if (!policy.canApprove) throw new CashError("CASH_DIFFERENCE_APPROVAL_REQUIRED", `La diferencia supera la tolerancia de S/ ${(policy.toleranceCents / 100).toFixed(2)} y requiere un responsable con permiso de aprobación.`);
    if ((notes?.length ?? 0) < 5) throw new CashError("CASH_DIFFERENCE_REASON_REQUIRED", "Explica el motivo de la diferencia (al menos 5 caracteres).");
  }
  return differenceCents;
}
