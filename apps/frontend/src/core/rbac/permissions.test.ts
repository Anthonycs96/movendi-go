import assert from "node:assert/strict";
import test from "node:test";
import { can } from "./permissions";

test("un permiso explícito solo habilita su capacidad", () => {
  assert.equal(can(["customers:read"], "customers:read"), true);
  assert.equal(can(["customers:read"], "customers:write"), false);
});

test("el permiso comodín habilita las capacidades administrativas", () => {
  assert.equal(can(["*"], "settings:write"), true);
});

test("una ruta sin permiso requerido permanece pública para el componente", () => {
  assert.equal(can([], undefined), true);
});

test("un permiso de escritura granular también permite leer su mismo recurso", () => {
  assert.equal(can(["restaurant:menu:write"], "restaurant:menu:read"), true);
  assert.equal(can(["restaurant:menu:write"], "restaurant:reports:read"), false);
});

test("los roles anteriores conservan acceso al migrar a permisos granulares", () => {
  assert.equal(can(["restaurant:read"], "restaurant:menu:read"), true);
  assert.equal(can(["restaurant:read"], "restaurant:reports:read"), true);
  assert.equal(can(["restaurant:write"], "restaurant:promotions:write"), true);
  assert.equal(can(["settings:write"], "restaurant:printing:write"), true);
});
