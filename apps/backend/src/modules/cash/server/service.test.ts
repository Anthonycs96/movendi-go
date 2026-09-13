import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test, type TestContext } from "node:test";
import { Prisma, PrismaClient } from "@prisma/client";
import { AppError } from "@/core/auth/errors";
import type { TenantScope } from "@/core/auth/types";
import { prisma } from "@/core/database/prisma";
import { handleBarbershopCommand } from "@/modules/barbershop/server/commands";
import { handleRestaurantCommand } from "@/modules/restaurant/server/commands";
import { PrismaCashRepository } from "../infrastructure/prisma/prisma-cash-repository";
import { openCashSession, closeCashSession, registerCashMovement, applyCashEffect } from "./service";

const require = createRequire(import.meta.url);
let directory: string;
let db: PrismaClient;
let scope: TenantScope;
let secondScope: TenantScope;
let otherScope: TenantScope;


before(async () => {
  const url = process.env.INVENTORY_TEST_DATABASE_URL;
  if (url) {
    const parsed = new URL(url);
    assert.equal(parsed.hostname, "127.0.0.1");
    assert.equal(parsed.pathname, "/inventory_hexagonal_test");
    assert.equal(parsed.username, "inventory_test");
    assert.ok(process.env.INVENTORY_TEST_CLIENT);
    const { PrismaClient: Client } = require(process.env.INVENTORY_TEST_CLIENT!) as { PrismaClient: typeof PrismaClient };
    db = new Client({ datasources: { db: { url } } });
  } else {
    directory = await mkdtemp(join(tmpdir(), "movendi-cash-test-"));
    await writeFile(join(directory, "cash.db"), "", { flag: "wx" });
    const url = `file:${join(directory, "cash.db").replaceAll("\\", "/")}`;
    execFileSync(process.execPath, [require.resolve("prisma/build/index.js"), "migrate", "deploy", "--schema", fileURLToPath(new URL("../../../../prisma/schema.prisma", import.meta.url))], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe", timeout: 60_000 });
    db = new PrismaClient({ datasources: { db: { url } } });
  }
  const tenant = await db.tenant.create({ data: { slug: "cash-test", name: "Ventas", shortName: "VEN", type: "RESTAURANT" } });
  const other = await db.tenant.create({ data: { slug: "cash-other", name: "Otra", shortName: "OTR", type: "BARBERSHOP" } });
  const branch = await db.branch.create({ data: { tenantId: tenant.id, name: "Principal" } });
  const second = await db.branch.create({ data: { tenantId: tenant.id, name: "Segunda" } });
  const foreign = await db.branch.create({ data: { tenantId: other.id, name: "Ajena" } });
  const actor = await db.user.create({ data: { name: "Prueba", email: "cash@test.local", passwordHash: "not-a-login" } });
  scope = { tenantId: tenant.id, branchId: branch.id, actorId: actor.id, permissions: ["*"] };
  secondScope = { ...scope, branchId: second.id };
  otherScope = { ...scope, tenantId: other.id, branchId: foreign.id };
  await db.restaurantConfiguration.create({ data: { tenantId: tenant.id, settings: JSON.stringify({ sales: { splitPaymentsEnabled: true } }) } });
});

after(async () => {
  await db?.$disconnect();
  if (directory) {
    assert.ok(resolve(directory).startsWith(`${resolve(tmpdir())}${sep}movendi-cash-test-`));
    await rm(directory, { recursive: true, force: true });
  }
});

function useDatabase(context: TestContext) {
  context.mock.method(prisma, "$transaction", db.$transaction.bind(db));
  for (const model of ["tenant", "appointment", "restaurantOrder", "cashSession", "customer", "restaurantConfiguration", "restaurantBranchConfiguration", "auditLog", "cashMovement"] as const) {
    const original = prisma[model];
    Object.defineProperty(prisma, model, { value: db[model], configurable: true });
    context.after(() => Object.defineProperty(prisma, model, { value: original, configurable: true }));
  }
}

function hasCode(code: string) { return (error: unknown) => error instanceof AppError && error.code === code; }

async function restaurant(segments: string[], body: unknown, executionScope = scope) {
  const result = await handleRestaurantCommand("POST", ["cash", ...segments], body, executionScope);
  assert.ok("id" in result && typeof result.id === "string");
  return result.id;
}

test("caracterización: apertura, ingreso, retiro y cierre conservan saldo, auditoría e idempotencia histórica", async (context) => {
  useDatabase(context);
  const opening = { openingAmount: 100, registerName: "Caja prueba", notes: "Inicio", idempotencyKey: "open-cash-test" };
  const id = await restaurant([], opening);
  assert.equal(await restaurant([], opening), id);
  const input = { type: "OUT", amount: 25, reason: "Compra menor", idempotencyKey: "cash-out-test" };
  const movementId = await restaurant([id, "movement"], input);
  assert.equal(await restaurant([id, "movement"], input), movementId);
  await restaurant([id, "movement"], { type: "IN", amount: 5, reason: "Aporte" });
  assert.equal((await db.cashSession.findUniqueOrThrow({ where: { id } })).expectedCents, 8000);
  await restaurant([id, "close"], { countedAmount: 80, expectedCents: 8000 });
  assert.equal(await restaurant([], opening), id);
  assert.equal(await restaurant([id, "movement"], input), movementId);
  assert.equal((await db.cashSession.findUniqueOrThrow({ where: { id } })).status, "CLOSED");
  assert.equal(await db.cashMovement.count({ where: { cashSessionId: id } }), 2);
  assert.equal(await db.auditLog.count({ where: { entityId: id, action: "OPEN" } }), 1);
  assert.equal(await db.auditLog.count({ where: { entityId: id, action: "CLOSE" } }), 1);
  await assert.rejects(restaurant([], { ...opening, openingAmount: 101 }), hasCode("IDEMPOTENCY_CONFLICT"));
});

test("caracterización: Caja aplica permisos, tolerancia, efectivo disponible y aislamiento", async (context) => {
  useDatabase(context);
  const id = await restaurant([], { openingAmount: 20 });
  await assert.rejects(restaurant([id, "movement"], { type: "OUT", amount: 21, reason: "Retiro" }), hasCode("CASH_UNAVAILABLE"));
  await assert.rejects(restaurant([id, "movement"], { type: "OUT", amount: 1, reason: "Retiro" }, { ...scope, permissions: [] }), hasCode("CASH_OUT_APPROVAL_REQUIRED"));
  await assert.rejects(restaurant([id, "close"], { countedAmount: 0 }, { ...scope, permissions: [] }), hasCode("CASH_DIFFERENCE_APPROVAL_REQUIRED"));
  await assert.rejects(restaurant([id, "close"], { countedAmount: 0 }), hasCode("CASH_DIFFERENCE_REASON_REQUIRED"));
  await assert.rejects(restaurant([id, "close"], { countedAmount: 20, expectedCents: 1999 }), hasCode("CASH_CHANGED"));
  for (const foreign of [secondScope, otherScope]) {
    await assert.rejects(restaurant([id, "close"], { countedAmount: 20 }, foreign), hasCode("NOT_FOUND"));
    await assert.rejects(restaurant([id, "movement"], { type: "IN", amount: 1, reason: "Ingreso" }, foreign), hasCode("NOT_FOUND"));
  }
  assert.equal((await db.cashSession.findUniqueOrThrow({ where: { id } })).expectedCents, 2000);
  await restaurant([id, "close"], { countedAmount: 20 });
});

test("caracterización: Barbería conserva apertura y diferencia de cierre sin políticas de Restaurante", async (context) => {
  useDatabase(context);
  const result = await handleBarbershopCommand("POST", ["cash"], { openingAmount: 100 }, scope);
  assert.ok(result.id);
  await assert.rejects(handleBarbershopCommand("POST", ["cash"], { openingAmount: 100 }, scope), hasCode("CASH_ALREADY_OPEN"));
  const closed = await handleBarbershopCommand("POST", ["cash", result.id, "close"], { countedAmount: 0 }, scope);
  assert.match(closed.message, /-100.00/);
  assert.equal((await db.cashSession.findUniqueOrThrow({ where: { id: result.id } })).countedCents, 0);
});

test("caracterización: fallar antes del commit revierte saldo, documento y auditoría de movimiento", async (context) => {
  useDatabase(context);
  const id = await restaurant([], { openingAmount: 10 });
  context.mock.method(prisma, "$transaction", (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) => db.$transaction(async (tx) => { await operation(tx); throw new Error("Fallo antes del commit"); }));
  await assert.rejects(restaurant([id, "movement"], { type: "OUT", amount: 5, reason: "Prueba rollback" }), /Fallo antes del commit/);
  assert.equal((await db.cashSession.findUniqueOrThrow({ where: { id } })).expectedCents, 1000);
  assert.equal(await db.cashMovement.count({ where: { cashSessionId: id } }), 0);
  assert.equal(await db.auditLog.count({ where: { action: "CASH_OUT", tenantId: scope.tenantId, metadata: { contains: id } } }), 0);
  await db.cashSession.update({ where: { id }, data: { status: "CLOSED", activeSlot: null } });
});

async function resetCash() { await db.cashSession.updateMany({ where: { tenantId: scope.tenantId }, data: { status: "CLOSED", activeSlot: null } }); }

test("puertos de Caja respetan empresa/sucursal incluso con IDs existentes", async () => {
  await resetCash();
  const { session } = await db.$transaction((tx) => openCashSession(tx, scope, { openingCents: 1000, registerName: "Caja" }));
  for (const foreign of [secondScope, otherScope]) {
    await assert.rejects(db.$transaction((tx) => closeCashSession(tx, foreign, { id: session.id, countedCents: 1000 })), hasCode("NOT_FOUND"));
    await assert.rejects(db.$transaction((tx) => registerCashMovement(tx, foreign, { cashSessionId: session.id, type: "IN", amountCents: 100, reason: "Ajeno" })), hasCode("NOT_FOUND"));
    await assert.rejects(db.$transaction((tx) => applyCashEffect(tx, foreign, session.id, 100)), hasCode("CASH_UNAVAILABLE"));
  }
  await assert.rejects(db.$transaction((tx) => openCashSession(tx, { ...scope, branchId: otherScope.branchId }, { openingCents: 0, registerName: "Ajena" })), hasCode("NOT_FOUND"));
  assert.equal((await db.cashSession.findUniqueOrThrow({ where: { id: session.id } })).expectedCents, 1000);
});

test("Barbería revierte apertura y cierre cuando falla su auditoría dentro de la transacción", async (context) => {
  useDatabase(context);
  await resetCash();
  const { session } = await db.$transaction((tx) => openCashSession(tx, scope, { openingCents: 1000, registerName: "Caja" }));
  context.mock.method(prisma, "$transaction", (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) => db.$transaction(async (tx) => {
    const wrapped = new Proxy(tx, { get(target, property) {
      if (property === "auditLog") return { create: async () => { throw new Error("Auditoría no disponible"); } };
      return Reflect.get(target, property);
    } });
    return operation(wrapped);
  }));
  await assert.rejects(handleBarbershopCommand("POST", ["cash", session.id, "close"], { countedAmount: 10 }, scope), /Auditoría no disponible/);
  assert.equal((await db.cashSession.findUniqueOrThrow({ where: { id: session.id } })).status, "OPEN");
  await resetCash();
  await assert.rejects(handleBarbershopCommand("POST", ["cash"], { openingAmount: 10 }, scope), /Auditoría no disponible/);
  assert.equal(await db.cashSession.count({ where: { tenantId: scope.tenantId, status: "OPEN" } }), 0);
});

test("dos sucursales pueden reutilizar claves de apertura y movimiento sin compartir saldo", async () => {
  await resetCash();
  const ids: string[] = [];
  for (const current of [scope, secondScope]) {
    const { session } = await db.$transaction((tx) => openCashSession(tx, current, { openingCents: 1000, registerName: "Caja", idempotencyKey: "same-open-key" }));
    ids.push(session.id);
    await db.$transaction((tx) => registerCashMovement(tx, current, { cashSessionId: session.id, type: "OUT", amountCents: 100, reason: "Retiro", idempotencyKey: "same-move-key" }));
    assert.equal((await db.cashSession.findUniqueOrThrow({ where: { id: session.id } })).expectedCents, 900);
  }
  assert.notEqual(ids[0], ids[1]);
});

function synchronizeReads(context: TestContext, method: "findSession" | "findOpenSession") {
  let arrived = 0;
  let timedOut = false;
  let release!: () => void;
  const gate = new Promise<void>((resolveGate) => { release = resolveGate; });
  const timeout = setTimeout(() => { timedOut = true; release(); }, 10_000);
  context.after(() => clearTimeout(timeout));
  const original = PrismaCashRepository.prototype[method];
  context.mock.method(PrismaCashRepository.prototype, method, async function (this: PrismaCashRepository, id: string) {
    const value = await original.call(this, id);
    if (arrived < 2) { arrived++; if (arrived === 2) release(); await gate; }
    return value;
  });
  return () => { assert.equal(timedOut, false, "Las operaciones deben llegar juntas a la barrera"); assert.equal(arrived, 2); };
}

test("PostgreSQL: aperturas simultáneas de Barbería reservan una sola caja", { skip: !process.env.INVENTORY_TEST_DATABASE_URL }, async (context) => {
  useDatabase(context); await resetCash();
  const synchronized = synchronizeReads(context, "findOpenSession");
  const results = await Promise.allSettled([1, 2].map(() => handleBarbershopCommand("POST", ["cash"], { openingAmount: 10 }, scope)));
  synchronized();
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.ok(results.some((result) => result.status === "rejected" && hasCode("CASH_ALREADY_OPEN")(result.reason)));
  assert.equal(await db.cashSession.count({ where: { tenantId: scope.tenantId, branchId: scope.branchId, status: "OPEN", activeSlot: "OPEN" } }), 1);
});

test("PostgreSQL: apertura con misma clave devuelve una caja y una auditoría", { skip: !process.env.INVENTORY_TEST_DATABASE_URL }, async (context) => {
  useDatabase(context); await resetCash();
  const synchronized = synchronizeReads(context, "findOpenSession");
  const ids = await Promise.all([1, 2].map(() => restaurant([], { openingAmount: 100, idempotencyKey: "parallel-open" })));
  synchronized(); assert.equal(ids[0], ids[1]);
  assert.equal(await db.auditLog.count({ where: { entityId: ids[0], action: "OPEN" } }), 1);
});

test("PostgreSQL: retiros simultáneos no gastan dos veces el efectivo disponible", { skip: !process.env.INVENTORY_TEST_DATABASE_URL }, async (context) => {
  useDatabase(context); await resetCash();
  const id = await restaurant([], { openingAmount: 100 });
  const synchronized = synchronizeReads(context, "findSession");
  const results = await Promise.allSettled([1, 2].map(() => restaurant([id, "movement"], { type: "OUT", amount: 70, reason: "Retiro simultáneo" })));
  synchronized();
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.ok(results.some((result) => result.status === "rejected" && hasCode("CASH_UNAVAILABLE")(result.reason)));
  assert.equal((await db.cashSession.findUniqueOrThrow({ where: { id } })).expectedCents, 3000);
  assert.equal(await db.cashMovement.count({ where: { cashSessionId: id } }), 1);
});

test("PostgreSQL: movimiento repetido concurrente se confirma una sola vez", { skip: !process.env.INVENTORY_TEST_DATABASE_URL }, async (context) => {
  useDatabase(context); await resetCash();
  const id = await restaurant([], { openingAmount: 100 });
  const synchronized = synchronizeReads(context, "findSession");
  const ids = await Promise.all([1, 2].map(() => restaurant([id, "movement"], { type: "OUT", amount: 20, reason: "Idempotente", idempotencyKey: "parallel-move" })));
  synchronized(); assert.equal(ids[0], ids[1]);
  assert.equal((await db.cashSession.findUniqueOrThrow({ where: { id } })).expectedCents, 8000);
  assert.equal(await db.auditLog.count({ where: { entityId: ids[0], action: "CASH_OUT" } }), 1);
});

test("PostgreSQL: cierre y movimiento concurrentes no confirman un saldo desactualizado", { skip: !process.env.INVENTORY_TEST_DATABASE_URL }, async (context) => {
  useDatabase(context); await resetCash();
  const id = await restaurant([], { openingAmount: 100 });
  const synchronized = synchronizeReads(context, "findSession");
  const results = await Promise.allSettled([
    restaurant([id, "close"], { countedAmount: 100, expectedCents: 10000 }),
    restaurant([id, "movement"], { type: "IN", amount: 10, reason: "Aporte simultáneo" }),
  ]);
  synchronized();
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const cash = await db.cashSession.findUniqueOrThrow({ where: { id } });
  if (cash.status === "CLOSED") { assert.equal(cash.expectedCents, 10000); assert.equal(await db.cashMovement.count({ where: { cashSessionId: id } }), 0); }
  else { assert.equal(cash.expectedCents, 11000); assert.equal(cash.countedCents, null); }
});
