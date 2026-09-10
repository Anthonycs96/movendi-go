import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { createHash } from "node:crypto";

const [mode, filename] = process.argv.slice(2);
if (!["backup", "restore"].includes(mode) || !filename) throw new Error("Uso: postgres-recovery.mjs backup|restore archivo.dump. Configura DATABASE_URL para respaldo o RESTORE_DATABASE_URL para restaurar en una base vacía.");
const databaseUrl = process.env[mode === "backup" ? "DATABASE_URL" : "RESTORE_DATABASE_URL"];
if (!databaseUrl) throw new Error("Falta la URL de la base de datos en el entorno.");
const url = new URL(databaseUrl);
if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("Se requiere PostgreSQL.");
const schema = url.searchParams.get("schema");
if (schema && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) throw new Error("Nombre de esquema inválido.");
const env = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || "5432", PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGSSLMODE: url.searchParams.get("sslmode") ?? process.env.PGSSLMODE ?? "prefer", PGCONNECT_TIMEOUT: "15" };
function run(name, args) {
  const command = process.env.PG_BIN_DIR ? join(process.env.PG_BIN_DIR, `${name}${process.platform === "win32" ? ".exe" : ""}`) : name;
  const result = spawnSync(command, args, { env, encoding: "utf8", windowsHide: true, timeout: 15 * 60_000, maxBuffer: 10 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${name} falló. Verifica conexión, permisos y versión de PostgreSQL. No se imprimen credenciales.`);
  return result.stdout;
}
const file = resolve(filename);
if (mode === "backup") {
  await mkdir(dirname(file), { recursive: true });
  // Reserve the filename: never overwrite a previous backup.
  await writeFile(file, "", { flag: "wx", mode: 0o600 });
  run("pg_dump", ["--format=custom", "--no-owner", "--no-acl", ...(schema ? ["--schema", schema] : []), "--file", file]);
  const contents = run("pg_restore", ["--list", file]);
  if (!contents.includes("TABLE")) throw new Error("El respaldo no contiene tablas.");
  const bytes = await readFile(file);
  await writeFile(`${file}.json`, JSON.stringify({ createdAt: new Date().toISOString(), sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }, null, 2), { flag: "wx", mode: 0o600 });
  console.log(`Respaldo PostgreSQL creado y archivo verificado: ${file}`);
} else {
  const bytes = await readFile(file), manifest = JSON.parse(await readFile(`${file}.json`, "utf8"));
  if (createHash("sha256").update(bytes).digest("hex") !== manifest.sha256) throw new Error("El respaldo no coincide con su checksum.");
  const tableCount = run("psql", ["-X", "--no-align", "--tuples-only", "-v", "ON_ERROR_STOP=1", "-c", "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','S','f');"]).trim();
  if (tableCount !== "0") throw new Error("El destino contiene objetos. Solo se restaura en una base vacía, sin reemplazar la base operativa.");
  run("pg_restore", ["--dbname", env.PGDATABASE, "--single-transaction", "--exit-on-error", "--no-owner", "--no-acl", file]);
  console.log("Restauración PostgreSQL completada en una transacción. Verifica los registros y los recorridos de la aplicación antes de cambiar la conexión operativa.");
}
