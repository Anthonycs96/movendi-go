import { readFile, access, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { DatabaseSync, backup } from "node:sqlite";

const sourceArg = process.argv[2];
const targetArg = process.argv[3];
if (!sourceArg || !targetArg) throw new Error("Uso: node scripts/restore-sqlite.mjs respaldo.db nueva-base.db (el destino debe ser nuevo)");
const source = resolve(sourceArg), target = resolve(targetArg);
if (source === target) throw new Error("El destino no puede ser el respaldo.");
for (const path of [target, `${target}-wal`, `${target}-shm`]) {
  const exists = await access(path).then(() => true, () => false);
  if (exists) throw new Error("El destino ya existe. Restaura primero a una base nueva y verifícala.");
}
const manifest = JSON.parse(await readFile(`${source}.json`, "utf8"));
const bytes = await readFile(source);
if (manifest.sha256 !== createHash("sha256").update(bytes).digest("hex")) throw new Error("El respaldo no coincide con su checksum.");
await mkdir(dirname(target), { recursive: true });
const original = new DatabaseSync(source, { readOnly: true });
try { await backup(original, target); } finally { original.close(); }
const restored = new DatabaseSync(target, { readOnly: true });
try {
  if (restored.prepare("PRAGMA integrity_check").all().some((row) => row.integrity_check !== "ok") || restored.prepare("PRAGMA foreign_key_check").all().length) throw new Error("La restauración no superó la validación.");
} finally { restored.close(); }
console.log(`Restauración verificada en ${target}. La base operativa no fue reemplazada.`);
