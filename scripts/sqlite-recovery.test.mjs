import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

test("backup includes WAL and restores to a new database without replacing live data", async () => {
  const folder = await mkdtemp(join(tmpdir(), "movendi-recovery-"));
  const source = join(folder, "source.db"), destination = join(folder, "restored.db");
  const live = new DatabaseSync(source);
  live.exec("PRAGMA journal_mode=WAL; CREATE TABLE test(id INTEGER PRIMARY KEY, name TEXT); INSERT INTO test VALUES(1,'confirmed');");
  try {
    const backed = spawnSync(process.execPath, [resolve("scripts/backup-sqlite.mjs")], { encoding: "utf8", env: { ...process.env, SQLITE_BACKUP_SOURCE: source, SQLITE_BACKUP_DIR: join(folder, "backups") } });
    assert.equal(backed.status, 0, backed.stderr);
    const filename = (await readdir(join(folder, "backups"))).find((file) => file.endsWith(".db"));
    const args = [resolve("scripts/restore-sqlite.mjs"), join(folder, "backups", filename), destination];
    const restored = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.equal(restored.status, 0, restored.stderr);
    const db = new DatabaseSync(destination, { readOnly: true });
    assert.equal(db.prepare("SELECT name FROM test").get().name, "confirmed"); db.close();
    assert.notEqual(spawnSync(process.execPath, args).status, 0);
    assert.equal(live.prepare("SELECT COUNT(*) AS n FROM test").get().n, 1);
  } finally { live.close(); }
});
