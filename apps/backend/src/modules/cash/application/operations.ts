import { assertCashAmount, CashError, closingDifference, type ClosingPolicy } from "../domain/cash";
import type { CashMovementInput, CashRepository, OpenCashInput } from "./ports/cash-repository";

export async function openCashUseCase(repository: CashRepository, input: OpenCashInput) {
  assertCashAmount(input.openingCents);
  if (input.requestId) {
    const session = await repository.findSession(input.requestId);
    if (session) {
      if (session.openingCents !== input.openingCents || session.registerName !== input.registerName || (session.openingNote ?? "") !== (input.notes ?? "")) throw new CashError("IDEMPOTENCY_CONFLICT", "Esta solicitud corresponde a otra apertura.");
      return { session, replayed: true };
    }
  }
  if (await repository.findOpenSession(input.registerSlot)) throw new CashError("CASH_ALREADY_OPEN", "Esta caja ya tiene un turno abierto en la sede.");
  return { session: await repository.createSession(input), replayed: false };
}

export async function closeCashUseCase(repository: CashRepository, input: { id: string; countedCents: number; expectedCents?: number; notes?: string; policy?: ClosingPolicy }) {
  const cash = await repository.findSession(input.id);
  if (!cash || cash.status !== "OPEN") throw new CashError("NOT_FOUND", "La caja no existe en esta empresa o sucursal.");
  if (input.expectedCents !== undefined && input.expectedCents !== cash.expectedCents) throw new CashError("CASH_CHANGED", "La caja cambió. Actualiza el resumen antes de confirmar el cierre.");
  const differenceCents = closingDifference(cash.expectedCents, input.countedCents, input.notes, input.policy);
  if (!await repository.closeIfUnchanged(cash.id, cash.expectedCents, input.countedCents, input.notes)) throw new CashError("CASH_CHANGED", "La caja cambió mientras se cerraba. Actualiza los importes antes de cerrar.");
  return { id: cash.id, expectedCents: cash.expectedCents, countedCents: input.countedCents, differenceCents };
}

export async function applyCashEffectUseCase(repository: CashRepository, id: string, deltaCents: number) {
  assertCashAmount(Math.abs(deltaCents));
  if (!await repository.adjustOpenBalance(id, deltaCents)) throw new CashError("CASH_UNAVAILABLE", "La caja está cerrada o no tiene efectivo suficiente para el retiro.");
}

export async function registerCashMovementUseCase(repository: CashRepository, input: CashMovementInput) {
  if (input.requestId) {
    const movement = await repository.findMovement(input.requestId);
    if (movement) {
      if (movement.cashSessionId !== input.cashSessionId || movement.type !== input.type || movement.amountCents !== input.amountCents || movement.reason !== input.reason || (movement.notes ?? "") !== (input.notes ?? "")) throw new CashError("IDEMPOTENCY_CONFLICT", "Esta solicitud ya se utilizó para otro movimiento de caja.");
      return { movement, replayed: true };
    }
  }
  const cash = await repository.findSession(input.cashSessionId);
  if (!cash || cash.status !== "OPEN") throw new CashError("NOT_FOUND", "La caja abierta no existe en esta empresa o sucursal.");
  assertCashAmount(input.amountCents, true);
  await applyCashEffectUseCase(repository, cash.id, input.type === "IN" ? input.amountCents : -input.amountCents);
  return { movement: await repository.createMovement(input), replayed: false };
}
