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
import { recordSale } from "./service";
import type { CommercialSnapshot, RecordSaleInput } from "../public";
import { saveSunatCredentials } from "@/modules/invoicing/server/connection";
import { deliverFiscalJob } from "@/modules/invoicing/server/outbox";
import { refundRestaurantSale } from "@/modules/restaurant/server/refunds";

const require = createRequire(import.meta.url);
let directory: string;
let db: PrismaClient;
let scope: TenantScope;
let secondScope: TenantScope;
let otherScope: TenantScope;
let sequence = 0;

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
    directory = await mkdtemp(join(tmpdir(), "movendi-sales-test-"));
    await writeFile(join(directory, "sales.db"), "", { flag: "wx" });
    const url = `file:${join(directory, "sales.db").replaceAll("\\", "/")}`;
    execFileSync(process.execPath, [require.resolve("prisma/build/index.js"), "migrate", "deploy", "--schema", fileURLToPath(new URL("../../../../prisma/schema.prisma", import.meta.url))], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe", timeout: 60_000 });
    db = new PrismaClient({ datasources: { db: { url } } });
  }
  const tenant = await db.tenant.create({ data: { slug: "sales-test", name: "Ventas", shortName: "VEN", type: "RESTAURANT", paymentMethods: JSON.stringify(["CASH", "CARD", "TRANSFER", "YAPE", "PLIN", "OTHER"]) } });
  const other = await db.tenant.create({ data: { slug: "sales-other", name: "Otra", shortName: "OTR", type: "BARBERSHOP" } });
  const branch = await db.branch.create({ data: { tenantId: tenant.id, name: "Principal" } });
  const second = await db.branch.create({ data: { tenantId: tenant.id, name: "Segunda" } });
  const foreign = await db.branch.create({ data: { tenantId: other.id, name: "Ajena" } });
  const actor = await db.user.create({ data: { name: "Prueba", email: "sales@test.local", passwordHash: "not-a-login" } });
  scope = { tenantId: tenant.id, branchId: branch.id, actorId: actor.id, permissions: ["*"] };
  secondScope = { ...scope, branchId: second.id };
  otherScope = { ...scope, tenantId: other.id, branchId: foreign.id };
  await db.restaurantConfiguration.create({ data: { tenantId: tenant.id, settings: JSON.stringify({ sales: { splitPaymentsEnabled: true } }) } });
});

after(async () => {
  await db?.$disconnect();
  if (directory) {
    assert.ok(resolve(directory).startsWith(`${resolve(tmpdir())}${sep}movendi-sales-test-`));
    await rm(directory, { recursive: true, force: true });
  }
});

function bindTestDatabase(context: TestContext) {
  context.mock.method(prisma, "$transaction", db.$transaction.bind(db));
  for (const model of ["tenant", "appointment", "product", "promotion", "restaurantOrderRequest", "restaurantOrder", "kitchenTicket", "cashSession", "customer", "restaurantConfiguration", "restaurantBranchConfiguration", "auditLog", "restaurantIntegrationCredential", "restaurantElectronicDocument", "fiscalJob", "membership", "saleRefund"] as const) {
    const original = prisma[model];
    Object.defineProperty(prisma, model, { value: db[model], configurable: true });
    context.after(() => Object.defineProperty(prisma, model, { value: original, configurable: true }));
  }
}

function hasCode(code: string) { return (error: unknown) => error instanceof AppError && error.code === code; }

async function fiscalRestaurant(context: TestContext) {
  bindTestDatabase(context);
  const key = process.env.INTEGRATION_ENCRYPTION_KEY;
  process.env.INTEGRATION_ENCRYPTION_KEY = "disposable-restaurant-fiscal-test-key";
  const configuration = await db.restaurantConfiguration.findUniqueOrThrow({ where: { tenantId: scope.tenantId } });
  context.after(async () => {
    if (key === undefined) delete process.env.INTEGRATION_ENCRYPTION_KEY; else process.env.INTEGRATION_ENCRYPTION_KEY = key;
    await db.restaurantConfiguration.update({ where: { tenantId: scope.tenantId }, data: { settings: configuration.settings } });
  });
  context.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected external fiscal request"); });
  await saveSunatCredentials(scope, { environment: "BETA", apiUrl: "https://api.nubefact.com/api/v1/restaurant-test-only", token: "disposable-token-never-live" });
  await db.restaurantConfiguration.update({ where: { tenantId: scope.tenantId }, data: { settings: JSON.stringify({ sales: { splitPaymentsEnabled: true }, integrations: { sunatEnabled: true, sunatAutoIssue: true, sunatEnvironment: "BETA" } }) } });
  const cash = await openCash();
  const origin = await order();
  const buyer = await db.customer.create({ data: { tenantId: scope.tenantId, name: "Comprador histórico", dni: `20${String(++sequence).padStart(9, "0")}`, documentType: "RUC" } });
  await db.restaurantOrder.update({ where: { id: origin.id }, data: { customerId: buyer.id, taxRatePct: 18, taxIncluded: true } });
  const item = await db.inventoryItem.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, sku: `FISCAL-${++sequence}`, name: "Insumo reservado", stock: 8 } });
  const movement = await db.inventoryMovement.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, itemId: item.id, orderId: origin.id, type: "ORDER_RESERVATION", direction: "OUT", quantity: 2, stockBefore: 10, stockAfter: 8 } });
  return { cash, origin, buyer, item, movement };
}

const refundInput = { reason: "Devolución fiscal de prueba", stockDisposition: "RESTOCK", paymentConfirmed: true };
const acceptedFiscal = () => Response.json({ aceptada_por_sunat: true, enlace_del_pdf: "https://example.com/accepted.pdf" });

test("Restaurante fiscal: cobro guarda la intención sin HTTP; reintento conserva comprador y trama", async (context) => {
  const { cash, origin, buyer, movement } = await fiscalRestaurant(context);
  const result = await handleRestaurantCommand("POST", ["orders", origin.id, "checkout"], { paymentMethod: "CASH" }, scope);
  assert.ok("id" in result && result.id);
  const job = await db.fiscalJob.findFirstOrThrow({ where: { saleId: result.id } });
  assert.equal(job.status, "PENDING"); assert.equal(job.attempts, 0); assert.equal(job.kind, "FACTURA");
  assert.equal(JSON.parse(job.payload).cliente_denominacion, buyer.name);
  assert.equal((await db.cashSession.findUniqueOrThrow({ where: { id: cash.id } })).expectedCents, 1100);
  assert.equal((await db.inventoryMovement.findUniqueOrThrow({ where: { id: movement.id } })).type, "SALE_CONSUMPTION");
  for (const foreign of [secondScope, otherScope]) {
    await assert.rejects(deliverFiscalJob(foreign, job.id, true), hasCode("NOT_FOUND"));
    await assert.rejects(refundRestaurantSale(foreign, result.id, refundInput), hasCode("NOT_FOUND"));
  }
  await assert.rejects(refundRestaurantSale(scope, result.id, refundInput), hasCode("FISCAL_STATUS_PENDING"));
  await db.customer.update({ where: { id: buyer.id }, data: { name: "Cliente modificado", dni: `20${String(++sequence).padStart(9, "0")}` } });
  context.mock.method(globalThis, "fetch", async () => { throw new Error("Network lost after send"); });
  await assert.rejects(deliverFiscalJob(scope, job.id, true), /Network lost/);
  assert.equal((await db.sale.findUniqueOrThrow({ where: { id: result.id } })).status, "PAID");
  const requests: Record<string, unknown>[] = [];
  context.mock.method(globalThis, "fetch", async (_url: unknown, options?: RequestInit) => { requests.push(JSON.parse(String(options?.body))); return acceptedFiscal(); });
  const manual = await handleRestaurantCommand("POST", ["sales", result.id, "electronic-document"], { kind: "FACTURA" }, scope);
  assert.ok("ok" in manual && manual.ok);
  assert.equal(requests.length, 1); assert.equal(requests[0].operacion, "consultar_comprobante");
  assert.equal((await db.fiscalJob.findUniqueOrThrow({ where: { id: job.id } })).payload, job.payload);
  assert.equal((await db.restaurantElectronicDocument.findUniqueOrThrow({ where: { saleId: result.id } })).status, "ISSUED");
  await assert.rejects(handleRestaurantCommand("POST", ["orders", origin.id, "checkout"], { paymentMethod: "CASH" }, scope), hasCode("ALREADY_PAID"));
  assert.equal(await db.fiscalJob.count({ where: { saleId: result.id } }), 1);
});

test("Restaurante fiscal: clasificación o fallo al reservar revierten venta, caja e inventario", async (context) => {
  const { cash, origin, movement } = await fiscalRestaurant(context);
  const countersBefore = await db.restaurantDocumentSequence.findMany({ where: { tenantId: scope.tenantId } });
  await db.orderItem.updateMany({ where: { orderId: origin.id }, data: { taxCategory: "UNCLASSIFIED" } });
  await assert.rejects(handleRestaurantCommand("POST", ["orders", origin.id, "checkout"], { paymentMethod: "CASH" }, scope), hasCode("FISCAL_CLASSIFICATION"));
  await db.orderItem.updateMany({ where: { orderId: origin.id }, data: { taxCategory: "GRAVADA" } });
  context.mock.method(prisma, "$transaction", (operation: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: { isolationLevel?: Prisma.TransactionIsolationLevel }) => db.$transaction(async (tx) => {
    const auditCreate = tx.auditLog.create.bind(tx.auditLog);
    const proxy = new Proxy(tx, { get(target, key) { return key === "auditLog" ? { create: async (input: Prisma.AuditLogCreateArgs) => { if (input.data.action === "FISCAL_QUEUED") throw new Error("Outbox audit unavailable"); return auditCreate(input); } } : Reflect.get(target, key); } });
    return operation(proxy);
  }, options));
  await assert.rejects(handleRestaurantCommand("POST", ["orders", origin.id, "checkout"], { paymentMethod: "CASH" }, scope), /Outbox audit unavailable/);
  assert.equal(await db.sale.count({ where: { orderId: origin.id } }), 0);
  assert.equal((await db.cashSession.findUniqueOrThrow({ where: { id: cash.id } })).expectedCents, 100);
  assert.equal((await db.restaurantOrder.findUniqueOrThrow({ where: { id: origin.id } })).status, origin.status);
  const stock = await db.inventoryMovement.findUniqueOrThrow({ where: { id: movement.id } });
  assert.equal(stock.type, "ORDER_RESERVATION"); assert.equal(stock.saleId, null);
  assert.deepEqual(await db.restaurantDocumentSequence.findMany({ where: { tenantId: scope.tenantId } }), countersBefore);
});

test("Restaurante fiscal: devolución y nota total son atómicas, idempotentes y recuperables", async (context) => {
  const { origin, cash, item } = await fiscalRestaurant(context);
  const result = await handleRestaurantCommand("POST", ["orders", origin.id, "checkout"], { paymentMethod: "CASH" }, scope);
  assert.ok("id" in result && result.id);
  const original = await db.fiscalJob.findFirstOrThrow({ where: { saleId: result.id } });
  context.mock.method(globalThis, "fetch", async () => acceptedFiscal());
  await deliverFiscalJob(scope, original.id, true);
  const first = await refundRestaurantSale(scope, result.id, refundInput);
  const replay = await refundRestaurantSale(scope, result.id, refundInput);
  assert.equal(first.id, replay.id);
  const note = await db.fiscalJob.findFirstOrThrow({ where: { saleId: result.id, kind: "CREDIT_NOTE" } });
  assert.equal(await db.fiscalJob.count({ where: { saleId: result.id, kind: "CREDIT_NOTE" } }), 1);
  assert.equal((await db.cashSession.findUniqueOrThrow({ where: { id: cash.id } })).expectedCents, 100);
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })).stock, 10);
  assert.equal(JSON.parse(note.payload).tipo_de_nota_de_credito, 6);
  assert.deepEqual(JSON.parse(note.payload).items, JSON.parse(original.payload).items);
  assert.equal(note.apiUrl, original.apiUrl);
  context.mock.method(globalThis, "fetch", async () => { throw new Error("Note timeout"); });
  await assert.rejects(deliverFiscalJob(scope, note.id, true), /Note timeout/);
  assert.equal((await db.saleRefund.findUniqueOrThrow({ where: { id: first.id } })).creditStatus, "UNKNOWN");
  assert.equal((await db.sale.findUniqueOrThrow({ where: { id: result.id } })).status, "REFUNDED");
  context.mock.method(globalThis, "fetch", async (_url: unknown, options?: RequestInit) => { assert.equal(JSON.parse(String(options?.body)).operacion, "consultar_comprobante"); return acceptedFiscal(); });
  await handleRestaurantCommand("POST", ["sales", result.id, "credit-note"], {}, scope);
  await handleRestaurantCommand("POST", ["sales", result.id, "credit-note"], {}, scope);
  const refund = await db.saleRefund.findUniqueOrThrow({ where: { id: first.id } });
  assert.equal(refund.creditStatus, "ISSUED"); assert.equal(refund.creditPayload, note.payload);
});

test("Restaurante fiscal: REVIEW bloquea devolución y fallo de nota revierte dinero y reposición", async (context) => {
  const { origin, cash, item } = await fiscalRestaurant(context);
  const result = await handleRestaurantCommand("POST", ["orders", origin.id, "checkout"], { paymentMethod: "CASH" }, scope);
  assert.ok("id" in result && result.id);
  const original = await db.fiscalJob.findFirstOrThrow({ where: { saleId: result.id } });
  await db.restaurantElectronicDocument.update({ where: { saleId: result.id }, data: { status: "REVIEW" } });
  await assert.rejects(refundRestaurantSale(scope, result.id, refundInput), hasCode("FISCAL_STATUS_PENDING"));
  context.mock.method(globalThis, "fetch", async () => acceptedFiscal());
  await deliverFiscalJob(scope, original.id, true);
  const countersBefore = await db.restaurantDocumentSequence.findMany({ where: { tenantId: scope.tenantId } });
  context.mock.method(prisma, "$transaction", (operation: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: { isolationLevel?: Prisma.TransactionIsolationLevel }) => db.$transaction(async (tx) => {
    const auditCreate = tx.auditLog.create.bind(tx.auditLog);
    const proxy = new Proxy(tx, { get(target, key) { return key === "auditLog" ? { create: async (input: Prisma.AuditLogCreateArgs) => { if (input.data.action === "FISCAL_CREDIT_QUEUED") throw new Error("Credit audit unavailable"); return auditCreate(input); } } : Reflect.get(target, key); } });
    return operation(proxy);
  }, options));
  await assert.rejects(refundRestaurantSale(scope, result.id, refundInput), /Credit audit unavailable/);
  assert.equal((await db.sale.findUniqueOrThrow({ where: { id: result.id } })).status, "PAID");
  assert.equal(await db.saleRefund.count({ where: { saleId: result.id } }), 0);
  assert.equal(await db.fiscalJob.count({ where: { saleId: result.id, kind: "CREDIT_NOTE" } }), 0);
  assert.equal((await db.cashSession.findUniqueOrThrow({ where: { id: cash.id } })).expectedCents, 1100);
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })).stock, 8);
  assert.deepEqual(await db.restaurantDocumentSequence.findMany({ where: { tenantId: scope.tenantId } }), countersBefore);
});

test("Restaurante fiscal: un fallo al confirmar la nota conserva ambas proyecciones y permite consultar", async (context) => {
  const { origin } = await fiscalRestaurant(context);
  const sale = await handleRestaurantCommand("POST", ["orders", origin.id, "checkout"], { paymentMethod: "CASH" }, scope);
  assert.ok("id" in sale && sale.id);
  const original = await db.fiscalJob.findFirstOrThrow({ where: { saleId: sale.id } });
  context.mock.method(globalThis, "fetch", async () => acceptedFiscal());
  await deliverFiscalJob(scope, original.id, true);
  const refund = await refundRestaurantSale(scope, sale.id, refundInput);
  const note = await db.fiscalJob.findFirstOrThrow({ where: { saleId: sale.id, kind: "CREDIT_NOTE" } });
  let failAudit = true;
  context.mock.method(prisma, "$transaction", (operation: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: { isolationLevel?: Prisma.TransactionIsolationLevel }) => db.$transaction(async (tx) => {
    const auditCreate = tx.auditLog.create.bind(tx.auditLog);
    return operation(new Proxy(tx, { get(target, key) { return key === "auditLog" ? { create: async (input: Prisma.AuditLogCreateArgs) => { if (failAudit && input.data.action === "FISCAL_ISSUED") throw new Error("Note result audit unavailable"); return auditCreate(input); } } : Reflect.get(target, key); } }));
  }, options));
  await assert.rejects(deliverFiscalJob(scope, note.id, true), /Note result audit unavailable/);
  assert.equal((await db.fiscalJob.findUniqueOrThrow({ where: { id: note.id } })).status, "SENDING");
  assert.equal((await db.saleRefund.findUniqueOrThrow({ where: { id: refund.id } })).creditStatus, "PENDING");
  assert.equal((await db.sale.findUniqueOrThrow({ where: { id: sale.id } })).status, "REFUNDED");
  failAudit = false;
  await db.fiscalJob.update({ where: { id: note.id }, data: { leaseExpiresAt: new Date(0) } });
  context.mock.method(globalThis, "fetch", async (_url: unknown, options?: RequestInit) => { assert.equal(JSON.parse(String(options?.body)).operacion, "consultar_comprobante"); return acceptedFiscal(); });
  await deliverFiscalJob(scope, note.id, true);
  assert.equal((await db.saleRefund.findUniqueOrThrow({ where: { id: refund.id } })).creditStatus, "ISSUED");
});

test("PostgreSQL: cobros y devoluciones fiscales simultáneos conservan una operación y una nota", { skip: !process.env.INVENTORY_TEST_DATABASE_URL }, async (context) => {
  const { origin, cash, item } = await fiscalRestaurant(context);
  const checkout = await Promise.allSettled([1, 2].map(() => handleRestaurantCommand("POST", ["orders", origin.id, "checkout"], { paymentMethod: "CASH" }, scope)));
  assert.equal(checkout.filter((r) => r.status === "fulfilled").length, 1);
  for (const r of checkout) if (r.status === "rejected") assert.ok(hasCode("ALREADY_PAID")(r.reason) || hasCode("ORDER_CHANGED")(r.reason));
  const sale = await db.sale.findUniqueOrThrow({ where: { orderId: origin.id } });
  const original = await db.fiscalJob.findFirstOrThrow({ where: { saleId: sale.id } });
  assert.equal(await db.fiscalJob.count({ where: { saleId: sale.id } }), 1);
  let sends = 0;
  context.mock.method(globalThis, "fetch", async () => { sends++; return acceptedFiscal(); });
  const delivery = await Promise.allSettled([1, 2].map(() => deliverFiscalJob(scope, original.id, true)));
  assert.ok(delivery.some((r) => r.status === "fulfilled"));
  for (const r of delivery) if (r.status === "rejected") assert.ok(hasCode("DOCUMENT_BUSY")(r.reason));
  assert.equal(sends, 1);
  const refunds = await Promise.all([1, 2].map(() => refundRestaurantSale(scope, sale.id, refundInput)));
  assert.equal(refunds[0].id, refunds[1].id);
  assert.equal(await db.fiscalJob.count({ where: { saleId: sale.id, kind: "CREDIT_NOTE" } }), 1);
  assert.equal((await db.cashSession.findUniqueOrThrow({ where: { id: cash.id } })).expectedCents, 100);
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })).stock, 10);
});

async function openCash(executionScope = scope) {
  await db.cashSession.updateMany({ where: { tenantId: executionScope.tenantId, branchId: executionScope.branchId }, data: { status: "CLOSED" } });
  return db.cashSession.create({ data: { tenantId: executionScope.tenantId, branchId: executionScope.branchId, openedById: scope.actorId, openingCents: 100, expectedCents: 100 } });
}

async function appointment() {
  const customer = await db.customer.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, name: "Cliente" } });
  const staff = await db.staffMember.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, name: "Profesional" } });
  const service = await db.service.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, name: `Corte original ${++sequence}`, durationMinutes: 30, priceCents: 3000 } });
  return db.appointment.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, customerId: customer.id, staffId: staff.id, serviceId: service.id, startsAt: new Date(), endsAt: new Date(Date.now() + 1_800_000), priceCents: 3000 } });
}

async function order() {
  const category = await db.category.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, name: `Categoría ${++sequence}` } });
  const product = await db.product.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, categoryId: category.id, name: `Producto original ${++sequence}`, priceCents: 500 } });
  return db.restaurantOrder.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, createdById: scope.actorId, code: `SALE-ORDER-${++sequence}`, subtotalCents: 1000, totalCents: 1000,
    items: { create: { tenantId: scope.tenantId, productId: product.id, name: product.name, quantity: 2, unitPriceCents: 500, totalCents: 1000, recipeSnapshot: "[]" } } } });
}

test("Barbería: tarjeta registra pago y subtotal sin aumentar efectivo; rechaza repetición", async (context) => {
  bindTestDatabase(context);
  const cash = await openCash();
  const origin = await appointment();
  const result = await handleBarbershopCommand("POST", ["appointments", origin.id, "checkout"], { paymentMethod: "CARD" }, scope);
  const sale = await db.sale.findUniqueOrThrow({ where: { id: result.id }, include: { payments: true } });
  assert.equal(sale.totalCents, 3000);
  assert.equal(sale.subtotalCents, 3000);
  assert.equal(sale.payments.length, 1);
  assert.equal(sale.payments[0].amountCents, 3000);
  assert.equal(sale.paymentMethod, "CARD");
  assert.equal((await db.cashSession.findUniqueOrThrow({ where: { id: cash.id } })).expectedCents, 100);
  assert.equal((await db.appointment.findUniqueOrThrow({ where: { id: origin.id } })).status, "COMPLETED");
  await assert.rejects(handleBarbershopCommand("POST", ["appointments", origin.id, "checkout"], { paymentMethod: "CARD" }, scope), hasCode("ALREADY_PAID"));
});

test("caracterización: Restaurante conserva pago dividido, vuelto y efecto de efectivo", async (context) => {
  bindTestDatabase(context);
  const cash = await openCash();
  const origin = await order();
  const result = await handleRestaurantCommand("POST", ["orders", origin.id, "checkout"], { payments: [{ method: "CASH", amount: 4 }, { method: "CARD", amount: 6 }], receivedAmount: 5 }, scope);
  assert.ok("id" in result);
  const sale = await db.sale.findUniqueOrThrow({ where: { id: result.id }, include: { payments: true } });
  assert.equal(sale.totalCents, 1000);
  assert.equal(sale.paymentMethod, "SPLIT");
  assert.equal(sale.payments.reduce((sum, payment) => sum + payment.amountCents, 0), 1000);
  assert.equal(sale.cashReceivedCents, 500);
  assert.equal(sale.changeCents, 100);
  assert.equal((await db.cashSession.findUniqueOrThrow({ where: { id: cash.id } })).expectedCents, 500);
  assert.equal((await db.restaurantOrder.findUniqueOrThrow({ where: { id: origin.id } })).status, "COMPLETED");
  await assert.rejects(handleRestaurantCommand("POST", ["orders", origin.id, "checkout"], { paymentMethod: "CASH" }, scope), hasCode("ALREADY_PAID"));
});

test("caracterización: cobros no cruzan empresa/sede y un fallo revierte venta, origen y caja", async (context) => {
  bindTestDatabase(context);
  const cash = await openCash();
  const origins = [await appointment(), await order()];
  const handlers = [handleBarbershopCommand, handleRestaurantCommand];
  for (let index = 0; index < 2; index++) {
    const segments = [index === 0 ? "appointments" : "orders", origins[index].id, "checkout"];
    for (const foreign of [secondScope, otherScope]) await assert.rejects(handlers[index]("POST", segments, { paymentMethod: "CASH" }, foreign), hasCode("NOT_FOUND"));
    context.mock.method(prisma, "$transaction", (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) => db.$transaction(async (tx) => {
      await operation(tx);
      throw new Error("Fallo antes del commit");
    }));
    await assert.rejects(handlers[index]("POST", segments, { paymentMethod: "CASH" }, scope), /Fallo antes del commit/);
  }
  assert.equal(await db.sale.count({ where: { OR: [{ appointmentId: origins[0].id }, { orderId: origins[1].id }] } }), 0);
  assert.equal((await db.appointment.findUniqueOrThrow({ where: { id: origins[0].id } })).status, "PENDING");
  assert.equal((await db.restaurantOrder.findUniqueOrThrow({ where: { id: origins[1].id } })).status, origins[1].status);
  assert.equal((await db.cashSession.findUniqueOrThrow({ where: { id: cash.id } })).expectedCents, 100);
});

test("detalle histórico conserva servicio, precio y moneda aunque cambien después del cobro", async (context) => {
  bindTestDatabase(context);
  await openCash();
  const origin = await appointment();
  const originalService = await db.service.findUniqueOrThrow({ where: { id: origin.serviceId } });
  const result = await handleBarbershopCommand("POST", ["appointments", origin.id, "checkout"], { paymentMethod: "CASH" }, scope);
  const before = await db.sale.findUniqueOrThrow({ where: { id: result.id } });
  await db.service.update({ where: { id: origin.serviceId }, data: { name: "Catálogo modificado", priceCents: 9999 } });
  await db.tenant.update({ where: { id: scope.tenantId }, data: { currency: "USD" } });
  try {
    const after = await db.sale.findUniqueOrThrow({ where: { id: result.id } });
    assert.equal(after.commercialSnapshot, before.commercialSnapshot);
    const detail = JSON.parse(after.commercialSnapshot!) as CommercialSnapshot;
    assert.equal(detail.currency, "PEN");
    assert.equal(detail.lines[0].name, originalService.name);
    assert.equal(detail.lines[0].unitPriceCents, 3000);
    assert.equal(detail.subtotalCents, 3000);
    assert.equal(detail.totalCents, after.totalCents);
  } finally { await db.tenant.update({ where: { id: scope.tenantId }, data: { currency: "PEN" } }); }
});

test("snapshot de Restaurante conserva descuentos y cargos autorizados con líneas históricas", async (context) => {
  bindTestDatabase(context);
  await openCash();
  const origin = await order();
  const buyer = await db.customer.create({ data: { tenantId: scope.tenantId, name: "Cliente al cobrar", dni: "20123456789", documentType: "RUC" } });
  await db.restaurantOrder.update({ where: { id: origin.id }, data: { customerId: buyer.id, taxRatePct: 18, taxIncluded: true, discountCents: 100, deliveryFeeCents: 300, totalCents: 1200 } });
  const result = await handleRestaurantCommand("POST", ["orders", origin.id, "checkout"], { paymentMethod: "CARD" }, scope);
  assert.ok("id" in result);
  const sale = await db.sale.findUniqueOrThrow({ where: { id: result.id } });
  const detail = JSON.parse(sale.commercialSnapshot!) as CommercialSnapshot;
  assert.equal(detail.subtotalCents, 1000);
  assert.equal(detail.discountCents, 100);
  assert.equal(detail.chargesCents, 300);
  assert.equal(detail.totalCents, 1200);
  assert.deepEqual(detail.fiscal, { taxRatePct: 18, taxIncluded: true, customerName: "Cliente al cobrar", customerDocument: "20123456789" });
  await db.customer.update({ where: { id: buyer.id }, data: { name: "Cliente modificado", dni: "20999999999" } });
  await db.restaurantOrder.update({ where: { id: origin.id }, data: { taxRatePct: 10 } });
  const line = await db.orderItem.findFirstOrThrow({ where: { orderId: origin.id } });
  await db.product.update({ where: { id: line.productId }, data: { name: "Nombre nuevo", priceCents: 9999 } });
  assert.equal(detail.lines[0].name, line.name);
  assert.equal((await db.sale.findUniqueOrThrow({ where: { id: sale.id } })).commercialSnapshot, sale.commercialSnapshot);
});

async function saleInput(): Promise<RecordSaleInput> {
  const origin = await appointment();
  return { origin: { kind: "APPOINTMENT", id: origin.id }, code: `DIRECT-${++sequence}`, customerId: origin.customerId, cashSessionId: null, paymentMethod: "CASH", totalCents: 3000,
    detail: { subtotalCents: 3000, chargesCents: 0, lines: [{ sourceLineId: origin.id, name: "Corte", quantity: 1, unitPriceCents: 3000, totalCents: 3000 }] } };
}

test("repositorio de Ventas rechaza origen, cliente y caja ajenos aunque sus IDs existan", async () => {
  const input = await saleInput();
  for (const foreign of [secondScope, otherScope]) await assert.rejects(db.$transaction((tx) => recordSale(tx, foreign, input)), hasCode("SALE_SCOPE_MISMATCH"));
  const customer = await db.customer.create({ data: { tenantId: otherScope.tenantId, branchId: otherScope.branchId, name: "Ajeno" } });
  await assert.rejects(db.$transaction((tx) => recordSale(tx, scope, { ...input, customerId: customer.id })), hasCode("SALE_SCOPE_MISMATCH"));
  const cash = await openCash(secondScope);
  await assert.rejects(db.$transaction((tx) => recordSale(tx, scope, { ...input, cashSessionId: cash.id })), hasCode("SALE_SCOPE_MISMATCH"));
  assert.equal(await db.sale.count({ where: { code: input.code } }), 0);
});

test("venta inválida o fallo posterior no deja venta, pagos ni snapshot parciales", async () => {
  const input = await saleInput();
  await assert.rejects(db.$transaction((tx) => recordSale(tx, scope, { ...input, totalCents: 2999 })), hasCode("INVALID_SALE"));
  await assert.rejects(db.$transaction((tx) => recordSale(tx, scope, { ...input, payments: [{ method: "CASH", amountCents: 2900, reference: null }] })), hasCode("PAYMENT_TOTAL_MISMATCH"));
  let createdId = "";
  await assert.rejects(db.$transaction(async (tx) => {
    const sale = await recordSale(tx, scope, { ...input, payments: [{ method: "CASH", amountCents: 3000, reference: null }] });
    createdId = sale.id;
    throw new Error("Fallo después de venta y pagos");
  }), /Fallo después/);
  assert.equal(await db.sale.count({ where: { code: input.code } }), 0);
  assert.equal(await db.salePayment.count({ where: { saleId: createdId } }), 0);
});

test("Barbería rechaza cita cancelada y caja cerrada sin registrar venta", async (context) => {
  bindTestDatabase(context);
  const origin = await appointment();
  await db.appointment.update({ where: { id: origin.id }, data: { status: "CANCELLED" } });
  await assert.rejects(handleBarbershopCommand("POST", ["appointments", origin.id, "checkout"], { paymentMethod: "CASH" }, scope), hasCode("APPOINTMENT_CLOSED"));
  await db.appointment.update({ where: { id: origin.id }, data: { status: "PENDING" } });
  await db.cashSession.updateMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId }, data: { status: "CLOSED" } });
  await assert.rejects(handleBarbershopCommand("POST", ["appointments", origin.id, "checkout"], { paymentMethod: "CASH" }, scope), hasCode("CASH_CLOSED"));
  assert.equal(await db.sale.count({ where: { appointmentId: origin.id } }), 0);
});

test("PostgreSQL: dos cobros que leen la misma cita confirman una sola venta y efecto de caja", { skip: !process.env.INVENTORY_TEST_DATABASE_URL }, async (context) => {
  bindTestDatabase(context);
  const cash = await openCash();
  const origin = await appointment();
  let arrived = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolveGate) => { release = resolveGate; });
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; release(); }, 10_000);
  context.after(() => clearTimeout(timeout));
  context.mock.method(prisma, "$transaction", (operation: (tx: Prisma.TransactionClient) => Promise<unknown>, options: { isolationLevel?: Prisma.TransactionIsolationLevel; timeout?: number }) => db.$transaction(async (tx) => {
    const wrapped = new Proxy(tx, { get(target, property) {
      if (property !== "appointment") return Reflect.get(target, property);
      return new Proxy(target.appointment, { get(model, key) {
        if (key !== "findFirst") return Reflect.get(model, key);
        return async (args: Prisma.AppointmentFindFirstArgs) => {
          const value = await model.findFirst(args);
          if (arrived < 2) { arrived++; if (arrived === 2) release(); await gate; }
          return value;
        };
      } });
    } });
    return operation(wrapped);
  }, options));
  const results = await Promise.allSettled([1, 2].map(() => handleBarbershopCommand("POST", ["appointments", origin.id, "checkout"], { paymentMethod: "CASH" }, scope)));
  assert.equal(arrived, 2);
  assert.equal(timedOut, false, "Ambos cobros deben alcanzar la barrera simultáneamente");
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected");
  assert.ok(rejected?.status === "rejected" && hasCode("ALREADY_PAID")(rejected.reason));
  assert.equal(await db.sale.count({ where: { appointmentId: origin.id } }), 1);
  assert.equal((await db.cashSession.findUniqueOrThrow({ where: { id: cash.id } })).expectedCents, 3100);
});

test("PostgreSQL: dos cobros del mismo pedido conservan una venta, un pago y un incremento", { skip: !process.env.INVENTORY_TEST_DATABASE_URL }, async (context) => {
  bindTestDatabase(context);
  const cash = await openCash();
  const origin = await order();
  let arrived = 0;
  let release!: () => void;
  let timedOut = false;
  const gate = new Promise<void>((resolveGate) => { release = resolveGate; });
  const timeout = setTimeout(() => { timedOut = true; release(); }, 10_000);
  context.after(() => clearTimeout(timeout));
  const findFirst = prisma.restaurantOrder.findFirst.bind(prisma.restaurantOrder);
  Object.defineProperty(prisma, "restaurantOrder", { configurable: true, value: new Proxy(db.restaurantOrder, { get(model, key) {
    if (key !== "findFirst") return Reflect.get(model, key);
    return async (args: Prisma.RestaurantOrderFindFirstArgs) => {
      const value = await findFirst(args);
      if (arrived < 2) { arrived++; if (arrived === 2) release(); await gate; }
      return value;
    };
  } }) });
  const results = await Promise.allSettled([1, 2].map(() => handleRestaurantCommand("POST", ["orders", origin.id, "checkout"], { paymentMethod: "CASH" }, scope)));
  assert.equal(timedOut, false);
  assert.equal(arrived, 2);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected");
  assert.ok(rejected?.status === "rejected" && hasCode("ORDER_CHANGED")(rejected.reason));
  const sales = await db.sale.findMany({ where: { orderId: origin.id }, include: { payments: true } });
  assert.equal(sales.length, 1);
  assert.equal(sales[0].payments.length, 1);
  assert.equal(sales[0].payments[0].amountCents, 1000);
  assert.equal((await db.cashSession.findUniqueOrThrow({ where: { id: cash.id } })).expectedCents, 1100);
});

test("PostgreSQL: cerrar caja después de leerla impide confirmar el cobro de una cita", { skip: !process.env.INVENTORY_TEST_DATABASE_URL }, async (context) => {
  bindTestDatabase(context);
  const cash = await openCash();
  const origin = await appointment();
  let closed = false;
  context.mock.method(prisma, "$transaction", (operation: (tx: Prisma.TransactionClient) => Promise<unknown>, options: { isolationLevel?: Prisma.TransactionIsolationLevel; timeout?: number }) => db.$transaction(async (tx) => {
    const wrapped = new Proxy(tx, { get(target, property) {
      if (property !== "cashSession") return Reflect.get(target, property);
      return new Proxy(target.cashSession, { get(model, key) {
        if (key !== "findFirst") return Reflect.get(model, key);
        return async (args: Prisma.CashSessionFindFirstArgs) => {
          const value = await model.findFirst(args);
          if (!closed) { closed = true; await db.cashSession.update({ where: { id: cash.id }, data: { status: "CLOSED" } }); }
          return value;
        };
      } });
    } });
    return operation(wrapped);
  }, options));
  await assert.rejects(handleBarbershopCommand("POST", ["appointments", origin.id, "checkout"], { paymentMethod: "CASH" }, scope), hasCode("CASH_CLOSED"));
  assert.equal(closed, true);
  assert.equal(await db.sale.count({ where: { appointmentId: origin.id } }), 0);
  assert.equal((await db.appointment.findUniqueOrThrow({ where: { id: origin.id } })).status, "PENDING");
  assert.equal((await db.cashSession.findUniqueOrThrow({ where: { id: cash.id } })).expectedCents, 100);
});

test("Barbería: todos los medios quedan registrados y solo CASH aumenta la caja", async (context) => {
  bindTestDatabase(context);
  const cash = await openCash();
  for (const paymentMethod of ["CARD", "YAPE", "PLIN", "TRANSFER", "OTHER", "CASH"]) {
    const origin = await appointment();
    const result = await handleBarbershopCommand("POST", ["appointments", origin.id, "checkout"], { paymentMethod }, scope);
    const sale = await db.sale.findUniqueOrThrow({ where: { id: result.id }, include: { payments: true } });
    assert.equal(sale.payments.length, 1);
    assert.equal(sale.payments[0].method, paymentMethod);
    assert.equal(await db.auditLog.count({ where: { entityId: sale.id, action: "CHECKOUT" } }), 1);
    assert.equal((await db.cashSession.findUniqueOrThrow({ where: { id: cash.id } })).expectedCents, paymentMethod === "CASH" ? 3100 : 100);
  }
});

test("Barbería: turno histórico no se reinterpreta; cierra y abre con efectivo físico", async (context) => {
  bindTestDatabase(context);
  const cash = await openCash();
  await db.cashSession.update({ where: { id: cash.id }, data: { balanceBasis: "ALL_PAYMENTS", expectedCents: 4500 } });
  const original = await db.cashSession.findUniqueOrThrow({ where: { id: cash.id } });
  const origin = await appointment();
  await assert.rejects(handleBarbershopCommand("POST", ["appointments", origin.id, "checkout"], { paymentMethod: "YAPE" }, scope), hasCode("CASH_RECONCILIATION_REQUIRED"));
  assert.deepEqual(await db.cashSession.findUniqueOrThrow({ where: { id: cash.id } }), original);
  assert.equal(await db.sale.count({ where: { appointmentId: origin.id } }), 0);
  await handleBarbershopCommand("POST", ["cash", cash.id, "close"], { countedAmount: 45 }, scope);
  const closed = await db.cashSession.findUniqueOrThrow({ where: { id: cash.id } });
  const opened = await handleBarbershopCommand("POST", ["cash"], { openingAmount: 10 }, scope);
  const fresh = await db.cashSession.findUniqueOrThrow({ where: { id: opened.id } });
  assert.equal(fresh.balanceBasis, "CASH_ONLY");
  await handleBarbershopCommand("POST", ["appointments", origin.id, "checkout"], { paymentMethod: "YAPE" }, scope);
  assert.equal((await db.cashSession.findUniqueOrThrow({ where: { id: fresh.id } })).expectedCents, 1000);
  assert.deepEqual(await db.cashSession.findUniqueOrThrow({ where: { id: cash.id } }), closed);
});

test("Barbería: fallo de auditoría revierte cita, pagos, venta y caja", async (context) => {
  bindTestDatabase(context);
  const cash = await openCash();
  const origin = await appointment();
  context.mock.method(prisma, "$transaction", (operation: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: { isolationLevel?: Prisma.TransactionIsolationLevel }) => db.$transaction(async (tx) => operation(new Proxy(tx, { get(target, key) {
    return key === "auditLog" ? { create: async () => { throw new Error("audit-injected"); } } : Reflect.get(target, key);
  } })), options));
  await assert.rejects(handleBarbershopCommand("POST", ["appointments", origin.id, "checkout"], { paymentMethod: "CASH" }, scope), /audit-injected/);
  assert.equal(await db.sale.count({ where: { appointmentId: origin.id } }), 0);
  assert.equal((await db.appointment.findUniqueOrThrow({ where: { id: origin.id } })).status, "PENDING");
  assert.equal((await db.cashSession.findUniqueOrThrow({ where: { id: cash.id } })).expectedCents, 100);
});

test("Restaurante: cocina y cancelación revierten estado e inventario si falla auditoría", async (context) => {
  bindTestDatabase(context);
  const origin = await order();
  await db.restaurantOrder.update({ where: { id: origin.id }, data: { status: "PLACED" } });
  const ticket = await db.kitchenTicket.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, orderId: origin.id, status: "QUEUED" } });
  const line = await db.orderItem.findFirstOrThrow({ where: { orderId: origin.id } });
  for (const foreign of [secondScope, otherScope]) {
    await assert.rejects(handleRestaurantCommand("PATCH", ["kitchen", ticket.id, "status"], { status: "PREPARING", itemIds: [line.id] }, foreign), hasCode("NOT_FOUND"));
    await assert.rejects(handleRestaurantCommand("PATCH", ["orders", origin.id, "status"], { status: "CANCELLED", reason: "Prueba de aislamiento" }, foreign), hasCode("NOT_FOUND"));
  }
  const beforeOrder = await db.restaurantOrder.findUniqueOrThrow({ where: { id: origin.id } });
  context.mock.method(prisma, "$transaction", (operation: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: { isolationLevel?: Prisma.TransactionIsolationLevel }) => db.$transaction(async (tx) => operation(new Proxy(tx, { get(target, key) {
    return key === "auditLog" ? { create: async () => { throw new Error("state-audit-injected"); } } : Reflect.get(target, key);
  } })), options));
  await assert.rejects(handleRestaurantCommand("PATCH", ["kitchen", ticket.id, "status"], { status: "PREPARING", itemIds: [line.id] }, scope), /state-audit-injected/);
  await assert.rejects(handleRestaurantCommand("PATCH", ["orders", origin.id, "status"], { status: "CANCELLED", reason: "Prueba de reversión" }, scope), /state-audit-injected/);
  assert.deepEqual(await db.restaurantOrder.findUniqueOrThrow({ where: { id: origin.id } }), beforeOrder);
  assert.equal((await db.kitchenTicket.findUniqueOrThrow({ where: { id: ticket.id } })).status, "QUEUED");
  assert.equal((await db.orderItem.findUniqueOrThrow({ where: { id: line.id } })).status, line.status);
  assert.equal(await db.restaurantPrintJob.count({ where: { orderId: origin.id } }), 0);
});

test("PostgreSQL: cocina y cancelación concurrentes conservan receta, stock y estados coherentes", { skip: !process.env.INVENTORY_TEST_DATABASE_URL }, async (context) => {
  bindTestDatabase(context);
  const origin = await order();
  await db.restaurantOrder.update({ where: { id: origin.id }, data: { status: "PLACED" } });
  const line = await db.orderItem.findFirstOrThrow({ where: { orderId: origin.id } });
  const ticket = await db.kitchenTicket.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, orderId: origin.id, status: "QUEUED" } });
  const item = await db.inventoryItem.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, sku: `RACE-${++sequence}`, name: "Ingrediente", stock: 8 } });
  const movement = await db.inventoryMovement.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, itemId: item.id, orderId: origin.id, originId: line.id, originType: "ORDER_ITEM", type: "ORDER_RESERVATION", direction: "OUT", quantity: 2, stockBefore: 10, stockAfter: 8 } });
  const results = await Promise.allSettled([
    handleRestaurantCommand("PATCH", ["kitchen", ticket.id, "status"], { status: "PREPARING", itemIds: [line.id] }, scope),
    handleRestaurantCommand("PATCH", ["orders", origin.id, "status"], { status: "CANCELLED", reason: "Cancelación concurrente" }, scope),
  ]);
  assert.ok(results.some((result) => result.status === "fulfilled"));
  for (const result of results) if (result.status === "rejected") assert.ok(result.reason instanceof AppError && ["ORDER_CHANGED", "ORDER_CLOSED", "TICKET_CLOSED"].includes(result.reason.code));
  const saved = await db.restaurantOrder.findUniqueOrThrow({ where: { id: origin.id }, include: { items: true, kitchenTicket: true } });
  assert.equal(saved.items[0].status, saved.status);
  assert.equal(saved.kitchenTicket!.status, saved.status);
  const consumed = await db.inventoryMovement.findUniqueOrThrow({ where: { id: movement.id } });
  const stock = (await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })).stock;
  assert.equal(stock, consumed.type === "RELEASED_RESERVATION" ? 10 : 8);
  assert.ok(saved.status === "CANCELLED" ? ["WASTE", "RELEASED_RESERVATION"].includes(consumed.type) : consumed.type === "ORDER_RESERVATION");
  assert.ok(await db.inventoryMovement.count({ where: { orderId: origin.id, type: "RESERVATION_RELEASE" } }) <= 1);
});

test("Restaurante: crear y ampliar un pedido revierte líneas, cuota y comanda ante fallo de auditoría", async (context) => {
  bindTestDatabase(context);
  const origin = await order();
  await db.restaurantOrder.update({ where: { id: origin.id }, data: { status: "PLACED" } });
  await db.kitchenTicket.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, orderId: origin.id, status: "QUEUED" } });
  const line = await db.orderItem.findFirstOrThrow({ where: { orderId: origin.id } });
  const plan = await db.platformPlan.create({ data: { key: `audit-plan-${++sequence}`, name: "Pruebas" } });
  const previous = await db.tenant.findUniqueOrThrow({ where: { id: scope.tenantId } });
  await db.tenant.update({ where: { id: scope.tenantId }, data: { planId: plan.id } });
  context.after(async () => { await db.tenant.update({ where: { id: scope.tenantId }, data: { planId: previous.planId } }); });
  const beforeOrder = await db.restaurantOrder.findUniqueOrThrow({ where: { id: origin.id }, include: { items: true } });
  const beforeCount = await db.restaurantOrder.count({ where: { tenantId: scope.tenantId } });
  context.mock.method(prisma, "$transaction", (operation: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: { isolationLevel?: Prisma.TransactionIsolationLevel }) => db.$transaction(async (tx) => operation(new Proxy(tx, { get(target, key) {
    return key === "auditLog" ? { create: async () => { throw new Error("order-audit-injected"); } } : Reflect.get(target, key);
  } })), options));
  const items = [{ productId: line.productId, quantity: 1 }];
  await assert.rejects(handleRestaurantCommand("POST", ["orders"], { source: "TAKEAWAY", items }, scope), /order-audit-injected/);
  await assert.rejects(handleRestaurantCommand("PATCH", ["orders", origin.id, "items"], { items }, scope), /order-audit-injected/);
  assert.equal(await db.restaurantOrder.count({ where: { tenantId: scope.tenantId } }), beforeCount);
  assert.equal((await db.tenant.findUniqueOrThrow({ where: { id: scope.tenantId } })).quotaVersion, previous.quotaVersion);
  assert.deepEqual(await db.restaurantOrder.findUniqueOrThrow({ where: { id: origin.id }, include: { items: true } }), beforeOrder);
});
