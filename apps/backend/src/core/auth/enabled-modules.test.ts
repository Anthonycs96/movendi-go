import assert from "node:assert/strict";
import test from "node:test";
import { effectiveModules } from "./enabled-modules";
import { hasPermission } from "./permissions";

test("legacy public minimarkets open their dashboard while explicit restrictions and permissions remain", () => {
  assert.ok(effectiveModules("MINIMARKET", []).includes("dashboard"));
  assert.ok(effectiveModules("MINIMARKET", []).includes("pos"));
  assert.deepEqual(effectiveModules("MINIMARKET", ["pos"]), ["pos"]);
  assert.equal(hasPermission(["minimarket:sales:write"], "minimarket:reports:read"), false);
});

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

test("administrators can reach every management section despite an essential template", () => {
  for (const permissions of [["*"], ["settings:write"]]) {
    const modules = effectiveModules("RESTAURANT", ["dashboard", "floor", "settings"], permissions);
    for (const section of ["orders", "kitchen", "clients", "menu", "inventory", "promotions", "checkout", "reports"]) assert.ok(modules.includes(section));
  }
});

test("module availability does not grant action permissions or unlock other staff", () => {
  assert.deepEqual(effectiveModules("RESTAURANT", ["orders"], ["restaurant:orders:write"]), ["orders", "reports"]);
  assert.equal(hasPermission(["settings:write"], "restaurant:cash:write"), false);
  assert.deepEqual(effectiveModules("TRANSPORT", ["dashboard"], ["*"]), ["dashboard"]);
});
