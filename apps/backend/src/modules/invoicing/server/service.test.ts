import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, test, type TestContext } from "node:test";
import { PrismaClient, type Prisma } from "@prisma/client";
import { prisma } from "@/core/database/prisma";
import { AppError } from "@/core/auth/errors";
import type { TenantScope } from "@/core/auth/types";
import { issueFullRefundCreditNote } from "./credit-note";
import { issueElectronicDocument } from "./service";
import { claimLegacyDocument, PrismaDocumentDelivery, reserveDocumentNumber } from "../infrastructure/prisma/document-repository";
import { saveSunatCredentials } from "../infrastructure/nubefact";
import { documentPayload, type DocumentKind, type FiscalConfiguration, type FiscalSource } from "../domain/document";
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
    directory = await mkdtemp(join(tmpdir(), "movendi-invoicing-test-"));
    await writeFile(join(directory, "minimarket.db"), "", { flag: "wx" });
    const url = `file:${join(directory, "minimarket.db").replaceAll("\\", "/")}`;
    execFileSync(process.execPath, [require.resolve("prisma/build/index.js"), "migrate", "deploy", "--schema", fileURLToPath(new URL("../../../../prisma/schema.prisma", import.meta.url))], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe", timeout: 60_000 });
    db = new PrismaClient({ datasources: { db: { url } } });
  }
});
after(async () => { await db?.$disconnect(); if (directory) { assert.ok(resolve(directory).startsWith(`${resolve(tmpdir())}${sep}movendi-invoicing-test-`)); await rm(directory, { recursive: true, force: true }); } });


let saleId: string;
const configuration = { enabled: true, environment: "BETA" as const, invoiceSeries: "F001", receiptSeries: "B001" };
let source: FiscalSource;
const load = async () => source;
// Pre-outbox fixture. New documents must be reserved through the shared queue.
async function claimDocument(executionScope: TenantScope, id: string, kind: DocumentKind, config: FiscalConfiguration, loader: () => Promise<FiscalSource>) {
  if (!await db.restaurantElectronicDocument.findUnique({ where: { saleId: id } })) {
    await db.$transaction(async (tx) => {
      const series = kind === "FACTURA" ? config.invoiceSeries : config.receiptSeries;
      const number = await reserveDocumentNumber(tx, executionScope, kind, series);
      await tx.restaurantElectronicDocument.create({ data: { tenantId: executionScope.tenantId, branchId: executionScope.branchId, saleId: id, kind, series, number, provider: "NUBEFACT", environment: config.environment, status: "UNKNOWN", requestPayload: JSON.stringify(documentPayload(await loader(), kind, series, number, config.environment)) } });
    });
  }
  return claimLegacyDocument(executionScope, id, kind, config);
}
const code = (expected: string) => (error: unknown) => error instanceof AppError && error.code === expected;
const accepted = () => Response.json({ aceptada_por_sunat: true, codigo_hash: "test-hash", enlace_del_pdf: "https://example.com/test.pdf" });
beforeEach(async (hook) => {
  const context = hook as TestContext;
  context.mock.method(prisma, "$transaction", db.$transaction.bind(db));
  for (const model of ["restaurantElectronicDocument", "restaurantIntegrationCredential", "saleRefund", "auditLog", "fiscalJob"] as const) {
    const original = prisma[model]; Object.defineProperty(prisma, model, { value: db[model], configurable: true });
    context.after(() => Object.defineProperty(prisma, model, { value: original, configurable: true }));
  }
  const previousKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  process.env.INTEGRATION_ENCRYPTION_KEY = "test-only-key-for-disposable-database-12345";
  context.after(() => { if (previousKey === undefined) delete process.env.INTEGRATION_ENCRYPTION_KEY; else process.env.INTEGRATION_ENCRYPTION_KEY = previousKey; });
  const suffix = randomUUID();
  const tenant = await db.tenant.create({ data: { slug: suffix, name: "Tienda", shortName: "MM", type: "MINIMARKET" } });
  const other = await db.tenant.create({ data: { slug: "other-"+suffix, name: "Otra", shortName: "OT", type: "MINIMARKET" } });
  const branch = await db.branch.create({ data: { tenantId: tenant.id, name: "Principal" } });
  const second = await db.branch.create({ data: { tenantId: tenant.id, name: "Segunda" } });
  const foreign = await db.branch.create({ data: { tenantId: other.id, name: "Ajena" } });
  const user = await db.user.create({ data: { email: suffix+"@test.local", name: "Test", passwordHash: "not-a-login" } });
  scope = { tenantId: tenant.id, branchId: branch.id, actorId: user.id, permissions: ["*"] };
  secondScope = { ...scope, branchId: second.id }; otherScope = { ...scope, tenantId: other.id, branchId: foreign.id };
  const retail = await db.retailSale.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId } });
  const sale = await db.sale.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, retailSaleId: retail.id, code: suffix, status: "PAID", paymentMethod: "CASH", totalCents: 1180 } }); saleId = sale.id;
  source = { code: sale.code, date: sale.createdAt, currency: "PEN", totalCents: 1180, customerName: "Cliente", customerDocument: "", taxRatePct: 18, lines: [{ productId: "item", name: "Producto", quantity: 1, totalCents: 1180, taxCategory: "GRAVADA" }] };
  await saveSunatCredentials(scope, { apiUrl: "https://api.nubefact.com/api/v1/test-local-only", environment: "BETA", token: "test-token-never-a-live-credential" });
  // Any unmocked fetch is a test failure, never a real fiscal request.
  context.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected network call"); });
});

test("emisor compartido acepta origen retail, conserva trama y no duplica correlativo", async (context) => {
  const requests: Record<string, unknown>[] = [];
  context.mock.method(globalThis, "fetch", async (_url: string | URL | Request, options?: RequestInit) => { requests.push(JSON.parse(String(options?.body))); return accepted(); });
  const document = await issueElectronicDocument(scope, saleId, "BOLETA", configuration, load);
  assert.equal(document.status, "ISSUED"); assert.equal(document.number, 1);
  source.totalCents = 99999;
  const replay = await issueElectronicDocument(scope, saleId, "BOLETA", configuration, load);
  assert.equal(replay.id, document.id); assert.equal(requests.length, 1); assert.equal(requests[0].total, 11.8);
  assert.equal(await db.restaurantElectronicDocument.count({ where: { tenantId: scope.tenantId } }), 1);
});

test("aislamiento de empresa/sucursal y ambiente/tipo bloqueados", async (context) => {
  context.mock.method(globalThis, "fetch", async () => accepted());
  await assert.rejects(issueElectronicDocument(secondScope, saleId, "BOLETA", configuration, load), code("SALE_NOT_PAID"));
  await assert.rejects(issueElectronicDocument(otherScope, saleId, "BOLETA", configuration, load), code("SALE_NOT_PAID"));
  await assert.rejects(issueElectronicDocument(scope, saleId, "BOLETA", { ...configuration, environment: "PRODUCTION" }, load), code("SUNAT_ENVIRONMENT_MISMATCH"));
  await issueElectronicDocument(scope, saleId, "BOLETA", configuration, load);
  await assert.rejects(issueElectronicDocument(scope, saleId, "FACTURA", configuration, load), code("DOCUMENT_KIND_LOCKED"));
  await assert.rejects(issueElectronicDocument(scope, saleId, "BOLETA", { ...configuration, environment: "PRODUCTION" }, load), code("DOCUMENT_ENVIRONMENT_LOCKED"));
});

test("clasificación inválida revierte reserva, documento y auditoría", async () => {
  source.lines[0].taxCategory = "UNCLASSIFIED";
  await assert.rejects(issueElectronicDocument(scope, saleId, "BOLETA", configuration, load), code("FISCAL_CLASSIFICATION"));
  assert.equal(await db.restaurantElectronicDocument.count({ where: { tenantId: scope.tenantId } }), 0);
  assert.equal(await db.restaurantDocumentSequence.count({ where: { tenantId: scope.tenantId } }), 0);
  assert.equal(await db.fiscalJob.count({ where: { saleId } }), 0);
  assert.equal(await db.auditLog.count({ where: { tenantId: scope.tenantId, action: "FISCAL_QUEUED" } }), 0);
});

test("timeout queda incierto; reintento consulta identidad reservada sin regenerar", async (context) => {
  context.mock.method(globalThis, "fetch", async () => { throw new Error("Connection lost after send"); });
  await assert.rejects(issueElectronicDocument(scope, saleId, "BOLETA", configuration, load), code("SUNAT_UNCONFIRMED"));
  assert.equal((await db.restaurantElectronicDocument.findUniqueOrThrow({ where: { saleId } })).status, "UNKNOWN");
  source.lines[0].name = "Nombre cambiado";
  const calls: Record<string, unknown>[] = [];
  context.mock.method(globalThis, "fetch", async (_url: string | URL | Request, options?: RequestInit) => { calls.push(JSON.parse(String(options?.body))); return accepted(); });
  const result = await issueElectronicDocument(scope, saleId, "BOLETA", configuration, load);
  assert.equal(result.status, "ISSUED"); assert.equal(result.attempts, 2);
  assert.deepEqual(calls, [{ operacion: "consultar_comprobante", tipo_de_comprobante: 2, serie: "B001", numero: 1 }]);
  assert.equal(JSON.parse(result.requestPayload!).items[0].descripcion, "Producto");
});

test("error ambiguo de consulta no autoriza otro envío", async (context) => {
  const reserved = await claimDocument(scope, saleId, "BOLETA", configuration, load);
  await new PrismaDocumentDelivery(scope, reserved).uncertain("timeout");
  let calls = 0;
  context.mock.method(globalThis, "fetch", async (_url: string | URL | Request, options?: RequestInit) => { calls++; assert.equal(JSON.parse(String(options?.body)).operacion, "consultar_comprobante"); return Response.json({ errors: "No se pudo completar la operación", codigo: 21 }); });
  await assert.rejects(issueElectronicDocument(scope, saleId, "BOLETA", configuration, load), code("SUNAT_UNCONFIRMED"));
  assert.equal(calls, 1);
});

test("legacy sin contador de intentos consulta antes de reenviar y nunca se renumera", async (context) => {
  const previous = await claimDocument(scope, saleId, "BOLETA", configuration, load);
  await db.restaurantElectronicDocument.update({ where: { id: previous.id }, data: { status: "FAILED", attempts: 0 } });
  let requests = 0;
  context.mock.method(globalThis, "fetch", async (_url: unknown, options?: RequestInit) => { requests++; assert.equal(JSON.parse(String(options?.body)).operacion, "consultar_comprobante"); return accepted(); });
  const recovered = await issueElectronicDocument(scope, saleId, "BOLETA", configuration, load);
  assert.equal(recovered.id, previous.id); assert.equal(recovered.number, previous.number);
  assert.equal(requests, 1); assert.equal(await db.fiscalJob.count({ where: { saleId } }), 0);
});

test("respuesta null o inválida en consulta no se interpreta como ausencia", async (context) => {
  const reserved = await claimDocument(scope, saleId, "BOLETA", configuration, load);
  await new PrismaDocumentDelivery(scope, reserved).uncertain("timeout");
  for (const raw of ["null", "[]", '"texto"', "no-json", ""]) {
    let calls = 0;
    context.mock.method(globalThis, "fetch", async (_url: string | URL | Request, options?: RequestInit) => { calls++; assert.equal(JSON.parse(String(options?.body)).operacion, "consultar_comprobante"); return new Response(raw); });
    await assert.rejects(issueElectronicDocument(scope, saleId, "BOLETA", configuration, load), code("SUNAT_INVALID_RESPONSE"));
    assert.equal(calls, 1);
  }
});

test("auditoría fallida revierte aceptación local y permite conciliación", async (context) => {
  const reserved = await claimDocument(scope, saleId, "BOLETA", configuration, load);
  const transaction = db.$transaction.bind(db);
  context.mock.method(prisma, "$transaction", async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: { isolationLevel?: Prisma.TransactionIsolationLevel }) => transaction(async (tx) => {
    const proxy = Object.create(tx); proxy.auditLog = { create: async () => { throw new Error("audit unavailable"); } };
    return callback(proxy);
  }, options));
  await assert.rejects(new PrismaDocumentDelivery(scope, reserved).complete({ aceptada_por_sunat: true }, "ISSUED"), /audit unavailable/);
  assert.equal((await db.restaurantElectronicDocument.findUniqueOrThrow({ where: { saleId } })).status, "SENDING");
});

test("lease anterior no puede sobrescribir aceptación nueva ni registrar un falso fallo", async () => {
  const old = await claimDocument(scope, saleId, "BOLETA", configuration, load);
  await db.restaurantElectronicDocument.update({ where: { id: old.id }, data: { updatedAt: new Date(Date.now() - 120000) } });
  const fresh = await claimDocument(scope, saleId, "BOLETA", configuration, load);
  await new PrismaDocumentDelivery(scope, fresh).complete({ aceptada_por_sunat: true }, "ISSUED");
  await new PrismaDocumentDelivery(scope, old).uncertain("late timeout");
  await assert.rejects(new PrismaDocumentDelivery(scope, old).complete({}, "SUBMITTED"), code("DOCUMENT_LEASE_LOST"));
  assert.equal((await db.restaurantElectronicDocument.findUniqueOrThrow({ where: { saleId } })).status, "ISSUED");
});

test("ruta almacenada inválida no recibe token", async () => {
  await db.restaurantIntegrationCredential.update({ where: { tenantId_provider: { tenantId: scope.tenantId, provider: "NUBEFACT" } }, data: { apiUrl: "https://example.com/steal" } });
  await assert.rejects(issueElectronicDocument(scope, saleId, "BOLETA", configuration, load), code("SUNAT_INVALID_ROUTE"));
});

test("PostgreSQL: solicitudes simultáneas reservan y envían una sola vez", { skip: !process.env.INVENTORY_TEST_DATABASE_URL }, async (context) => {
  let calls = 0;
  context.mock.method(globalThis, "fetch", async () => { calls++; return accepted(); });
  const results = await Promise.allSettled([1, 2, 3].map(() => issueElectronicDocument(scope, saleId, "BOLETA", configuration, load)));
  assert.ok(results.some((result) => result.status === "fulfilled"));
  for (const result of results) if (result.status === "rejected") assert.ok(code("DOCUMENT_BUSY")(result.reason));
  assert.equal(calls, 1); assert.equal(await db.restaurantElectronicDocument.count({ where: { tenantId: scope.tenantId } }), 1);
  assert.equal((await db.restaurantDocumentSequence.findFirstOrThrow({ where: { tenantId: scope.tenantId } })).nextNumber, 2);
});

test("ausencia explícita permite reenviar exactamente el mismo documento", async (context) => {
  const reserved = await claimDocument(scope, saleId, "BOLETA", configuration, load);
  await new PrismaDocumentDelivery(scope, reserved).uncertain("send interrupted");
  const calls: Record<string, unknown>[] = [];
  context.mock.method(globalThis, "fetch", async (_url: string | URL | Request, options?: RequestInit) => { const body = JSON.parse(String(options?.body)); calls.push(body); return body.operacion === "consultar_comprobante" ? Response.json({ errors: "Documento no existe", codigo: 24 }, { status: 400 }) : accepted(); });
  source.totalCents = 20000;
  const result = await issueElectronicDocument(scope, saleId, "BOLETA", configuration, load);
  assert.equal(result.status, "ISSUED"); assert.equal(calls.length, 2); assert.deepEqual(calls[1], JSON.parse(reserved.requestPayload!));
});

async function refundedDocument() {
  const original = await claimDocument(scope, saleId, "BOLETA", configuration, load);
  await new PrismaDocumentDelivery(scope, original).complete({ aceptada_por_sunat: true }, "ISSUED");
  await db.sale.update({ where: { id: saleId }, data: { status: "REFUNDED" } });
  await db.saleRefund.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, saleId, actorId: scope.actorId, reason: "Devolución de prueba", stockDisposition: "WASTE", totalCents: 1180, cashCents: 1180, payments: "[]", creditStatus: "PENDING" } });
}

test("nota total conserva la trama original, aísla sucursal y concilia tras timeout", async (context) => {
  await refundedDocument();
  await db.saleRefund.update({ where: { saleId }, data: { totalCents: 1000 } });
  await assert.rejects(issueFullRefundCreditNote(scope, saleId), code("FULL_REFUND_REQUIRED"));
  await db.saleRefund.update({ where: { saleId }, data: { totalCents: 1180 } });
  await assert.rejects(issueFullRefundCreditNote(secondScope, saleId), code("REFUND_REQUIRED"));
  await assert.rejects(issueFullRefundCreditNote(otherScope, saleId), code("REFUND_REQUIRED"));
  context.mock.method(globalThis, "fetch", async () => { throw new Error("note timeout"); });
  await assert.rejects(issueFullRefundCreditNote(scope, saleId), /note timeout/);
  const before = await db.saleRefund.findUniqueOrThrow({ where: { saleId } }); assert.equal(before.creditStatus, "UNKNOWN");
  let calls = 0;
  context.mock.method(globalThis, "fetch", async (_url: string | URL | Request, options?: RequestInit) => { calls++; assert.deepEqual(JSON.parse(String(options?.body)), { operacion: "consultar_comprobante", tipo_de_comprobante: 3, serie: before.creditSeries, numero: before.creditNumber }); return accepted(); });
  await issueFullRefundCreditNote(scope, saleId); await issueFullRefundCreditNote(scope, saleId);
  const after = await db.saleRefund.findUniqueOrThrow({ where: { saleId } });
  assert.equal(after.creditStatus, "ISSUED"); assert.equal(after.creditPayload, before.creditPayload); assert.equal(calls, 1);
});

test("PostgreSQL: dos notas simultáneas comparten reserva y un envío", { skip: !process.env.INVENTORY_TEST_DATABASE_URL }, async (context) => {
  await refundedDocument(); let calls = 0;
  context.mock.method(globalThis, "fetch", async () => { calls++; return accepted(); });
  const results = await Promise.allSettled([issueFullRefundCreditNote(scope, saleId), issueFullRefundCreditNote(scope, saleId)]);
  assert.ok(results.some((r) => r.status === "fulfilled"));
  for (const result of results) if (result.status === "rejected") assert.ok(code("CREDIT_NOTE_BUSY")(result.reason));
  assert.equal(calls, 1);
  assert.equal((await db.restaurantDocumentSequence.findFirstOrThrow({ where: { tenantId: scope.tenantId, kind: "CREDIT_NOTE" } })).nextNumber, 2);
});

test("ruta fiscal interna exige credencial y limita el lote antes de acceder a la cola", async (context) => {
  const { POST } = await import("@/app/api/internal/jobs/fiscal/route");
  const { assertJobRunnerSecret } = await import("@/core/maintenance/authorization");
  const original = process.env.JOB_RUNNER_SECRET;
  context.after(() => { if (original === undefined) delete process.env.JOB_RUNNER_SECRET; else process.env.JOB_RUNNER_SECRET = original; });
  let calls = 0;
  Object.defineProperty(prisma, "fiscalJob", { configurable: true, value: { findMany: async (args: { take?: number }) => { calls++; assert.equal(args.take, 1); return []; } } });
  const request = (secret: string) => new Request("http://localhost/api/internal/jobs/fiscal", { method: "POST", headers: { "X-Job-Runner-Secret": secret } });
  delete process.env.JOB_RUNNER_SECRET;
  assert.throws(() => assertJobRunnerSecret(request("wrong")), code("JOB_RUNNER_NOT_CONFIGURED"));
  process.env.JOB_RUNNER_SECRET = "fiscal-runner-local-test-secret";
  assert.throws(() => assertJobRunnerSecret(request("wrong")), code("UNAUTHORIZED"));
  assert.equal(calls, 0);
  const response = await POST(request(process.env.JOB_RUNNER_SECRET));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, scanned: 0, completed: 0 });
  assert.equal(calls, 1);
});
