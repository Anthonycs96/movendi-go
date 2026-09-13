import assert from "node:assert/strict";
import { test } from "node:test";
import { allocateLots, lineAmounts, refundAmount, quantity } from "./retail";
test("cantidades normalizadas; unidad indivisible y precio por peso", () => {
  assert.deepEqual(lineAmounts({ factor: 6, weighted: false, priceCents: 1500 }, 2), { baseQuantity: 12, totalCents: 3000 });
  assert.deepEqual(lineAmounts({ factor: 1, weighted: true, priceCents: 501 }, .125), { baseQuantity: .125, totalCents: 63 });
  for (const q of [0, -1, Infinity, NaN, .0000001]) assert.throws(() => quantity(q));
  assert.throws(() => lineAmounts({ factor: 1, weighted: false, priceCents: 100 }, .5));
});
test("FEFO ordena fecha e identidad y excluye vencidos", () => {
  assert.deepEqual(allocateLots([{ id: "late", stock: 5, expiresOn: "2030-02-01" }, { id: "old", stock: 10, expiresOn: "2020-01-01" }, { id: "first", stock: 2, expiresOn: "2030-01-01" }], 3, "2030-01-01"), [{ lotId: "first", quantity: 2 }, { lotId: "late", quantity: 1 }]);
});
test("las fracciones devueltas no crean centavos por redondeo", () => {
  let line = { quantity: 1, returnedQuantity: 0, totalCents: 101, refundedCents: 0 };
  for (let i = 0; i < 10; i++) { const result = refundAmount(line, .1); line = { ...line, returnedQuantity: result.returnedQuantity, refundedCents: line.refundedCents + result.amountCents }; }
  assert.equal(line.refundedCents, 101); assert.throws(() => refundAmount(line, .1));
});
