import { copyFile, mkdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

const source = resolve(process.env.SQLITE_BACKUP_SOURCE ?? "apps/backend/prisma/dev.db");
const destinationRoot = resolve(process.env.SQLITE_BACKUP_DIR ?? "backups/sqlite");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const destination = resolve(destinationRoot, `movendi-go-${timestamp}.db`);

await stat(source).catch(() => { throw new Error(`No existe la base SQLite que se desea respaldar: ${source}`); });
await mkdir(destinationRoot, { recursive: true });
await copyFile(source, destination);
const result = await stat(destination);
console.log(`Backup creado: ${destination} (${result.size} bytes)`);
