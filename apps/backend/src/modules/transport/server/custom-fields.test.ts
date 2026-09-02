import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCustomFieldValue, typedCustomFieldValue } from "./custom-fields";

test("normaliza identificadores externos de forma estable", () => {
  assert.equal(normalizeCustomFieldValue("  shíp-001  "), "SHÍP-001");
});

test("crea la clave única sólo cuando la definición lo exige", () => {
  const unique = typedCustomFieldValue({ dataType: "CODE", uniqueValue: true }, " fol-77 ");
  const reusable = typedCustomFieldValue({ dataType: "TEXT", uniqueValue: false }, " fol-77 ");
  assert.equal(unique.textValue, "fol-77");
  assert.equal(unique.uniqueKey, "FOL-77");
  assert.equal(reusable.uniqueKey, null);
});

test("guarda fechas, números y booleanos en columnas tipadas", () => {
  assert.equal(typedCustomFieldValue({ dataType: "NUMBER", uniqueValue: false }, "15.5").numberValue, 15.5);
  assert.equal(typedCustomFieldValue({ dataType: "BOOLEAN", uniqueValue: false }, "sí").booleanValue, true);
  assert.equal(typedCustomFieldValue({ dataType: "DATE", uniqueValue: false }, "2026-09-01").dateValue?.toISOString(), "2026-09-01T00:00:00.000Z");
});

test("rechaza valores incompatibles con el tipo", () => {
  assert.throws(() => typedCustomFieldValue({ dataType: "NUMBER", uniqueValue: false }, "no-numero"), /numérico/);
  assert.throws(() => typedCustomFieldValue({ dataType: "BOOLEAN", uniqueValue: false }, "quizá"), /lógico/);
});
