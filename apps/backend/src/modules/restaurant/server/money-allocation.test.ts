import assert from "node:assert/strict";
import test from "node:test";
import { allocateCents, allocateInvoiceAmounts } from "./money-allocation";

test("discounted fiscal lines preserve the invoice cent and deterministic ties", () => {
  assert.deepEqual(allocateCents(100, [100, 100, 100]), [34, 33, 33]);
  assert.deepEqual(allocateCents(1, [1, 1, 1]), [1, 0, 0]);
});

test("taxable and tax amounts reconcile for zero, fees and large totals", () => {
  for (const total of [0, 1, 101, 10001, 2500000000]) {
    const { lineTotals: lines, taxableCents: taxable, lineTaxables: bases } = allocateInvoiceAmounts(total, [3, 7, 11, 1000000000], 18);
    assert.equal(lines.reduce((sum, value) => sum + value, 0), total);
    assert.equal(bases.reduce((sum, value) => sum + value, 0), taxable);
    assert.equal(lines.reduce((sum, value, index) => sum + value - bases[index], 0), total - taxable);
    assert.ok(lines.every((value, index) => value >= bases[index]));
  }
  assert.deepEqual(allocateCents(5, [0, 0]), [3, 2]);
  const zeroRate = allocateInvoiceAmounts(100, [100, 100, 100], 0);
  assert.equal(zeroRate.taxableCents, 100);
  assert.equal(zeroRate.taxCents, 0);
  assert.deepEqual(zeroRate.lineTotals, zeroRate.lineTaxables);
});

test("rejects non-integer, negative and empty allocations", () => {
  for (const total of [-1, 0.1, NaN, Infinity]) assert.throws(() => allocateCents(total, [1]), RangeError);
  assert.throws(() => allocateCents(10, []), RangeError);
  assert.throws(() => allocateCents(10, [0.2]), RangeError);
});
