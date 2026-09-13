import assert from "node:assert/strict";
import test from "node:test";
import { fiscalAmounts } from "@/modules/invoicing/domain/fiscal-payload";
import { allocateCents } from "@/modules/invoicing/domain/allocate-cents";

test("discounted fiscal lines preserve the invoice cent and deterministic ties", () => {
  assert.deepEqual(allocateCents(100, [100, 100, 100]), [34, 33, 33]);
  assert.deepEqual(allocateCents(1, [1, 1, 1]), [1, 0, 0]);
});

test("taxable and tax amounts reconcile for zero, fees and large totals", () => {
  for (const total of [0, 1, 101, 10001, 2500000000]) {
    const result = fiscalAmounts(total, [3, 7, 11, 1000000000].map((weight, index) => ({ productId: String(index), name: "Item", quantity: 1, totalCents: weight, taxCategory: "GRAVADA" })), 18);
    const lines = result.items.map((item) => Math.round(item.total * 100)), bases = result.items.map((item) => Math.round(item.subtotal * 100)), taxable = Math.round(result.total_gravada * 100);
    assert.equal(lines.reduce((sum, value) => sum + value, 0), total);
    assert.equal(bases.reduce((sum, value) => sum + value, 0), taxable);
    assert.equal(lines.reduce((sum, value, index) => sum + value - bases[index], 0), total - taxable);
    assert.ok(lines.every((value, index) => value >= bases[index]));
  }
  assert.deepEqual(allocateCents(5, [0, 0]), [3, 2]);
  const zeroRate = fiscalAmounts(100, [0, 1, 2].map((i) => ({ productId: String(i), name: "Item", quantity: 1, totalCents: 100, taxCategory: "EXONERADA" })), 0);
  assert.equal(zeroRate.total_exonerada, 1);
  assert.equal(zeroRate.total_igv, 0);
  assert.deepEqual(zeroRate.items.map((item) => item.total), zeroRate.items.map((item) => item.subtotal));
});

test("rejects non-integer, negative and empty allocations", () => {
  for (const total of [-1, 0.1, NaN, Infinity]) assert.throws(() => allocateCents(total, [1]), RangeError);
  assert.throws(() => allocateCents(10, []), RangeError);
  assert.throws(() => allocateCents(10, [0.2]), RangeError);
});
