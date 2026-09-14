import assert from "node:assert/strict";
import test from "node:test";
import { effectiveModules } from "./enabled-modules";
import { hasPermission } from "./permissions";

test("existing essential restaurants gain reports without enabling other optional modules", () => {
  const saved = ["dashboard", "floor", "orders", "settings"];
  assert.deepEqual(effectiveModules("RESTAURANT", saved), [...saved, "reports"]);
  assert.equal(saved.includes("reports"), false);
  assert.equal(hasPermission(["restaurant:orders:write"], "restaurant:reports:read"), false);
  assert.equal(hasPermission(["restaurant:read"], "restaurant:reports:read"), true);
});

test("preserves all-enabled convention, other businesses and existing report access", () => {
  assert.deepEqual(effectiveModules("RESTAURANT", []), []);
  assert.deepEqual(effectiveModules("TRANSPORT", ["dashboard"]), ["dashboard"]);
  assert.deepEqual(effectiveModules("RESTAURANT", ["reports"]), ["reports"]);
});
