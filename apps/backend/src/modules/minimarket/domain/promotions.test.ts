import { test } from "node:test";
import assert from "node:assert/strict";
import { promotionalPrice } from "./promotions";
const line = { id: "pack", productId: "rice", quantity: 3, priceCents: 501, weighted: false };
const rule = { id: "a", name: "Oferta", kind: "3X2", value: 0, priority: 1, minQuantity: 3, retailProductId: "rice", retailPresentationId: "pack" };
test("promociones: cantidades, redondeo, presentación, prioridades y sin acumulación", () => {
  assert.equal(promotionalPrice(line, [rule]).totalCents, 1002);
  assert.equal(promotionalPrice({ ...line, quantity: 2 }, [rule]).discountCents, 0);
  assert.equal(promotionalPrice({ ...line, id: "unit" }, [rule]).discountCents, 0);
  assert.equal(promotionalPrice({ ...line, weighted: true }, [rule]).discountCents, 0);
  assert.equal(promotionalPrice(line, [{ ...rule, kind: "PERCENT", value: 10 }]).discountCents, 150);
  assert.equal(promotionalPrice(line, [{ ...rule, kind: "SPECIAL_PRICE", value: 450 }]).totalCents, 1350);
  assert.equal(promotionalPrice(line, [{ ...rule, kind: "FIXED", value: 99999 }]).totalCents, 0);
  assert.equal(promotionalPrice(line, [rule, { ...rule, id: "b", kind: "FIXED", value: 100, priority: 2 }]).discountCents, 100);
});
