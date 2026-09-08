import { test } from "node:test";
import assert from "node:assert/strict";
import { fiscalAmounts, fiscalResponseStatus } from "./fiscal-payload";

test("comprobante mixto conserva total, bases e impuesto por clasificación", () => {
  const result = fiscalAmounts(23600, [
    { productId: "a", name: "Plato gravado", quantity: 1, totalCents: 11800, taxCategory: "GRAVADA" },
    { productId: "b", name: "Producto exonerado", quantity: 2, totalCents: 5900, taxCategory: "EXONERADA" },
    { productId: "c", name: "Producto inafecto", quantity: 1, totalCents: 5900, taxCategory: "INAFECTA" },
  ], 18);
  assert.equal(result.total_gravada, 100); assert.equal(result.total_igv, 18);
  assert.equal(result.total_exonerada, 59); assert.equal(result.total_inafecta, 59);
  assert.deepEqual(result.items.map((item) => item.tipo_de_igv), [1, 8, 9]);
  assert.equal(result.items.reduce((sum, item) => sum + Math.round(item.total * 100), 0), 23600);
});

test("descuentos conservan cada céntimo y tasa cero exige clasificación explícita", () => {
  const items = ["a", "b", "c"].map((id) => ({ productId: id, name: id, quantity: 1, totalCents: 100, taxCategory: "EXONERADA" }));
  assert.deepEqual(fiscalAmounts(100, items, 0).items.map((item) => Math.round(item.total * 100)), [34, 33, 33]);
  assert.throws(() => fiscalAmounts(100, [{ ...items[0], taxCategory: "GRAVADA" }], 0));
});

test("respuesta HTTP o PDF no equivalen a aceptación fiscal", () => {
  assert.equal(fiscalResponseStatus({ enlace_del_pdf: "https://example.com/a.pdf" }), "SUBMITTED");
  assert.equal(fiscalResponseStatus({ aceptada_por_sunat: false }), "SUBMITTED");
  assert.equal(fiscalResponseStatus({ aceptada_por_sunat: true }), "ISSUED");
  assert.equal(fiscalResponseStatus({ errors: "Rechazado" }), "FAILED");
});
