import assert from "node:assert/strict";
import test from "node:test";
import { businessSlugFromName } from "@movendi/contracts";

test("business URLs normalize capitals, accents, whitespace and punctuation", () => {
  assert.equal(businessSlugFromName("  Minimarket Soráyda & Hijos  "), "minimarket-sorayda-hijos");
  assert.equal(businessSlugFromName("Minmarket-sorayda"), "minmarket-sorayda");
  assert.equal(businessSlugFromName(" -- " ), "");
  assert.ok(businessSlugFromName("Nombre largo ".repeat(20)).length <= 50);
  assert.ok(!businessSlugFromName("Nombre largo ".repeat(20)).endsWith("-"));
});
