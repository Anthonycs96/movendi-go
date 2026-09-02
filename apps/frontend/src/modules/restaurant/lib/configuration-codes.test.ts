import assert from "node:assert/strict";
import test from "node:test";
import { configurationCodeFromLabel, nextDraftConfigurationCode, uniqueConfigurationCodeFromLabel } from "./configuration-codes";

test("genera códigos internos estables desde nombres legibles", () => {
  assert.equal(configurationCodeFromLabel("  Atención en salón  "), "ATENCION_EN_SALON");
  assert.equal(configurationCodeFromLabel("Recojo / delivery express"), "RECOJO_DELIVERY_EXPRESS");
});

test("limita los códigos al formato y longitud aceptados por el backend", () => {
  const code = configurationCodeFromLabel("á".repeat(80));
  assert.match(code, /^[A-Z0-9_]+$/);
  assert.equal(code.length, 60);
});

test("crea un identificador temporal sin repetir los existentes", () => {
  assert.equal(nextDraftConfigurationCode(["NUEVO_1", "DINE_IN", "NUEVO_3"]), "NUEVO_2");
  assert.equal(nextDraftConfigurationCode(["EVENTO_1"], "Evento"), "EVENTO_2");
});

test("evita códigos duplicados al generarlos desde nombres repetidos", () => {
  assert.equal(uniqueConfigurationCodeFromLabel("Servicio local", ["SERVICIO_LOCAL"]), "SERVICIO_LOCAL_2");
  assert.equal(uniqueConfigurationCodeFromLabel("Servicio local", ["SERVICIO_LOCAL", "SERVICIO_LOCAL_2"]), "SERVICIO_LOCAL_3");
});
