import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/core/database/prisma";
import { getMistralKey, mistralStatus, saveMistralKey } from "./mistral";

test("Mistral credentials are authenticated, encrypted and never returned by status", async () => {
  const previous = process.env.INTEGRATION_ENCRYPTION_KEY;
  process.env.INTEGRATION_ENCRYPTION_KEY = "test-only-encryption-key-at-least-32-characters";
  let record: Record<string, unknown> | null = null;
  const originalFind = prisma.platformIntegration.findUnique, originalUpsert = prisma.platformIntegration.upsert;
  prisma.platformIntegration.findUnique = (async () => record) as unknown as typeof originalFind;
  prisma.platformIntegration.upsert = (async (args: { create: Record<string, unknown> }) => { record = args.create; return record; }) as unknown as typeof originalUpsert;
  const http = mock.method(globalThis, "fetch", async () => new Response("{}", { status: 200 }));
  const token = "mock-mistral-credential-for-unit-test";
  try {
    const status = await saveMistralKey(token, "test-actor");
    assert.equal(status.configured, true); assert.equal(await getMistralKey(), token);
    assert.ok(!JSON.stringify(record).includes(token)); assert.ok(!JSON.stringify(await mistralStatus()).includes(token));
    http.mock.mockImplementation(async () => new Response("invalid", { status: 401 }));
    await assert.rejects(() => saveMistralKey("invalid-new-credential", "test-actor"));
    assert.equal(await getMistralKey(), token);
    process.env.INTEGRATION_ENCRYPTION_KEY = "wrong-encryption-key-at-least-32-characters";
    await assert.rejects(() => getMistralKey());
  } finally {
    prisma.platformIntegration.findUnique = originalFind; prisma.platformIntegration.upsert = originalUpsert;
    mock.restoreAll(); if (previous === undefined) delete process.env.INTEGRATION_ENCRYPTION_KEY; else process.env.INTEGRATION_ENCRYPTION_KEY = previous;
  }
});
