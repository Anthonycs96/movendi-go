import assert from "node:assert/strict";
import test from "node:test";
import { productPerformance } from "./product-performance";

test("ranks contribution instead of revenue and excludes zero-cost products", () => {
  const result = productPerformance([
    { id: "a", name: "Más venta", category: "Platos", quantity: 10, salesCents: 10000, profitCents: 1000, zeroCostUnits: 0 },
    { id: "b", name: "Más aporte", category: "Platos", quantity: 4, salesCents: 8000, profitCents: 5000, zeroCostUnits: 0 },
    { id: "c", name: "Sin costo", category: "Platos", quantity: 20, salesCents: 20000, profitCents: 20000, zeroCostUnits: 20 },
  ]);
  assert.deepEqual(result.profitableProducts.map((product) => product.id), ["b", "a"]);
  assert.deepEqual(result.productsToReview.map((product) => product.id), ["a"]);
  assert.equal(result.productsToReview[0].marginPct, 10);
});

test("losses stay visible and empty periods do not fabricate opportunities", () => {
  const result = productPerformance([{ id: "loss", name: "Pérdida", category: "Platos", quantity: 1, salesCents: 500, profitCents: -200, zeroCostUnits: 0 }]);
  assert.equal(result.productsToReview[0].marginPct, -40);
  assert.equal(result.profitableProducts.length, 0);
  assert.deepEqual(productPerformance([]), { profitableProducts: [], productsToReview: [] });
});
