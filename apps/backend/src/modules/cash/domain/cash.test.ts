import assert from "node:assert/strict";
import { test } from "node:test";
import { assertCashAmount, closingDifference, CashError } from "./cash";

test("cierre permite tolerancia exacta y exige permiso y motivo al superarla", () => {
  assert.equal(closingDifference(10000, 9900, undefined, { toleranceCents: 100, canApprove: false }), -100);
  assert.throws(() => closingDifference(10000, 9899, "Diferencia explicada", { toleranceCents: 100, canApprove: false }), (error) => error instanceof CashError && error.code === "CASH_DIFFERENCE_APPROVAL_REQUIRED");
  assert.throws(() => closingDifference(10000, 9899, undefined, { toleranceCents: 100, canApprove: true }), (error) => error instanceof CashError && error.code === "CASH_DIFFERENCE_REASON_REQUIRED");
  assert.equal(closingDifference(10000, 9899, "Diferencia explicada", { toleranceCents: 100, canApprove: true }), -101);
  assert.equal(closingDifference(10000, 0), -10000); // No policy imposed on a legacy consumer.
});

test("caja admite apertura cero y rechaza centavos fraccionarios, infinitos y fuera de rango", () => {
  assert.doesNotThrow(() => assertCashAmount(0));
  for (const value of [-1, 1.5, NaN, Infinity, 2_147_483_648]) assert.throws(() => assertCashAmount(value), CashError);
  assert.throws(() => assertCashAmount(0, true), CashError);
});
