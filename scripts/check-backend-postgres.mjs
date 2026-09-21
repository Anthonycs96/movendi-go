import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join, resolve, sep } from "node:path";

// A fresh loopback-only cluster and separate generated client. Never uses DATABASE_URL.
const root = resolve(import.meta.dirname, "..");
const selection = process.argv[2] ?? "all";
if (!["all", "inventory", "sales", "cash", "minimarket", "invoicing", "printing", "barbershop"].includes(selection)) throw new Error("Suite PostgreSQL desconocida.");
const suites = selection === "all" ? ["inventory", "sales", "cash", "minimarket", "invoicing", "printing", "barbershop"] : [selection];
// Keep the schema under the workspace so Prisma resolves this project's client.
const temporaryRoot = join(root, "node_modules");
const directory = await mkdtemp(join(temporaryRoot, ".inventory-pg-"));
const pgBin = process.env.PG_BIN_DIR ?? (process.platform === "win32" ? "C:/Program Files/PostgreSQL/17/bin" : "");
const binary = (name) => pgBin ? join(pgBin, `${name}${process.platform === "win32" ? ".exe" : ""}`) : name;
const password = randomBytes(24).toString("hex");
const data = join(directory, "data");
const schemaPath = join(directory, "schema.prisma");
const clientPath = join(directory, "client");
const prismaCli = join(root, "node_modules", "prisma", "build", "index.js");
let started = false;

function run(command, args, env = {}, cwd = root, daemon = false) {
  // On Windows the server inherits pg_ctl's pipes; pipe capture would wait for
  // the server's lifetime even after pg_ctl exits. Startup logs go to its file.
  const result = spawnSync(command, args, { cwd, env: { ...process.env, ...env }, encoding: "utf8", timeout: 180_000, windowsHide: true, stdio: daemon ? "ignore" : "pipe" });
  // Scrub the disposable connection password from diagnostics as well.
  if (result.stdout) process.stdout.write(result.stdout.replaceAll(password, "[temporary]"));
  if (result.stderr) process.stderr.write(result.stderr.replaceAll(password, "[temporary]"));
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} terminó con código ${result.status}.`);
}

try {
  const port = await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolvePort(address.port));
    });
  });
  const url = `postgresql://inventory_test:${password}@127.0.0.1:${port}/inventory_hexagonal_test`;
  const pwfile = join(directory, "password");
  await writeFile(pwfile, password, { mode: 0o600 });
  run(binary("initdb"), ["-D", data, "-U", "inventory_test", "--pwfile", pwfile, "--auth=scram-sha-256", "--encoding=UTF8", "--locale=C"]);
  run(binary("pg_ctl"), ["-D", data, "-l", join(directory, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"], {}, root, true);
  started = true;
  run(binary("createdb"), ["-h", "127.0.0.1", "-p", String(port), "-U", "inventory_test", "inventory_hexagonal_test"], { PGPASSWORD: password });
  const source = await readFile(join(root, "apps/backend/prisma/schema.prisma"), "utf8");
  const schema = source.replace('provider = "sqlite"', 'provider = "postgresql"')
    .replace('provider = "prisma-client-js"', `provider = "prisma-client-js"\n  output = ${JSON.stringify(clientPath.replaceAll("\\", "/"))}`);
  if (schema === source || !schema.includes('provider = "postgresql"')) throw new Error("No se pudo preparar el esquema aislado.");
  await writeFile(schemaPath, schema);
  const environment = { DATABASE_URL: url, PRISMA_GENERATE_SKIP_AUTOINSTALL: "1" };
  run(process.execPath, [prismaCli, "generate", "--schema", schemaPath], environment);
  await cp(join(root, "apps/backend/prisma/postgresql/migrations"), join(directory, "migrations"), { recursive: true });
  run(process.execPath, [prismaCli, "migrate", "deploy", "--schema", schemaPath], environment);
  run(process.execPath, [prismaCli, "migrate", "diff", "--from-url", url, "--to-schema-datamodel", schemaPath, "--exit-code"], environment);
  // Select the PostgreSQL client for this child process, including its Prisma
  // error classes. Mixing two runtimes would invalidate instanceof checks.
  const preload = join(directory, "select-client.cjs");
  await writeFile(preload, 'require("@prisma/client");\nrequire.cache[require.resolve("@prisma/client")].exports = require(process.env.INVENTORY_TEST_CLIENT);\n');
  // Suites share a disposable database. Run files separately so unrelated fixtures
  // do not contend on PostgreSQL predicate locks; concurrent operation tests within
  // each suite still run their simultaneous transactions explicitly.
  run(process.execPath, ["--require", preload, "--import", "tsx", "--conditions=react-server", "--test", "--test-concurrency=1", ...suites.map((suite) => `src/modules/${suite}/server/service.test.ts`)], {
    ...environment, INVENTORY_TEST_DATABASE_URL: url, INVENTORY_TEST_CLIENT: clientPath,
  }, join(root, "apps/backend"));
  console.log(`PostgreSQL (${suites.join(", ")}): comportamiento, aislamiento, rollback y concurrencia verificados.`);
} finally {
  // pg_ctl targets only the data directory created by this invocation.
  if (!resolve(directory).startsWith(`${temporaryRoot}${sep}.inventory-pg-`)) throw new Error("Ruta temporal inesperada.");
  if (started) run(binary("pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"]);
  await rm(directory, { recursive: true, force: true });
}
