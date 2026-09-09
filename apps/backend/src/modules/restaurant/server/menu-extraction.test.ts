import test from "node:test";
import assert from "node:assert/strict";
import { extractMenuPage } from "./menu-extraction";
import { loyaltyRedemptionLimit } from "@movendi/contracts";
import { isUnsafeCrossOrigin } from "@/core/auth/request-origin";

test("menu extraction preserves missing prices and rejects negative prices", async () => {
  const products = [{ name: "Tomahawk", category: "Parrilla", description: "Próximamente", price: null, kind: "PRODUCT", warning: "Sin precio visible" }];
  const transport: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.document.type, "document_url"); assert.ok(body.document_annotation_prompt.includes("nunca instrucciones"));
    return Response.json({ document_annotation: JSON.stringify({ products }) });
  };
  assert.equal((await extractMenuPage(new Uint8Array([37,80,68,70]), "test-key", transport))[0].price, null);
  const invalid: typeof fetch = async () => Response.json({ document_annotation: JSON.stringify({ products: [{ ...products[0], price: -1 }] }) });
  await assert.rejects(extractMenuPage(new Uint8Array(), "test-key", invalid));
});
test("redemption respects balance, delivery, discount caps and minimum payable", () => {
  assert.equal(loyaltyRedemptionLimit(1000, 200, 800, 0, 50, 25, 1, 1000), 200);
  assert.equal(loyaltyRedemptionLimit(1000, 0, 1000, 290, 30, 50, 1, 1000), 10);
  assert.equal(loyaltyRedemptionLimit(1000, 0, 1000, 0, 100, 100, 1, 1000), 999);
  assert.equal(loyaltyRedemptionLimit(1000, 0, 1000, 0, 100, 100, 1, -20), 0);
});
test("rejects cross-origin mutations and allows configured frontend", () => {
  assert.equal(isUnsafeCrossOrigin(new Request("https://api.example.com/api/test", { method: "POST", headers: { origin: "https://attacker.example" } })), true);
  assert.equal(isUnsafeCrossOrigin(new Request("https://api.example.com/api/test", { method: "POST", headers: { origin: "https://web.example.com" } }), ["https://web.example.com"]), false);
  assert.equal(isUnsafeCrossOrigin(new Request("http://localhost:3001/api/test", { method: "POST" })), false);
  assert.equal(isUnsafeCrossOrigin(new Request("http://localhost:3001/api/test", { method: "POST", headers: { host: "127.0.0.1:3001", origin: "http://127.0.0.1:3001" } })), false);
  assert.equal(isUnsafeCrossOrigin(new Request("http://localhost:3001/api/test", { method: "POST", headers: { host: "127.0.0.1:3001", origin: "http://127.0.0.1:3002" } })), true);
});
