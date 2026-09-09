import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { DatabaseSync, backup } from "node:sqlite";

const source = resolve(process.env.SQLITE_BACKUP_SOURCE ?? "apps/backend/prisma/dev.db");
const destinationRoot = resolve(process.env.SQLITE_BACKUP_DIR ?? "backups/sqlite");
const destination = resolve(destinationRoot, `movendi-go-${new Date().toISOString().replace(/[:.]/g, "-")}.db`);
await stat(source);
await mkdir(destinationRoot, { recursive: true });
const db = new DatabaseSync(source, { readOnly: true });
try { await backup(db, destination); } finally { db.close(); }
const verification = new DatabaseSync(destination, { readOnly: true });
try {
  const checks = verification.prepare("PRAGMA integrity_check").all();
  if (checks.some((row) => row.integrity_check !== "ok")) throw new Error("El respaldo no superó la verificación de integridad.");
  if (verification.prepare("PRAGMA foreign_key_check").all().length) throw new Error("El respaldo contiene referencias inconsistentes.");
} finally { verification.close(); }
const bytes = await readFile(destination);
await writeFile(`${destination}.json`, JSON.stringify({ createdAt: new Date().toISOString(), sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), integrity: "ok" }, null, 2), { flag: "wx" });
console.log(`Respaldo consistente y verificado: ${destination} (${bytes.length} bytes). Incluye transacciones confirmadas del WAL.`);
