import { expired, PrintConflict, transition, type PrintAction, type PrintChange, type PrintState } from "../domain/delivery";

export interface PrintRepository {
  find(id: string): Promise<PrintState | null>;
  save(before: PrintState, change: PrintChange, action: string): Promise<boolean>;
}

export async function changeDelivery(repository: PrintRepository, id: string, action: PrintAction, now: Date) {
  const job = await repository.find(id);
  if (!job) throw new PrintConflict("NOT_FOUND", "La impresión no pertenece a esta sede o dispositivo.");
  // Expiry is evidence of uncertainty, never permission to print again.
  const effective = action.kind === "claim" && expired(job, now) ? { kind: "expire" as const } : action;
  if (effective.kind === "claim" && job.status !== "PENDING") return { claimed: false, attempt: job.attempts };
  const change = transition(job, effective, now);
  if (!await repository.save(job, change, `PRINT_${effective.kind.toUpperCase()}`)) throw new PrintConflict("PRINT_CHANGED", "Otro proceso modificó la impresión.");
  return { claimed: effective.kind === "claim", attempt: change.attempts ?? job.attempts };
}
