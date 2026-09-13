import assert from "node:assert/strict";
import { test } from "node:test";
import { SalesError, validateCommercialSnapshot, type CommercialSnapshot } from "./sale";
import { PaymentError, validatePaymentAllocation } from "./payments";

const detail = (): CommercialSnapshot => ({ version: 1, currency: "PEN", subtotalCents: 1000, discountCents: 100, chargesCents: 300, totalCents: 1200, lines: [{ sourceLineId: "line-1", name: "Producto", quantity: 2, unitPriceCents: 500, totalCents: 1000 }] });

test("detalle comercial acepta descuentos y cargos sin recalcular el precio autorizado", () => {
  assert.doesNotThrow(() => validateCommercialSnapshot(detail()));
  const weighted = detail();
  Object.assign(weighted, { subtotalCents: 375, discountCents: 0, chargesCents: 0, totalCents: 375 });
  weighted.lines = [{ sourceLineId: "weight", name: "Por peso", quantity: 0.75, unitPriceCents: 500, totalCents: 375 }];
  assert.doesNotThrow(() => validateCommercialSnapshot(weighted));
});

test("detalle rechaza totales, líneas repetidas, cantidades y dinero inválidos", () => {
  for (const mutate of [
    (value: CommercialSnapshot) => { value.totalCents++; },
    (value: CommercialSnapshot) => { value.lines.push({ ...value.lines[0] }); },
    (value: CommercialSnapshot) => { value.lines[0].quantity = NaN; },
    (value: CommercialSnapshot) => { value.lines[0].unitPriceCents = 1.5; },
    (value: CommercialSnapshot) => { value.discountCents = 1001; },
    (value: CommercialSnapshot) => { value.totalCents = 2_147_483_648; },
    (value: CommercialSnapshot) => { value.lines = []; },
  ]) {
    const value = detail(); mutate(value);
    assert.throws(() => validateCommercialSnapshot(value), (error) => error instanceof SalesError && error.code === "INVALID_SALE");
  }
});

test("pagos divididos calculan efectivo y vuelto sin sumar tarjeta a caja", () => {
  assert.deepEqual(validatePaymentAllocation(1000, [{ method: "CASH", amountCents: 400, reference: null }, { method: "CARD", amountCents: 600, reference: "recibo" }], 500), { cashCents: 400, changeCents: 100, paymentMethod: "SPLIT" });
  assert.deepEqual(validatePaymentAllocation(1000, [{ method: "CARD", amountCents: 1000, reference: null }]), { cashCents: 0, changeCents: null, paymentMethod: "CARD" });
  assert.deepEqual(validatePaymentAllocation(0, [{ method: "CASH", amountCents: 0, reference: null }]), { cashCents: 0, changeCents: null, paymentMethod: "CASH" });
});

test("pagos conservan errores por suma distinta y efectivo recibido incompatible", () => {
  const cash = [{ method: "CASH", amountCents: 1000, reference: null }];
  for (const [call, code] of [
    [() => validatePaymentAllocation(1001, cash), "PAYMENT_TOTAL_MISMATCH"],
    [() => validatePaymentAllocation(1000, cash, 999), "INSUFFICIENT_TENDER"],
    [() => validatePaymentAllocation(1000, [{ ...cash[0], method: "CARD" }], 1000), "INVALID_TENDER"],
    [() => validatePaymentAllocation(1000, [{ ...cash[0], amountCents: Infinity }]), "INVALID_PAYMENT"],
    [() => validatePaymentAllocation(1000, []), "INVALID_PAYMENT"],
  ] as const) assert.throws(call, (error) => error instanceof PaymentError && error.code === code);
});
