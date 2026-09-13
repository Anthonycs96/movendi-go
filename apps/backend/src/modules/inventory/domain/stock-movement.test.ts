import assert from "node:assert/strict";
import test from "node:test";
import { calculateStockMovement, InventoryError, normalizeMovementQuantity, type StockState } from "./stock-movement";

const stock: StockState = Object.freeze({ name: "Arroz", unit: "KG", stock: 10, unitCostCents: 100, trackStock: true });

test("recepción pondera el costo y salida conserva el costo del artículo", () => {
  assert.deepEqual(calculateStockMovement(stock, { direction: "IN", quantity: 2, unitCostCents: 250 }), {
    quantity: 2, stockBefore: 10, stockAfter: 12, unitCostCents: 250, totalCostCents: 500, nextUnitCostCents: 125,
  });
  const outgoing = calculateStockMovement(stock, { direction: "OUT", quantity: 0.5, unitCostCents: 200 });
  assert.equal(outgoing.stockAfter, 9.5);
  assert.equal(outgoing.totalCostCents, 100);
  assert.equal(outgoing.nextUnitCostCents, 100);
  assert.equal(stock.stock, 10);
});

test("redondea cantidades a seis decimales sin residuos de coma flotante", () => {
  const result = calculateStockMovement({ ...stock, stock: 0.3 }, { direction: "OUT", quantity: 0.20000004 });
  assert.equal(result.quantity, 0.2);
  assert.equal(result.stockAfter, 0.1);
  assert.equal(normalizeMovementQuantity(0.0000005), 0.000001);
  for (const value of [0, -1, NaN, Infinity, -Infinity, 0.0000001]) {
    assert.throws(() => normalizeMovementQuantity(value), (error) => error instanceof InventoryError && error.code === "INVALID_QUANTITY");
  }
});

test("agotamiento exacto, stock negativo explícito y recuperación desde saldo negativo", () => {
  assert.equal(calculateStockMovement(stock, { direction: "OUT", quantity: 10 }).stockAfter, 0);
  assert.throws(() => calculateStockMovement(stock, { direction: "OUT", quantity: 11 }), (error) => error instanceof InventoryError && error.code === "INSUFFICIENT_STOCK");
  assert.equal(calculateStockMovement(stock, { direction: "OUT", quantity: 11, preventNegativeStock: false }).stockAfter, -1);
  // Preserve the existing weighted-cost policy, including negative balances.
  const result = calculateStockMovement({ ...stock, stock: -1 }, { direction: "IN", quantity: 2, unitCostCents: 150 });
  assert.equal(result.stockAfter, 1);
  assert.equal(result.nextUnitCostCents, 300);
});

test("un costo cero explícito participa en la ponderación; costo omitido conserva el anterior", () => {
  assert.equal(calculateStockMovement(stock, { direction: "IN", quantity: 10, unitCostCents: 0 }).nextUnitCostCents, 50);
  assert.equal(calculateStockMovement(stock, { direction: "IN", quantity: 10 }).nextUnitCostCents, 100);
  assert.throws(() => calculateStockMovement({ ...stock, trackStock: false }, { direction: "IN", quantity: 1 }), (error) => error instanceof InventoryError && error.code === "STOCK_NOT_TRACKED");
});
