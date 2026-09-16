import assert from "node:assert/strict";
import { test } from "node:test";
import { ScanGate } from "./scan-gate";
test("continuous frames never count the same product twice, even after cooldown", () => {
  const gate = new ScanGate(1200, 600);
  assert.equal(gate.accept("7750000000010", 0), true);
  for (let now = 100; now < 5000; now += 100) assert.equal(gate.accept("7750000000010", now), false);
  assert.equal(gate.accept("7750000000010", 5600), true);
});
test("different products and deliberate repeats are accepted; cooldown is configurable", () => {
  const gate = new ScanGate(2000, 500);
  assert.equal(gate.accept("A", 0), true);
  assert.equal(gate.accept("B", 100), true);
  assert.equal(gate.accept("A", 1000), false);
  assert.equal(gate.accept("A", 2100), true);
  assert.equal(gate.accept(" ", 3000), false);
});
