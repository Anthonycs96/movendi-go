import assert from "node:assert/strict";
import test from "node:test";
import { hasPermission } from "./permissions";

test("page access matches the sidebar for legacy report and printing permissions", () => {
  assert.equal(hasPermission(["restaurant:read"], "restaurant:reports:read"), true);
  assert.equal(hasPermission(["settings:write"], "restaurant:printing:read"), true);
  assert.equal(hasPermission(["restaurant:printing:write"], "restaurant:printing:read"), true);
  assert.equal(hasPermission(["restaurant:orders:write"], "restaurant:reports:read"), false);
});
