import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID, createHash } from "node:crypto";
import { after, before, beforeEach, test, type TestContext } from "node:test";
import { PrismaClient, type Prisma } from "@prisma/client";
import { prisma } from "@/core/database/prisma";
import { AppError } from "@/core/auth/errors";
import type { TenantScope } from "@/core/auth/types";
import { createRoutedPrintJobs } from "@/modules/restaurant/server/printing";
import { changePrintDelivery, listPrintJobs, nextAgentPrint } from "./service";
import { handlePrintAgent } from "./agent";

const require = createRequire(import.meta.url);
let db: PrismaClient;
let directory: string;
let scope: TenantScope;
let otherScope: TenantScope;
let secondScope: TenantScope;
let printerId: string;
const stationId = "test-station";
const code = (expected: string) => (error: unknown) => error instanceof AppError && error.code === expected;

before(async () => {
  const url = process.env.INVENTORY_TEST_DATABASE_URL;
  if (url) {
    const parsed = new URL(url);
    assert.equal(parsed.hostname, "127.0.0.1"); assert.equal(parsed.pathname, "/inventory_hexagonal_test"); assert.equal(parsed.username, "inventory_test");
    assert.ok(process.env.INVENTORY_TEST_CLIENT);
    const { PrismaClient: Client } = require(process.env.INVENTORY_TEST_CLIENT!) as { PrismaClient: typeof PrismaClient };
    db = new Client({ datasources: { db: { url } } });
  } else {
    directory = await mkdtemp(join(tmpdir(), "movendi-printing-test-"));
    await writeFile(join(directory, "printing.db"), "", { flag: "wx" });
    const url = `file:${join(directory, "printing.db").replaceAll("\\", "/")}`;
    execFileSync(process.execPath, [require.resolve("prisma/build/index.js"), "migrate", "deploy", "--schema", fileURLToPath(new URL("../../../../prisma/schema.prisma", import.meta.url))], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe", timeout: 60_000 });
    db = new PrismaClient({ datasources: { db: { url } } });
  }
});
after(async () => { await db?.$disconnect(); if (directory) { assert.ok(resolve(directory).startsWith(`${resolve(tmpdir())}${sep}movendi-printing-test-`)); await rm(directory, { recursive: true, force: true }); } });

beforeEach(async (hook) => {
  const context = hook as TestContext;
  context.mock.method(prisma, "$transaction", db.$transaction.bind(db));
  for (const model of ["restaurantPrintJob", "printDevice", "auditLog"] as const) {
    const original = prisma[model]; Object.defineProperty(prisma, model, { value: db[model], configurable: true });
    context.after(() => Object.defineProperty(prisma, model, { value: original, configurable: true }));
  }
  const suffix = randomUUID();
  const tenant = await db.tenant.create({ data: { slug: suffix, name: "Restaurante", shortName: "RE", type: "RESTAURANT" } });
  const other = await db.tenant.create({ data: { slug: "other-" + suffix, name: "Otro", shortName: "OT", type: "RESTAURANT" } });
  const branch = await db.branch.create({ data: { tenantId: tenant.id, name: "Principal" } });
  const second = await db.branch.create({ data: { tenantId: tenant.id, name: "Segunda" } });
  const foreign = await db.branch.create({ data: { tenantId: other.id, name: "Ajena" } });
  const actor = await db.user.create({ data: { email: suffix + "@test.local", name: "Operador", passwordHash: "not-a-login" } });
  scope = { tenantId: tenant.id, branchId: branch.id, actorId: actor.id, permissions: ["*"] };
  secondScope = { ...scope, branchId: second.id }; otherScope = { ...scope, tenantId: other.id, branchId: foreign.id };
  printerId = (await db.printDevice.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, name: "Navegador", connectionType: "BROWSER" } })).id;
});
const claim = { kind: "claim" as const, stationId, leaseMs: 600_000 };
const complete = (attempt: number) => ({ kind: "complete" as const, stationId, attempt, status: "PRINTED" as const, confirmed: true });
function job(overrides: Partial<Prisma.RestaurantPrintJobUncheckedCreateInput> = {}) { return db.restaurantPrintJob.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, createdById: scope.actorId, printerId, type: "TEST", payload: '{"items":[{"name":"Comanda","quantity":1}]}', ...overrides } }); }

test("una reserva vence a incierta: exige revisión y protege contra respuestas de intentos anteriores", async () => {
  const item = await job();
  const first = await changePrintDelivery(scope, item.id, claim); assert.equal(first.claimed, true);
  await assert.rejects(changePrintDelivery(scope, item.id, { ...complete(first.attempt), confirmed: false }), code("PRINT_CONFIRMATION_REQUIRED"));
  await db.restaurantPrintJob.update({ where: { id: item.id }, data: { leaseExpiresAt: new Date(0) } });
  const list = await listPrintJobs(scope); assert.equal(list[0].status, "UNKNOWN"); assert.equal(list[0].claimable, false);
  const expiredClaim = await changePrintDelivery(scope, item.id, claim); assert.equal(expiredClaim.claimed, false);
  await assert.rejects(changePrintDelivery(scope, item.id, complete(first.attempt)), code("PRINT_JOB_NOT_CLAIMED"));
  await assert.rejects(changePrintDelivery(scope, item.id, { kind: "retry", attempt: first.attempt }), code("PRINT_JOB_NOT_RETRYABLE"));
  await changePrintDelivery(scope, item.id, { kind: "confirm", attempt: first.attempt, printed: false });
  await changePrintDelivery(scope, item.id, { kind: "retry", attempt: first.attempt });
  const next = await changePrintDelivery(scope, item.id, claim); assert.equal(next.attempt, first.attempt + 1);
  await assert.rejects(changePrintDelivery(scope, item.id, complete(first.attempt)), code("PRINT_JOB_NOT_CLAIMED"));
  await assert.rejects(changePrintDelivery(scope, item.id, { kind: "confirm", attempt: first.attempt, printed: true }), code("PRINT_JOB_NOT_CLAIMED"));
  await changePrintDelivery(scope, item.id, complete(next.attempt));
  const saved = await db.restaurantPrintJob.findUniqueOrThrow({ where: { id: item.id } });
  assert.equal(saved.status, "PRINTED"); assert.equal(saved.deliveryAttempt, 1); assert.ok(saved.printedAt);
});

test("estaciones y operaciones no cruzan empresa, sucursal ni impresora asignada", async () => {
  const item = await job();
  for (const foreign of [secondScope, otherScope, { ...scope, printerId: "other-printer" }]) {
    assert.equal((await listPrintJobs(foreign)).length, 0);
    await assert.rejects(changePrintDelivery(foreign, item.id, claim), code("NOT_FOUND"));
    await assert.rejects(changePrintDelivery(foreign, item.id, complete(1)), code("NOT_FOUND"));
    await assert.rejects(changePrintDelivery(foreign, item.id, { kind: "retry", attempt: 1 }), code("NOT_FOUND"));
  }
  const reserved = await changePrintDelivery(scope, item.id, claim);
  await assert.rejects(changePrintDelivery(scope, item.id, { ...complete(reserved.attempt), stationId: "other-station" }), code("PRINT_JOB_NOT_CLAIMED"));
});

test("auditoría y transición se confirman juntas en reserva, resultado, confirmación y reintento", async (context) => {
  const item = await job();
  let failingAction = "PRINT_CLAIM";
  context.mock.method(prisma, "$transaction", (operation: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: { isolationLevel?: Prisma.TransactionIsolationLevel }) => db.$transaction(async (tx) => {
    const create = tx.auditLog.create.bind(tx.auditLog);
    return operation(new Proxy(tx, { get(target, key) { return key === "auditLog" ? { create: async (args: Prisma.AuditLogCreateArgs) => { if (args.data.action === failingAction) throw new Error("audit unavailable"); return create(args); } } : Reflect.get(target, key); } }));
  }, options));
  await assert.rejects(changePrintDelivery(scope, item.id, claim), /audit unavailable/);
  assert.equal((await db.restaurantPrintJob.findUniqueOrThrow({ where: { id: item.id } })).attempts, 0);
  failingAction = "PRINT_COMPLETE";
  const reserved = await changePrintDelivery(scope, item.id, claim);
  await assert.rejects(changePrintDelivery(scope, item.id, complete(reserved.attempt)), /audit unavailable/);
  assert.equal((await db.restaurantPrintJob.findUniqueOrThrow({ where: { id: item.id } })).status, "PROCESSING");
  failingAction = "PRINT_CONFIRM";
  await changePrintDelivery(scope, item.id, { ...complete(reserved.attempt), status: "UNKNOWN" });
  await assert.rejects(changePrintDelivery(scope, item.id, { kind: "confirm", attempt: reserved.attempt, printed: false }), /audit unavailable/);
  assert.equal((await db.restaurantPrintJob.findUniqueOrThrow({ where: { id: item.id } })).status, "UNKNOWN");
  failingAction = "PRINT_RETRY";
  await changePrintDelivery(scope, item.id, { kind: "confirm", attempt: reserved.attempt, printed: false });
  await assert.rejects(changePrintDelivery(scope, item.id, { kind: "retry", attempt: reserved.attempt }), /audit unavailable/);
  const unchanged = await db.restaurantPrintJob.findUniqueOrThrow({ where: { id: item.id } });
  assert.equal(unchanged.status, "FAILED"); assert.equal(unchanged.deliveryAttempt, 0);
});

async function agentFixture() {
  const token = "test-print-agent-" + randomUUID();
  await db.printDevice.update({ where: { id: printerId }, data: { connectionType: "LOCAL_AGENT", tokenHash: createHash("sha256").update(token).digest("hex") } });
  const request = (path: string, body: unknown, method = "POST") => handlePrintAgent(new Request(`https://test.local/${path}`, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) }), path.split("/"));
  return { request, scope: { ...scope, printerId } };
}

test("agente exige protocolo e intento; no confunde envío TCP con impresión física", async () => {
  const agent = await agentFixture(); const item = await job();
  await assert.rejects(changePrintDelivery(scope, item.id, claim), code("PRINT_DEVICE_UNAVAILABLE"));
  await assert.rejects(agent.request("jobs/next", {}), code("PRINT_AGENT_UPGRADE_REQUIRED"));
  assert.equal((await db.restaurantPrintJob.findUniqueOrThrow({ where: { id: item.id } })).attempts, 0);
  const result = await agent.request("jobs/next", { protocolVersion: 2 });
  assert.ok("job" in result && result.job); assert.equal(result.job.id, item.id);
  await assert.rejects(agent.request(`jobs/${item.id}/status`, { status: "SENT" }, "PATCH"), code("PRINT_JOB_NOT_CLAIMED"));
  await assert.rejects(agent.request(`jobs/${item.id}/status`, { status: "PRINTED", attempt: result.job.attempt }, "PATCH"), code("VALIDATION_ERROR"));
  await agent.request(`jobs/${item.id}/status`, { status: "SENT", attempt: result.job.attempt }, "PATCH");
  const sent = await db.restaurantPrintJob.findUniqueOrThrow({ where: { id: item.id } }); assert.equal(sent.status, "SENT"); assert.equal(sent.printedAt, null);
  await changePrintDelivery(scope, item.id, { kind: "confirm", attempt: sent.attempts, printed: false });
  await changePrintDelivery(scope, item.id, { kind: "retry", attempt: sent.attempts });
  const second = await agent.request("jobs/next", { protocolVersion: 2 }); assert.ok("job" in second && second.job);
  await assert.rejects(agent.request(`jobs/${item.id}/status`, { status: "SENT", attempt: sent.attempts }, "PATCH"), code("PRINT_JOB_NOT_CLAIMED"));
  await agent.request(`jobs/${item.id}/status`, { status: "SENT", attempt: second.job.attempt }, "PATCH");
  await changePrintDelivery(scope, item.id, { kind: "confirm", attempt: second.job.attempt, printed: true });
  assert.equal((await db.restaurantPrintJob.findUniqueOrThrow({ where: { id: item.id } })).status, "PRINTED");
});

test("el agente no retoma reservas vencidas y deja de operar al desactivar su sede", async () => {
  const agent = await agentFixture();
  const item = await job({ status: "PROCESSING", attempts: 1, stationId: `agent:${printerId}`, leaseExpiresAt: new Date(0) });
  assert.equal(await nextAgentPrint(agent.scope), null);
  assert.equal((await listPrintJobs(scope))[0].status, "UNKNOWN");
  await assert.rejects(agent.request(`jobs/${item.id}/status`, { status: "SENT", attempt: 1 }, "PATCH"), code("PRINT_JOB_NOT_CLAIMED"));
  await db.branch.update({ where: { id: scope.branchId }, data: { active: false } });
  await assert.rejects(agent.request("heartbeat", {}), code("INVALID_PRINT_AGENT"));
});

test("ruteo de Restaurante aísla el pedido y revierte solicitudes si falla su transacción", async () => {
  const order = await db.restaurantOrder.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, createdById: scope.actorId, code: randomUUID() } });
  const event = { orderId: order.id, type: "CANCELLATION" as const, lines: [] };
  for (const foreign of [secondScope, otherScope]) await assert.rejects(db.$transaction((tx) => createRoutedPrintJobs(tx, foreign, event)), code("NOT_FOUND"));
  await assert.rejects(db.$transaction(async (tx) => { await createRoutedPrintJobs(tx, scope, event); throw new Error("order failed"); }), /order failed/);
  assert.equal(await db.restaurantPrintJob.count({ where: { orderId: order.id } }), 0);
  await db.$transaction((tx) => createRoutedPrintJobs(tx, scope, event));
  assert.equal(await db.restaurantPrintJob.count({ where: { orderId: order.id, tenantId: scope.tenantId, branchId: scope.branchId } }), 1);
});

test("PostgreSQL: dos estaciones y dos agentes reservan un solo intento", { skip: !process.env.INVENTORY_TEST_DATABASE_URL }, async () => {
  const item = await job();
  const reservations = await Promise.all([1, 2].map((n) => changePrintDelivery(scope, item.id, { ...claim, stationId: `station-${n}` })));
  assert.equal(reservations.filter((r) => r.claimed).length, 1);
  const agent = await agentFixture(); await job();
  const jobs = await Promise.all([nextAgentPrint(agent.scope), nextAgentPrint(agent.scope)]);
  assert.equal(jobs.filter(Boolean).length, 1);
  assert.equal((await db.restaurantPrintJob.findUniqueOrThrow({ where: { id: item.id } })).attempts, 1);
});

test("PostgreSQL: confirmaciones y reintentos concurrentes no duplican la entrega", { skip: !process.env.INVENTORY_TEST_DATABASE_URL }, async () => {
  const item = await job({ status: "UNKNOWN", attempts: 1 });
  const confirmed = await Promise.allSettled([1, 2].map(() => changePrintDelivery(scope, item.id, { kind: "confirm", attempt: 1, printed: false })));
  assert.equal(confirmed.filter((r) => r.status === "fulfilled").length, 1);
  const retries = await Promise.allSettled([1, 2].map(() => changePrintDelivery(scope, item.id, { kind: "retry", attempt: 1 })));
  assert.equal(retries.filter((r) => r.status === "fulfilled").length, 1);
  const saved = await db.restaurantPrintJob.findUniqueOrThrow({ where: { id: item.id } }); assert.equal(saved.status, "PENDING"); assert.equal(saved.deliveryAttempt, 1);
});
