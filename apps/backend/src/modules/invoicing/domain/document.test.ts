import assert from "node:assert/strict";
import { test } from "node:test";
import { documentPayload } from "./document";
import { commercialFiscalSource, type FiscalCommercialSnapshot } from "./commercial-source";

const snapshot = (): FiscalCommercialSnapshot => ({ version: 1, currency: "PEN", totalCents: 1180, fiscal: { taxRatePct: 18, taxIncluded: true, customerName: "Cliente histórico", customerDocument: "20123456789" }, lines: [{ sourceLineId: "line", name: "Producto", quantity: 1, totalCents: 1180, taxCategory: "GRAVADA" }] });
test("snapshot fiscal independiente del rubro conserva cliente, clasificación y moneda", () => {
  const source = commercialFiscalSource(snapshot(), "VENTA-1", new Date("2026-09-13T02:00:00Z"));
  const result = documentPayload(source, "FACTURA", "F001", 1, "BETA");
  assert.equal(result.cliente_denominacion, "Cliente histórico"); assert.equal(result.cliente_numero_de_documento, "20123456789");
  assert.equal(result.fecha_de_emision, "12-09-2026"); assert.equal(result.total_gravada, 10); assert.equal(result.total_igv, 1.8);
  assert.equal(result.enviar_automaticamente_a_la_sunat, false);
  assert.equal(documentPayload({ ...source, currency: "USD" }, "FACTURA", "F001", 1, "BETA").moneda, 2);
});
test("ventas sin contexto fiscal, identidad inválida y series incompatibles se rechazan", () => {
  assert.throws(() => commercialFiscalSource({ ...snapshot(), fiscal: undefined }, "1", new Date()), /snapshot fiscal/);
  const source = commercialFiscalSource(snapshot(), "1", new Date());
  assert.throws(() => documentPayload(source, "FACTURA", "B001", 1, "BETA"), /Serie/);
  assert.throws(() => documentPayload({ ...source, customerDocument: "" }, "FACTURA", "F001", 1, "BETA"), /RUC/);
  assert.throws(() => documentPayload({ ...source, customerDocument: "123" }, "BOLETA", "B001", 1, "BETA"), /DNI/);
  assert.throws(() => documentPayload({ ...source, currency: "EUR" }, "FACTURA", "F001", 1, "BETA"), /PEN o USD/);
  assert.throws(() => documentPayload(source, "FACTURA", "F001", 100000000, "BETA"), /Correlativo/);
  assert.throws(() => documentPayload({ ...source, lines: [{ ...source.lines[0], quantity: 0 }] }, "FACTURA", "F001", 1, "BETA"), /cantidad positiva/);
});
