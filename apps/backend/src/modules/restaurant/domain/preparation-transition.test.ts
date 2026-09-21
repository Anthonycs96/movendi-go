import test from "node:test";
import assert from "node:assert/strict";
import { aggregatePreparationStatus, selectPreparationLines } from "./preparation-transition";
const policy = { allowCancellation: true, statuses: [
  { key: "QUEUED", active: true, allowedNext: ["PREPARING", "READY"] },
  { key: "PREPARING", active: true, allowedNext: ["READY"] },
  { key: "READY", active: true, allowedNext: ["SERVED", "PREPARING"] },
] };
const line = (id: string, status: string, preparationAreaKey = "KITCHEN") => ({ id, name: id, status, preparationAreaKey });
test("un producto no altera sus compañeros ni salta preparación sin confirmación", () => {
  const items = [line("1", "PENDING"), line("2", "PENDING"), line("3", "PENDING")];
  assert.deepEqual(selectPreparationLines(items, { status: "PREPARING", itemIds: ["2"] }, policy).map(item => item.id), ["2"]);
  assert.throws(() => selectPreparationLines(items, { status: "READY", itemIds: ["1"] }, policy));
  assert.equal(selectPreparationLines(items, { status: "READY", confirmed: true, itemIds: ["1", "2", "3"] }, policy).length, 3);
  assert.throws(() => selectPreparationLines([line("1", "READY")], { status: "PREPARING" }, policy));
});
test("la entrega parcial selecciona solo listos y admite varias áreas", () => {
  const items = [line("1", "READY"), line("2", "PREPARING"), line("3", "READY", "BAR"), line("4", "SERVED")];
  assert.deepEqual(selectPreparationLines(items, { status: "SERVED" }, policy).map(item => item.id), ["1", "3"]);
  assert.throws(() => selectPreparationLines(items, { status: "SERVED", itemIds: ["2"] }, policy));
  assert.throws(() => selectPreparationLines(items, { status: "READY", confirmed: true, itemIds: ["1", "3"] }, policy));
});
test("dos listos y uno preparando permanecen parcialmente listos", () => {
  assert.equal(aggregatePreparationStatus(["READY", "READY", "PREPARING"]), "PARTIALLY_READY");
  assert.equal(aggregatePreparationStatus(["READY", "READY", "READY"]), "READY");
  assert.equal(aggregatePreparationStatus(["SERVED", "READY"]), "READY");
  assert.equal(aggregatePreparationStatus(["SERVED", "SERVED"]), "SERVED");
});
