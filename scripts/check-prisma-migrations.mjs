import { createRequire } from "node:module";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const repositoryRoot = resolve(import.meta.dirname, "..");
const schemaPath = join(repositoryRoot, "apps", "backend", "prisma", "schema.prisma");
const prismaCli = require.resolve("prisma/build/index.js");
const temporaryRoot = resolve(tmpdir());
const temporaryDirectory = await mkdtemp(join(temporaryRoot, "movendi-migrations-"));
const databasePath = join(temporaryDirectory, "clean.db");
const databaseUrl = `file:${databasePath.replaceAll("\\", "/")}`;

function runPrisma(args, extraEnvironment = {}) {
  const result = spawnSync(process.execPath, [prismaCli, ...args], {
    cwd: repositoryRoot,
    env: { ...process.env, RUST_LOG: "info", ...extraEnvironment },
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`Prisma terminó con código ${result.status ?? "desconocido"}.`);
}

try {
  await writeFile(databasePath, "");
  runPrisma(["migrate", "deploy", "--schema", schemaPath], { DATABASE_URL: databaseUrl });
  runPrisma([
    "migrate", "diff",
    "--from-url", databaseUrl,
    "--to-schema-datamodel", schemaPath,
    "--exit-code",
  ]);
  console.log("Migraciones verificadas: una base vacía coincide con schema.prisma.");
} finally {
  const resolvedDirectory = resolve(temporaryDirectory);
  if (!resolvedDirectory.startsWith(`${temporaryRoot}${sep}`) || !resolvedDirectory.includes("movendi-migrations-")) {
    throw new Error("Se rechazó limpiar una ruta temporal inesperada.");
  }
  await rm(resolvedDirectory, { recursive: true, force: true });
}
