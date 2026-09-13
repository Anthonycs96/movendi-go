export type PrintState = { id: string; status: string; attempts: number; deliveryAttempt: number; stationId: string | null; leaseExpiresAt: Date | null };
export type PrintChange = { status: string; attempts?: number; deliveryAttempt?: number; stationId?: string | null; claimedAt?: Date | null; leaseExpiresAt?: Date | null; printedAt?: Date | null; lastError?: string | null };
export type PrintAction =
  | { kind: "claim"; stationId: string; leaseMs: number }
  | { kind: "complete"; stationId: string; attempt: number; status: "SENT" | "PRINTED" | "FAILED" | "UNKNOWN"; confirmed?: boolean; error?: string }
  | { kind: "confirm"; attempt: number; printed: boolean }
  | { kind: "retry"; attempt: number }
  | { kind: "expire" };

export class PrintConflict extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

export function expired(job: PrintState, now: Date) {
  return job.status === "PROCESSING" && (!job.leaseExpiresAt || job.leaseExpiresAt <= now);
}

export function transition(job: PrintState, action: PrintAction, now: Date): PrintChange {
  if (action.kind === "claim") {
    if (job.status !== "PENDING") throw new PrintConflict("PRINT_JOB_NOT_CLAIMED", "La impresión ya fue tomada o requiere revisión.");
    return { status: "PROCESSING", stationId: action.stationId, attempts: job.attempts + 1, claimedAt: now, leaseExpiresAt: new Date(now.getTime() + action.leaseMs) };
  }
  if (action.kind === "expire") {
    if (!expired(job, now)) throw new PrintConflict("PRINT_CHANGED", "La reserva sigue vigente.");
    return { status: "UNKNOWN", leaseExpiresAt: null, lastError: "La reserva venció sin confirmación. Verifica el papel antes de reimprimir." };
  }
  if (action.attempt !== job.attempts) throw new PrintConflict("PRINT_JOB_NOT_CLAIMED", "El intento de impresión cambió. Actualiza la cola.");
  if (action.kind === "complete") {
    if (job.status !== "PROCESSING" || expired(job, now) || job.stationId !== action.stationId) throw new PrintConflict("PRINT_JOB_NOT_CLAIMED", "La impresión pertenece a otro intento o su reserva venció.");
    if (action.status === "PRINTED" && !action.confirmed) throw new PrintConflict("PRINT_CONFIRMATION_REQUIRED", "Confirma que la impresión salió correctamente en papel.");
    return { status: action.status, leaseExpiresAt: null, printedAt: action.status === "PRINTED" ? now : null, lastError: ["FAILED", "UNKNOWN"].includes(action.status) ? action.error || "Verifica la impresora y el papel." : null };
  }
  if (action.kind === "confirm") {
    if (!["SENT", "UNKNOWN"].includes(job.status) && !expired(job, now)) throw new PrintConflict("PRINT_CHANGED", "La impresión ya fue confirmada o cambió de estado.");
    return { status: action.printed ? "PRINTED" : "FAILED", leaseExpiresAt: null, printedAt: action.printed ? now : null, lastError: action.printed ? null : "El operador confirmó que la impresión no salió completa." };
  }
  if (job.status !== "FAILED") throw new PrintConflict("PRINT_JOB_NOT_RETRYABLE", "Verifica el resultado antes de habilitar otra impresión.");
  return { status: "PENDING", deliveryAttempt: job.deliveryAttempt + 1, stationId: null, claimedAt: null, leaseExpiresAt: null, printedAt: null, lastError: null };
}
