import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { startLocalHttpsProxy } from "./e2e-https-proxy.mjs";

const nodeMajor = Number(process.versions.node.split(".")[0]);
const prismaCli = resolve("node_modules", "prisma", "build", "index.js");
const nextCli = resolve("node_modules", "next", "dist", "bin", "next");
const playwrightCli = resolve("node_modules", "@playwright", "test", "cli.js");
const defaultSuites = [
  "e2e/minimarket.spec.ts",
  "e2e/workspace-scoping.spec.ts",
  "e2e/app-performance.spec.ts",
  "e2e/app.spec.ts",
  "e2e/platform-superadmin.spec.ts",
  "e2e/real-attentions-40.spec.ts",
  "e2e/scenarios-40.spec.ts",
  "e2e/transport-real-30.spec.ts",
  "e2e/transport-configuration.spec.ts",
  "e2e/restaurant-configuration.spec.ts",
  "e2e/restaurant-production-audit.spec.ts",
  "e2e/restaurant-qr-print-reports.spec.ts",
  "e2e/restaurant-admin-growth.spec.ts",
  "e2e/inventory-compatibility.spec.ts",
  "e2e/sales-compatibility.spec.ts",
  "e2e/restaurant-frontend-journey.spec.ts",
  "e2e/restaurant-staff.spec.ts",
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

function run(command, args, cwd = process.cwd(), env = {}) {
  const result = spawnSync(command, args, { cwd, env: { ...process.env, ...env }, stdio: "inherit" });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function runBrowserSuite(suite) {
  // Keep this event loop available to serve the local HTTPS proxy.
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [playwrightCli, "test", suite], { env: { ...process.env, E2E_REUSE_SERVER: "1" }, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => resolveRun(code ?? 1));
  });
}

function buildWorkspace(name) {
  return run(process.execPath, [nextCli, "build"], resolve("apps", name))
    || run(process.execPath, [resolve("scripts", "prepare-standalone.mjs"), name]);
}

function seed() {
  return run(process.execPath, ["--import", "tsx", resolve("apps", "backend", "prisma", "seed.ts")]);
}

async function assertFreePort(port) {
  await new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once("error", () => reject(new Error(`El puerto E2E ${port} está ocupado. No se reutilizará un servidor existente.`)));
    probe.listen(port, "127.0.0.1", () => probe.close(resolvePort));
  });
}

async function startServers() {
  // The frontend's default BFF destination is loopback:3001. Refuse inherited
  // remote destinations so the suite cannot write to an external backend.
  if (process.env.API_INTERNAL_URL && process.env.API_INTERNAL_URL !== "http://127.0.0.1:3001") throw new Error("Elimina API_INTERNAL_URL del entorno de pruebas; el backend E2E debe ser local.");
  await Promise.all([assertFreePort(3001), assertFreePort(3100)]);
  const children = [
    { name: "backend", port: "3001", env: { JOB_RUNNER_SECRET: "phase-3-e2e-worker-secret-0001", JOB_RETRY_BASE_SECONDS: "1", BACKUP_REPORT_TOKEN: "launch-e2e-backup-token" } },
    { name: "frontend", port: "3100", env: {} },
  ].map(({ name, port, env }) => spawn(process.execPath, [resolve("scripts", "start-service.mjs"), name, port], {
    env: { ...process.env, ...env, PORT: port, HOSTNAME: "127.0.0.1" }, stdio: "inherit",
  }));
  let closeHttps = async () => {};
  const stop = async () => {
    await closeHttps();
    await Promise.all(children.map((child) => new Promise((done) => {
      if (child.exitCode !== null || child.signalCode !== null) return done();
      child.once("exit", done);
      child.kill();
    })));
  };
  try {
    if (process.env.E2E_CROSS_BROWSER === "1") closeHttps = await startLocalHttpsProxy();
    const deadline = Date.now() + 120_000;
    for (;;) {
      if (children.some((child) => child.exitCode !== null)) throw new Error("Un servicio E2E no pudo iniciarse.");
      try {
        const responses = await Promise.all([fetch("http://127.0.0.1:3001/api/health"), fetch("http://127.0.0.1:3100/login")]);
        if (responses.every((response) => response.ok)) return stop;
      } catch { /* Servers are still binding their ports. */ }
      if (Date.now() >= deadline) throw new Error("Los servicios E2E no respondieron a tiempo.");
      await new Promise((done) => setTimeout(done, 250));
    }
  } catch (error) { await stop(); throw error; }
}

if (nodeMajor < 22 || (nodeMajor === 22 && Number(process.versions.node.split(".")[1]) < 13)) {
  throw new Error(`La regresión E2E requiere Node 22.13 o superior. Runtime actual: ${process.version}.`);
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
// Never seed a stale copy before bringing its schema up to date.
const schema = process.env.DATABASE_URL.startsWith("file:")
  ? resolve("apps", "backend", "prisma", "schema.prisma")
  : resolve("apps", "backend", "prisma", "postgresql", "schema.prisma");
console.log("\n=== Build de producción para E2E ===");
if (run(process.execPath, [prismaCli, "migrate", "deploy", "--schema", schema]) !== 0
  || run(process.execPath, [prismaCli, "generate", "--schema", schema]) !== 0
  || buildWorkspace("backend") !== 0 || buildWorkspace("frontend") !== 0) {
  exitCode = 1;
} else {
  process.env.E2E_USE_STANDALONE = "1";
  for (const suite of suites) {
    console.log(`\n=== Base limpia para ${suite} ===`);
    if (seed() !== 0) {
      exitCode = 1;
      break;
    }
    const stop = await startServers();
    try { exitCode = await runBrowserSuite(suite); }
    finally { await stop(); }
    if (exitCode) break;
  }
}

if (!exitCode) {
  console.log("\n=== Restaurando datos iniciales de la base E2E ===");
  if (seed() !== 0) exitCode = 1;
}
if (!resolve(e2eObjectStorage).startsWith(`${resolve(tmpdir())}${sep}`) || !basename(e2eObjectStorage).startsWith("movendi-e2e-storage-")) throw new Error("Ruta temporal de almacenamiento inesperada.");
rmSync(e2eObjectStorage, { recursive: true, force: true });
process.exitCode = exitCode;
