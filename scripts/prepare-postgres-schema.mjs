import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backendRoot = resolve(repositoryRoot, "apps", "backend");
const sourcePath = resolve(backendRoot, "prisma", "schema.prisma");
const targetPath = resolve(backendRoot, "prisma", "postgresql", "schema.prisma");
const source = await readFile(sourcePath, "utf8");
const postgresSchema = source.replace('provider = "sqlite"', 'provider = "postgresql"');

if (postgresSchema === source) throw new Error("No se encontró el provider SQLite esperado en apps/backend/prisma/schema.prisma.");

await mkdir(dirname(targetPath), { recursive: true });
let current = "";
try {
  current = await readFile(targetPath, "utf8");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

if (current !== postgresSchema) await writeFile(targetPath, postgresSchema, "utf8");
console.log("Esquema PostgreSQL preparado en apps/backend/prisma/postgresql/schema.prisma.");
