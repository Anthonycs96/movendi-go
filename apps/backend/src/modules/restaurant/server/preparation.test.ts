import test from "node:test";
import assert from "node:assert/strict";
import { aggregatePreparationStatus, assertDiscountLimit } from "./preparation";

test("el estado agregado conserva trabajo pendiente de otra estación o de una adición retenida", () => {
  assert.equal(aggregatePreparationStatus(["READY", "PENDING"]), "PREPARING");
  assert.equal(aggregatePreparationStatus(["SERVED", "HELD"]), "PREPARING");
  assert.equal(aggregatePreparationStatus(["READY", "SERVED", "CANCELLED"]), "READY");
  assert.equal(aggregatePreparationStatus(["HELD", "CANCELLED"]), "HELD");
  assert.equal(aggregatePreparationStatus(["SERVED", "SERVED"]), "SERVED");
  assert.equal(aggregatePreparationStatus(["CANCELLED"]), "CANCELLED");
});

test("el descuento se compara en centavos y el límite cero prohíbe descuentos", () => {
  assert.doesNotThrow(() => assertDiscountLimit(999, 100, 10));
  assert.throws(() => assertDiscountLimit(999, 101, 10), /máximo autorizado/);
  assert.throws(() => assertDiscountLimit(1000, 1, 0), /máximo autorizado/);
});
