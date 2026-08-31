import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const windows = process.platform === "win32";
const npmCommand = windows ? "npm.cmd" : "npm";
const nodeMajor = Number(process.versions.node.split(".")[0]);
const playwrightCli = resolve("node_modules", "@playwright", "test", "cli.js");
const defaultSuites = [
  "e2e/app.spec.ts",
  "e2e/platform-superadmin.spec.ts",
  "e2e/real-attentions-40.spec.ts",
  "e2e/scenarios-40.spec.ts",
  "e2e/transport-real-30.spec.ts",
  "e2e/transport-configuration.spec.ts",
  "e2e/restaurant-configuration.spec.ts",
  "e2e/transport-operations-maintenance.spec.ts",
  "e2e/transport-phase-2.spec.ts",
  "e2e/phase-3-reliability.spec.ts",
  "e2e/phase-4-object-storage.spec.ts",
  "e2e/phase-5-commercial.spec.ts",
  "e2e/validation.spec.ts",
  "e2e/original-comparison.spec.ts",
];
const suites = process.argv.slice(2).length > 0 ? process.argv.slice(2) : defaultSuites;
const sourceDatabase = resolve("apps", "backend", "prisma", "dev.db");
const e2eDatabase = resolve("apps", "backend", "prisma", "e2e.db");
const e2eObjectStorage = mkdtempSync(join(tmpdir(), "movendi-e2e-storage-"));
process.env.OBJECT_STORAGE_PROVIDER = "local";
process.env.OBJECT_STORAGE_LOCAL_DIR = e2eObjectStorage;
process.env.BILLING_PROVIDER = "mock";
process.env.ALLOW_MOCK_BILLING = "true";
process.env.BILLING_MOCK_WEBHOOK_SECRET = "movendi-phase5-e2e-webhook-secret";
process.env.EMAIL_PROVIDER = "log";
process.env.ALLOW_LOG_EMAIL = "true";
process.env.APP_PUBLIC_URL = "http://localhost:3100";
process.env.INTEGRATION_ENCRYPTION_KEY = "movendi-e2e-integration-key-2026-secure";

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: windows && command.toLowerCase().endsWith(".cmd") });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (nodeMajor < 22) {
  throw new Error(`La regresión E2E requiere Node 22 o superior. Runtime actual: ${process.version}.`);
}

if (process.env.E2E_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.E2E_DATABASE_URL;
  console.log("\n=== Base E2E aislada configurada por E2E_DATABASE_URL ===");
} else {
  if (!existsSync(sourceDatabase)) {
    throw new Error("No existe apps/backend/prisma/dev.db. Ejecuta npm run db:deploy antes de la regresión.");
  }
  copyFileSync(sourceDatabase, e2eDatabase);
  process.env.DATABASE_URL = `file:${e2eDatabase.replaceAll("\\", "/")}`;
  console.log(`\n=== Base E2E aislada: ${e2eDatabase} ===`);
}

let exitCode = 0;
console.log("\n=== Build de producción para E2E ===");
if (run(npmCommand, ["run", "build"]) !== 0) {
  exitCode = 1;
} else {
  process.env.E2E_USE_STANDALONE = "1";
  for (const suite of suites) {
    console.log(`\n=== Base limpia para ${suite} ===`);
    if (run(npmCommand, ["run", "db:seed"]) !== 0 || run(process.execPath, [playwrightCli, "test", suite]) !== 0) {
      exitCode = 1;
      break;
    }
  }
}

console.log("\n=== Restaurando datos iniciales de la base E2E ===");
if (run(npmCommand, ["run", "db:seed"]) !== 0) exitCode = 1;
rmSync(e2eObjectStorage, { recursive: true, force: true });
process.exitCode = exitCode;
