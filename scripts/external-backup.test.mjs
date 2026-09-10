import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { seal, unseal } from "./external-backup.mjs";
test("encrypted backups recover exact binary content and reject altered files and wrong keys", () => {
  const original = randomBytes(65536), key = randomBytes(32), encrypted = seal(original, key);
  assert.deepEqual(unseal(encrypted, key), original);
  assert.notDeepEqual(seal(original, key), encrypted);
  assert.throws(() => unseal(encrypted, randomBytes(32)));
  encrypted[100] ^= 1; assert.throws(() => unseal(encrypted, key));
  assert.throws(() => unseal(Buffer.from("bad"), key));
});
