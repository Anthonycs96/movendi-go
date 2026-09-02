import assert from "node:assert/strict";
import test from "node:test";
import { isAutomaticRoleKey, nextAutomaticRoleKey } from "@movendi/contracts";

test("genera la siguiente clave según el orden visible de los roles", () => {
  const roles = [{ key: "DISPATCH" }, { key: "DRIVER_MANAGER" }, { key: "FINANCE" }, { key: "MAINTENANCE" }];
  assert.equal(nextAutomaticRoleKey(roles), "ROL_5");
});

test("continúa después de la secuencia automática más alta y evita duplicados", () => {
  const roles = [{ key: "DISPATCH" }, { key: "ROL_5" }, { key: "ROL_9" }];
  assert.equal(nextAutomaticRoleKey(roles), "ROL_10");
  assert.equal(isAutomaticRoleKey("rol_10"), true);
  assert.equal(isAutomaticRoleKey("SUPERVISOR"), false);
});
