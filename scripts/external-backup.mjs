import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";

export function seal(bytes, key) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([Buffer.from("MOVBAK01"), iv, cipher.getAuthTag(), encrypted]);
}
export function unseal(bytes, key) {
  if (bytes.length < 36 || bytes.subarray(0, 8).toString() !== "MOVBAK01") throw new Error("Formato de respaldo inválido.");
  const cipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(8, 20)); cipher.setAuthTag(bytes.subarray(20, 36));
  return Buffer.concat([cipher.update(bytes.subarray(36)), cipher.final()]);
}
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
function required(name) { const value = process.env[name]?.trim(); if (!value) throw new Error(`Falta ${name}.`); return value; }
function client(prefix) {
  return new S3Client({ region: process.env[`${prefix}REGION`] || "auto", endpoint: required(`${prefix}ENDPOINT`), forcePathStyle: process.env[`${prefix}FORCE_PATH_STYLE`] === "true", credentials: { accessKeyId: required(`${prefix}ACCESS_KEY_ID`), secretAccessKey: required(`${prefix}SECRET_ACCESS_KEY`) } });
}
async function list(storage, Bucket, Prefix) {
  const objects = []; let token;
  do { const result = await storage.send(new ListObjectsV2Command({ Bucket, Prefix, ContinuationToken: token })); objects.push(...(result.Contents ?? [])); token = result.IsTruncated ? result.NextContinuationToken : undefined; } while (token);
  return objects;
}
async function get(storage, Bucket, Key) { const result = await storage.send(new GetObjectCommand({ Bucket, Key })); return Buffer.from(await result.Body.transformToByteArray()); }
async function report(data) {
  if (!process.env.BACKUP_REPORT_URL || !process.env.BACKUP_REPORT_TOKEN) return;
  const response = await fetch(process.env.BACKUP_REPORT_URL, { method: "POST", headers: { Authorization: `Bearer ${process.env.BACKUP_REPORT_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(data), signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`No se pudo registrar el respaldo: HTTP ${response.status}.`);
}
function run(script, args, env = {}) {
  const result = spawnSync(process.execPath, [resolve("scripts", script), ...args], { env: { ...process.env, ...env }, windowsHide: true, encoding: "utf8", timeout: 20 * 60_000, maxBuffer: 10 * 1024 * 1024 });
  if (result.status !== 0) throw new Error("La herramienta de copia/restauración falló. Revisa conectividad y compatibilidad de PostgreSQL.");
}
function restoredObjects() {
  const url = new URL(required("RESTORE_DATABASE_URL"));
  const schema = new URL(required("DATABASE_URL")).searchParams.get("schema") || "public";
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) throw new Error("Nombre de esquema inválido.");
  const command = process.env.PG_BIN_DIR ? join(process.env.PG_BIN_DIR, `psql${process.platform === "win32" ? ".exe" : ""}`) : "psql";
  const result = spawnSync(command, ["-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", `SELECT COALESCE(json_agg(t),'[]'::json) FROM (SELECT bucket,key,sha256 FROM "${schema}"."StoredObject" WHERE status='ACTIVE' AND ("expiresAt" IS NULL OR "expiresAt">CURRENT_TIMESTAMP)) t;`], { env: { ...process.env, PGHOST: url.hostname, PGPORT: url.port || "5432", PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGSSLMODE: url.searchParams.get("sslmode") || "prefer", PGCONNECT_TIMEOUT: "15" }, encoding: "utf8", windowsHide: true, timeout: 60000 });
  if (result.status !== 0) throw new Error("No se pudo comprobar el inventario de archivos restaurado.");
  return JSON.parse(result.stdout);
}

export async function main() {
  const key = Buffer.from(required("BACKUP_ENCRYPTION_KEY"), "base64"); if (key.length !== 32) throw new Error("BACKUP_ENCRYPTION_KEY debe tener 32 bytes en base64.");
  const target = client("BACKUP_S3_"), bucket = required("BACKUP_S3_BUCKET");
  const retention = Number(process.env.BACKUP_RETENTION_DAYS ?? 30); if (!Number.isInteger(retention) || retention < 7 || retention > 3650) throw new Error("Retención fuera de rango.");
  const root = await mkdtemp(join(tmpdir(), "movendi-external-backup-"));
  const id = randomUUID(), startedAt = new Date().toISOString();
  const prefix = `movendi-backups/v1/${startedAt.slice(0, 10)}/${id}/`;
  let source;
  try {
    if (process.argv.includes("restore")) {
      const restorePrefix = required("BACKUP_RESTORE_PREFIX");
      if (!/^movendi-backups\/v1\/\d{4}-\d{2}-\d{2}\/[a-f0-9-]{36}\/$/.test(restorePrefix)) throw new Error("Prefijo de restauración inválido.");
      const manifest = JSON.parse(unseal(await get(target, bucket, `${restorePrefix}manifest.enc`), key));
      const completed = JSON.parse(await get(target, bucket, `${restorePrefix}complete.json`));
      if (completed.id !== manifest.id || !Array.isArray(manifest.files)) throw new Error("El respaldo no está completo.");
      const destination = resolve(required("BACKUP_RESTORE_DIR")); await mkdir(destination, { recursive: false });
      for (const entry of manifest.files) {
        if (!entry.archiveKey.startsWith(restorePrefix) || !/^(database\.dump|database\.dump\.json|integration-key\.json|objects\/[a-f0-9]{64})$/.test(entry.localName)) throw new Error("Ruta de respaldo inválida.");
        const bytes = unseal(await get(target, bucket, entry.archiveKey), key);
        if (sha(bytes) !== entry.sha256) throw new Error("Checksum de respaldo inválido.");
        const path = resolve(destination, entry.localName); if (!path.startsWith(`${destination}${sep}`)) throw new Error("Ruta de recuperación inválida.");
        await mkdir(resolve(path, ".."), { recursive: true }); await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
      }
      await writeFile(join(destination, "manifest.json"), JSON.stringify(manifest, null, 2), { flag: "wx", mode: 0o600 });
      if (process.env.RESTORE_DATABASE_URL) run("postgres-recovery.mjs", ["restore", join(destination, "database.dump")]);
      console.log(JSON.stringify({ restored: true, files: manifest.files.length, databaseRestored: Boolean(process.env.RESTORE_DATABASE_URL) })); return;
    }
    source = client("S3_"); const sourceBucket = required("S3_BUCKET");
    if (sourceBucket === bucket && required("S3_ENDPOINT") === required("BACKUP_S3_ENDPOINT")) throw new Error("Usa un bucket de respaldo independiente del de archivos.");
    await report({ id, status: "RUNNING", startedAt, prefix });
    console.log(JSON.stringify({ phase: "database-backup" }));
    const dump = join(root, "database.dump"); run("postgres-recovery.mjs", ["backup", dump]);
    const files = [];
    async function upload(bytes, localName, sourceKey) {
      const encrypted = seal(bytes, key), archiveKey = `${prefix}${localName}.enc`;
      await target.send(new PutObjectCommand({ Bucket: bucket, Key: archiveKey, Body: encrypted, ContentType: "application/octet-stream", IfNoneMatch: "*" }));
      const checked = unseal(await get(target, bucket, archiveKey), key);
      if (sha(checked) !== sha(bytes)) throw new Error("Verificación remota fallida.");
      files.push({ localName, archiveKey, sourceKey, sha256: sha(bytes), bytes: bytes.length });
    }
    await upload(await readFile(dump), "database.dump"); await upload(await readFile(`${dump}.json`), "database.dump.json");
    console.log(JSON.stringify({ phase: "files-backup" }));
    await upload(Buffer.from(JSON.stringify({ INTEGRATION_ENCRYPTION_KEY: required("BACKUP_APP_INTEGRATION_KEY") })), "integration-key.json");
    for (const object of await list(source, sourceBucket, "tenants/")) {
      if (!object.Key || object.Key.endsWith("/")) continue;
      // Menu originals use immutable UUID keys. A missing/changing source fails the run.
      const bytes = await get(source, sourceBucket, object.Key);
      await upload(bytes, `objects/${sha(Buffer.from(object.Key))}`, object.Key);
    }
    let restoreVerified = false;
    if (process.env.RESTORE_DATABASE_URL) {
      console.log(JSON.stringify({ phase: "isolated-restore" }));
      const recovered = join(root, "verified.dump");
      await writeFile(recovered, unseal(await get(target, bucket, files[0].archiveKey), key), { flag: "wx", mode: 0o600 });
      await writeFile(`${recovered}.json`, unseal(await get(target, bucket, files[1].archiveKey), key), { flag: "wx", mode: 0o600 });
      run("postgres-recovery.mjs", ["restore", recovered]);
      for (const object of restoredObjects()) {
        const archived = files.find((entry) => entry.sourceKey === object.key);
        if (object.bucket !== sourceBucket || !archived || archived.sha256 !== object.sha256) throw new Error("Un archivo activo de la base restaurada falta o cambió en la copia externa.");
      }
      restoreVerified = true;
    }
    const manifest = { version: 1, id, startedAt, completedAt: new Date().toISOString(), sourceBucket, files, restoreVerified };
    const manifestBytes = Buffer.from(JSON.stringify(manifest));
    await target.send(new PutObjectCommand({ Bucket: bucket, Key: `${prefix}manifest.enc`, Body: seal(manifestBytes, key), ContentType: "application/octet-stream", IfNoneMatch: "*" }));
    if (sha(unseal(await get(target, bucket, `${prefix}manifest.enc`), key)) !== sha(manifestBytes)) throw new Error("El manifiesto no se pudo verificar.");
    const completed = { id, startedAt, completedAt: manifest.completedAt, prefix, files: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0), restoreVerified };
    await target.send(new PutObjectCommand({ Bucket: bucket, Key: `${prefix}complete.json`, Body: JSON.stringify(completed), ContentType: "application/json", IfNoneMatch: "*" }));
    await report({ ...completed, status: "COMPLETED" });
    // Only after a verified new backup; preserve at least the seven most recent successful runs.
    const all = await list(target, bucket, "movendi-backups/v1/");
    const successes = all.filter((object) => object.Key?.endsWith("/complete.json")).sort((a, b) => new Date(b.LastModified) - new Date(a.LastModified));
    const protectedPrefixes = successes.slice(0, 7).map((object) => object.Key.slice(0, -"complete.json".length));
    const cutoff = Date.now() - retention * 86400000;
    const expired = all.filter((object) => object.Key && /^movendi-backups\/v1\/\d{4}-\d{2}-\d{2}\/[a-f0-9-]{36}\//.test(object.Key) && new Date(object.LastModified).getTime() < cutoff && !protectedPrefixes.some((keep) => object.Key.startsWith(keep)));
    for (let index = 0; index < expired.length; index += 1000) { const deleted = await target.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: expired.slice(index, index + 1000).map((object) => ({ Key: object.Key })), Quiet: true } })); if (deleted.Errors?.length) throw new Error("Revisa la limpieza de respaldos vencidos."); }
    console.log(JSON.stringify({ ...completed, retentionDays: retention }));
  } catch (error) {
    if (!process.argv.includes("restore")) await report({ id, status: "FAILED", startedAt, prefix, error: "La copia no completó todas sus verificaciones. Revisa la ejecución del respaldo." }).catch(() => {});
    throw error;
  } finally {
    target.destroy(); source?.destroy();
    const resolved = resolve(root); if (resolved.startsWith(`${resolve(tmpdir())}${sep}`) && resolved.includes("movendi-external-backup-")) await rm(resolved, { recursive: true, force: true });
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(JSON.stringify({ backup: "failed", type: error.name, message: "Revisa conexión, credenciales, herramientas y destino de recuperación. No se muestran secretos." })); process.exitCode = 1; });
}
