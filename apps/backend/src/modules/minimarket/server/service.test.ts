import { receiverScanner, scannerReceiverSchema, senderScanner } from "./scanner";
import { savePaymentQr } from "./payment-qr";
import { getSessionById } from "@/core/auth/session";
import sharp from "sharp";
import { hasPermission } from "@/core/auth/permissions";
import { quoteRetail } from "./promotions";
import { commercialFiscalSource } from "@/modules/invoicing/domain/commercial-source";
import { saveSunatCredentials } from "@/modules/invoicing/server/connection";
import { deliverFiscalJob, runFiscalBatch } from "@/modules/invoicing/server/outbox";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, beforeEach, test, type TestContext } from "node:test";
import { PrismaClient, type Prisma } from "@prisma/client";
import { AppError } from "@/core/auth/errors";
import type { TenantScope } from "@/core/auth/types";
import { prisma } from "@/core/database/prisma";
import { randomUUID } from "node:crypto";
import { handleMinimarketCommand } from "./commands";
import { checkoutRetail } from "./service";
import { getMinimarketData } from "./data";
import { lookupBarcode } from "./lookup";
import { PrismaCheckoutPort } from "../infrastructure/prisma/checkout-port";
import type { CheckoutInput } from "../application/checkout";
import { assertMinimarketAccess, minimarketPermission } from "./access";
import type { AuthSession } from "@/core/auth/types";

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
    directory = await mkdtemp(join(tmpdir(), "movendi-minimarket-test-"));
    await writeFile(join(directory, "minimarket.db"), "", { flag: "wx" });
    const url = `file:${join(directory, "minimarket.db").replaceAll("\\", "/")}`;
    execFileSync(process.execPath, [require.resolve("prisma/build/index.js"), "migrate", "deploy", "--schema", fileURLToPath(new URL("../../../../prisma/schema.prisma", import.meta.url))], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe", timeout: 60_000 });
    db = new PrismaClient({ datasources: { db: { url } } });
  }
});
after(async () => { await db?.$disconnect(); if (directory) { assert.ok(resolve(directory).startsWith(`${resolve(tmpdir())}${sep}movendi-minimarket-test-`)); await rm(directory, { recursive: true, force: true }); } });

let cashId: string;
beforeEach(async (testContext) => {
  const context = testContext as TestContext;
  const previousKey = process.env.INTEGRATION_ENCRYPTION_KEY; process.env.INTEGRATION_ENCRYPTION_KEY = "test-only-fiscal-key-not-production-12345";
  context.after(() => { if (previousKey === undefined) delete process.env.INTEGRATION_ENCRYPTION_KEY; else process.env.INTEGRATION_ENCRYPTION_KEY = previousKey; });
  context.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected external request"); });
  context.mock.method(prisma, "$transaction", db.$transaction.bind(db));
  for (const model of ["session", "retailScannerConnection", "retailScanEvent", "retailPaymentQr", "salePayment", "category", "promotion", "fiscalConfiguration", "fiscalJob", "restaurantIntegrationCredential", "restaurantElectronicDocument", "tenant", "branch", "inventorySupplier", "inventoryPayable", "inventorySupplierPayment", "retailTransfer", "retailProduct", "retailPresentation", "retailSale", "retailSaleLine", "retailLot", "retailOperation", "cashSession", "cashMovement", "sale", "inventoryItem", "inventoryMovement", "inventoryPurchase", "customer"] as const) {
    const original = prisma[model]; Object.defineProperty(prisma, model, { value: db[model], configurable: true });
    context.after(() => Object.defineProperty(prisma, model, { value: original, configurable: true }));
  }
  const suffix = randomUUID();
  const plan = await db.platformPlan.create({ data: { key: suffix, name: "Test", maxMonthlyOperations: 100 } });
  const tenant = await db.tenant.create({ data: { slug: `mm-${suffix}`, name: "Minimarket", shortName: "MM", type: "MINIMARKET", planId: plan.id } });
  const other = await db.tenant.create({ data: { slug: `other-${suffix}`, name: "Otro", shortName: "OT", type: "MINIMARKET", planId: plan.id } });
  const branch = await db.branch.create({ data: { tenantId: tenant.id, name: "Principal" } });
  const second = await db.branch.create({ data: { tenantId: tenant.id, name: "Segunda" } });
  const foreign = await db.branch.create({ data: { tenantId: other.id, name: "Ajena" } });
  const actor = await db.user.create({ data: { name: "Prueba", email: `${suffix}@test.local`, passwordHash: "not-a-login" } });
  scope = { tenantId: tenant.id, branchId: branch.id, actorId: actor.id, permissions: ["*"] };
  secondScope = { ...scope, branchId: second.id }; otherScope = { ...scope, tenantId: other.id, branchId: foreign.id };
  context.after(async () => { await db.fiscalJob.updateMany({ where: { tenantId: tenant.id, status: { not: "ISSUED" } }, data: { status: "REVIEW" } }); });
  const cash = await command(["cash"], { openingCents: 10000 }); cashId = (cash as { session: { id: string } }).session.id;
});
function command(segments: string[], body: Record<string, unknown>, executionScope = scope, method = "POST") { return handleMinimarketCommand(method, segments, { idempotencyKey: randomUUID(), ...body }, executionScope); }
function code(expected: string) { return (error: unknown) => error instanceof AppError && error.code === expected; }
async function product(options: { stock?: number; expiry?: boolean; weighted?: boolean; price?: number; factor?: number } = {}) {
  const result = await command(["products"], { name: "Arroz", sku: randomUUID(), unit: options.weighted ? "KG" : "UND", trackExpiry: options.expiry ?? false, presentations: [{ name: "Venta", factor: options.factor ?? 1, priceCents: options.price ?? 300, weighted: options.weighted ?? false }] }) as { id: string };
  if (options.stock) await command(["purchases"], { supplierName: "Proveedor", lines: [{ productId: result.id, quantity: options.stock, unitCostCents: 100, ...(options.expiry ? { lotCode: "A", expiresOn: "2090-01-01" } : {}) }] });
  return db.retailProduct.findUniqueOrThrow({ where: { id: result.id }, include: { item: true, presentations: true, lots: true } });
}
function cart(presentationId: string, quantity = 1, total = 300): CheckoutInput { return { idempotencyKey: randomUUID(), cashSessionId: cashId, payments: [{ method: "CASH", amountCents: total, reference: null }], lines: [{ presentationId, quantity }] }; }

async function scannerSession(executionScope = scope) {
  const role = await db.role.create({ data: { tenantId: executionScope.tenantId, key: randomUUID(), name: "Cajero", permissions: JSON.stringify(executionScope.permissions) } });
  const membership = await db.membership.create({ data: { tenantId: executionScope.tenantId, branchId: executionScope.branchId, userId: executionScope.actorId, roleId: role.id } });
  const record = await db.session.create({ data: { tenantId: executionScope.tenantId, branchId: executionScope.branchId, userId: executionScope.actorId, membershipId: membership.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3600_000) } });
  return (await getSessionById(record.id))!;
}
async function connectScanner(session: AuthSession, cashSessionId: string) {
  const receiverToken = randomUUID().replaceAll("-", ""), pairingToken = randomUUID().replaceAll("-", ""), senderToken = randomUUID().replaceAll("-", ""), cartIntentId = randomUUID();
  const result = await receiverScanner(session, { action: "connect", cashSessionId, receiverToken, pairingToken, cartIntentId });
  assert.ok("connectionId" in result);
  return { connectionId: result.connectionId, receiverToken, pairingToken, senderToken, cartIntentId };
}

test("catálogo rápido: SKU omitido o vacío genera código estable y respeta el SKU propio", async () => {
  const input = { idempotencyKey: randomUUID(), name: "Pan sin código", presentations: [{ name: "Unidad", factor: 1, priceCents: 50 }] };
  const created = await command(["products"], input) as { id: string; itemId: string; sku: string };
  assert.match(created.sku, /^PRD-[0-9A-F]{16}$/);
  assert.deepEqual(await command(["products"], input), created);
  const stored = await db.retailProduct.findUniqueOrThrow({ where: { id: created.id }, include: { item: true, presentations: true } });
  assert.equal(stored.item.sku, created.sku); assert.equal(stored.item.stock, 0); assert.equal(stored.item.unit, "UND");
  assert.equal(stored.category, "General"); assert.equal(stored.presentations[0].barcode, null);
  assert.equal(await db.inventoryItem.count({ where: { tenantId: scope.tenantId, branchId: scope.branchId, name: input.name } }), 1);
  const blank = await command(["products"], { ...input, idempotencyKey: randomUUID(), sku: "   " }) as { id: string; sku: string };
  assert.match(blank.sku, /^PRD-[0-9A-F]{16}$/); assert.notEqual(blank.sku, created.sku);
  const custom = await command(["products"], { ...input, idempotencyKey: randomUUID(), sku: " PAN-001 " }) as { id: string; sku: string };
  assert.equal(custom.sku, "PAN-001");
  await assert.rejects(command(["products"], { ...input, idempotencyKey: randomUUID(), sku: "PAN-001" }), code("DUPLICATE_PRODUCT"));
  const second = await command(["products"], { ...input, idempotencyKey: randomUUID(), sku: "PAN-001" }, secondScope) as { id: string; sku: string };
  assert.equal(second.sku, "PAN-001");
  await assert.rejects(command(["products"], { ...input, idempotencyKey: randomUUID(), name: " " }), code("VALIDATION_ERROR"));
});

test("PostgreSQL: alta simultánea sin SKU y recuperación de una misma creación", async (context) => {
  if (!process.env.INVENTORY_TEST_DATABASE_URL) { context.skip("Requiere PostgreSQL real."); return; }
  const input = { idempotencyKey: randomUUID(), name: "Alta concurrente", presentations: [{ name: "Unidad", factor: 1, priceCents: 100 }] };
  const same = await Promise.all([command(["products"], input), command(["products"], input)]);
  assert.deepEqual(same[0], same[1]);
  const different = await Promise.all(Array.from({ length: 5 }, () => command(["products"], { ...input, idempotencyKey: randomUUID() }))) as Array<{ id: string; sku: string }>;
  assert.equal(new Set(different.map((row) => row.sku)).size, 5);
  assert.equal(await db.retailProduct.count({ where: { tenantId: scope.tenantId, branchId: scope.branchId } }), 6);
});

test("cinco cajas: lecturas, ventas y medios de pago permanecen aislados por turno", async () => {
  const p = await product({ stock: 20 });
  const sessions: Array<{ session: AuthSession; cash: string; link: Awaited<ReturnType<typeof connectScanner>> }> = [];
  for (let index = 0; index < 5; index++) {
    const actor = index === 0 ? { id: scope.actorId } : await db.user.create({ data: { name: `Cajero ${index}`, email: `${randomUUID()}@test.local`, passwordHash: "not-a-login" } });
    const cashierScope = { ...scope, actorId: actor.id, permissions: ["minimarket:sales:write", "minimarket:cash:read", "minimarket:cash:open"] };
    const cash = index === 0 ? cashId : ((await command(["cash"], { openingCents: index * 100, registerName: `Caja ${index + 1}` }, cashierScope)) as { session: { id: string } }).session.id;
    const session = await scannerSession(cashierScope), link = await connectScanner(session, cash);
    await senderScanner({ action: "pair", ...link });
    await receiverScanner(session, { action: "poll", ...link, accepting: true, cartSummary: { units: index + 1, totalCents: (index + 1) * 300, currency: "PEN", verified: true } });
    sessions.push({ session, cash, link });
  }
  const scans = sessions.map((row, index) => ({ action: "scan" as const, ...row.link, requestId: randomUUID(), barcode: `code-${index}` }));
  if (process.env.INVENTORY_TEST_DATABASE_URL) await Promise.all(scans.map((scan) => senderScanner(scan)));
  for (const [index, row] of sessions.entries()) {
    const phoneState = await senderScanner({ action: "status", ...row.link });
    assert.deepEqual(phoneState.cartSummary, { units: index + 1, totalCents: (index + 1) * 300, currency: "PEN", verified: true });
    const scan = scans[index];
    await senderScanner(scan); await senderScanner(scan);
    const received = await receiverScanner(row.session, { action: "poll", ...row.link, accepting: true });
    assert.ok("events" in received); assert.deepEqual(received.events.map((event) => event.barcode), [`code-${index}`]);
    const other = sessions[(index + 1) % 5];
    await assert.rejects(receiverScanner(other.session, { action: "poll", ...row.link, accepting: true }), code("SCANNER_DISCONNECTED"));
    await assert.rejects(senderScanner({ ...scan, senderToken: other.link.senderToken }), code("SCANNER_DISCONNECTED"));
    const sale = await checkoutRetail({ ...scope, actorId: row.session.userId, permissions: row.session.permissions }, { ...cart(p.presentations[0].id), cashSessionId: row.cash, digitalPaymentConfirmed: true, payments: [{ method: index % 2 ? "YAPE" : "CASH", amountCents: 300, reference: `ref-${index}` }] });
    const stored = await db.sale.findUniqueOrThrow({ where: { id: sale.id } }); assert.equal(stored.cashSessionId, row.cash); assert.equal(stored.cashierId, row.session.userId);
    assert.equal((await db.cashSession.findUniqueOrThrow({ where: { id: row.cash } })).expectedCents, (index === 0 ? 10000 : index * 100) + (index % 2 ? 0 : 300));
  }
  const data = await getMinimarketData(scope, "checkout", new URLSearchParams()); assert.equal(data.cashSessions.length, 5); assert.equal(data.cashSessions[0].cashierName.startsWith("Cajero"), true);
  assert.deepEqual(data.cashPayments, [{ method: "CASH", amountCents: 300 }]);
});

test("escáner: vínculo de un solo celular, pausa, reintento, nueva venta y cierre de turno", async () => {
  const session = await scannerSession(), link = await connectScanner(session, cashId);
  const paired = await senderScanner({ action: "pair", ...link }); assert.equal(paired.registerName, "Caja principal");
  await assert.rejects(senderScanner({ action: "pair", ...link, senderToken: "b".repeat(32) }), code("PAIRING_EXPIRED"));
  await assert.rejects(connectScanner(session, cashId), code("SCANNER_IN_USE"));
  const scan = { action: "scan" as const, ...link, requestId: randomUUID(), barcode: "77500001" };
  await assert.rejects(senderScanner(scan), code("SCANNER_PAUSED"));
  await receiverScanner(session, { action: "poll", ...link, accepting: true }); await senderScanner(scan);
  const poll = await receiverScanner(session, { action: "poll", ...link, accepting: true }); assert.ok("events" in poll); assert.equal(poll.events.length, 1);
  await receiverScanner(session, { action: "ack", ...link, sequence: poll.events[0].sequence, status: "ADDED", message: "Producto agregado" });
  assert.equal((await senderScanner(scan)).event?.status, "ADDED");
  const next = { ...scan, requestId: randomUUID() }; await senderScanner(next);
  const changedCart = await receiverScanner(session, { action: "poll", ...link, accepting: true, cartIntentId: randomUUID() });
  assert.ok("events" in changedCart); assert.equal(changedCart.events[0].cartIntentId, link.cartIntentId);
  await receiverScanner(session, { action: "ack", ...link, sequence: changedCart.events[0].sequence, status: "REJECTED", message: "La venta cambió" });
  assert.equal((await senderScanner({ action: "status", ...link, requestId: next.requestId })).event?.status, "REJECTED");
  await db.retailScannerConnection.update({ where: { id: link.connectionId }, data: { receiverSeenAt: new Date(Date.now() - 11000) } });
  await assert.rejects(senderScanner({ ...scan, requestId: randomUUID() }), code("SCANNER_PAUSED"));
  await command(["cash", cashId, "close"], { expectedCents: 10000, countedCents: 10000 });
  await assert.rejects(senderScanner({ action: "status", ...link }), code("SCANNER_DISCONNECTED"));
});

test("escáner: resumen validado, nueva venta y totales ocultos al perder la PC", async () => {
  const session = await scannerSession(), link = await connectScanner(session, cashId);
  await senderScanner({ action: "pair", ...link });
  const poll = { action: "poll" as const, ...link, accepting: true, cartSummary: { units: 2.5, totalCents: 1234, currency: "PEN", verified: false } };
  assert.equal(scannerReceiverSchema.safeParse({ ...poll, cartSummary: { ...poll.cartSummary, totalCents: -1 } }).success, false);
  assert.equal(scannerReceiverSchema.safeParse({ ...poll, cartSummary: { ...poll.cartSummary, units: Infinity } }).success, false);
  await receiverScanner(session, poll);
  assert.deepEqual((await senderScanner({ action: "status", ...link })).cartSummary, poll.cartSummary);
  await receiverScanner(session, { ...poll, accepting: false });
  const checkout = await senderScanner({ action: "status", ...link });
  assert.equal(checkout.accepting, false); assert.deepEqual(checkout.cartSummary, poll.cartSummary);
  await db.retailScannerConnection.update({ where: { id: link.connectionId }, data: { receiverSeenAt: new Date(Date.now() - 11000) } });
  assert.equal((await senderScanner({ action: "status", ...link })).cartSummary, null);
  await receiverScanner(session, { ...poll, cartIntentId: randomUUID(), cartSummary: undefined });
  assert.equal((await senderScanner({ action: "status", ...link })).cartSummary, null);
  await receiverScanner(session, { ...poll, cartIntentId: randomUUID(), cartSummary: { ...poll.cartSummary, units: 0, totalCents: 0, verified: true } });
  assert.equal((await senderScanner({ action: "status", ...link })).cartSummary?.totalCents, 0);
});

test("escáner: no delega acceso a otra sucursal, sesión revocada o cajero ajeno", async () => {
  const session = await scannerSession(), link = await connectScanner(session, cashId);
  await senderScanner({ action: "pair", ...link });
  await assert.rejects(receiverScanner({ ...session, branchId: secondScope.branchId }, { action: "poll", ...link, accepting: true }), code("SCANNER_DISCONNECTED"));
  await assert.rejects(receiverScanner({ ...session, userId: "otro", permissions: ["minimarket:sales:write"] }, { action: "reset", cashSessionId: cashId }), code("FORBIDDEN"));
  await db.session.update({ where: { id: session.sessionId }, data: { branchId: secondScope.branchId } });
  await assert.rejects(senderScanner({ action: "status", ...link }), code("SCANNER_DISCONNECTED"));
  await db.session.delete({ where: { id: session.sessionId } });
  await assert.rejects(senderScanner({ action: "status", ...link }), code("SCANNER_DISCONNECTED"));
});

test("escáner: QR vencido no se vincula y restablecer una caja invalida sus secretos", async () => {
  const session = await scannerSession(), link = await connectScanner(session, cashId);
  await db.retailScannerConnection.update({ where: { id: link.connectionId }, data: { pairExpiresAt: new Date(Date.now() - 1) } });
  await assert.rejects(senderScanner({ action: "pair", ...link }), code("PAIRING_EXPIRED"));
  await receiverScanner(session, { action: "reset", cashSessionId: cashId });
  const renewed = await connectScanner(session, cashId); assert.notEqual(renewed.connectionId, link.connectionId);
  await assert.rejects(senderScanner({ action: "pair", ...link }), code("SCANNER_DISCONNECTED"));
});

test("PostgreSQL: lecturas concurrentes con la misma identidad no se duplican", async (context) => {
  if (!process.env.INVENTORY_TEST_DATABASE_URL) { context.skip("Requiere PostgreSQL real."); return; }
  const session = await scannerSession(), link = await connectScanner(session, cashId);
  await senderScanner({ action: "pair", ...link }); await receiverScanner(session, { action: "poll", ...link, accepting: true });
  const input = { action: "scan" as const, ...link, requestId: randomUUID(), barcode: "775000001" };
  await Promise.all([senderScanner(input), senderScanner(input)]);
  assert.equal(await db.retailScanEvent.count({ where: { connectionId: link.connectionId } }), 1);
});

test("QR: imagen validada por sucursal y pago digital confirmado sin inflar efectivo", async () => {
  await command(["payment-methods"], { methods: ["CASH", "YAPE", "PLIN"] });
  assert.deepEqual((await getMinimarketData(secondScope, "pos", new URLSearchParams())).paymentMethods, ["CASH", "YAPE", "PLIN"]);
  await assert.rejects(command(["payment-methods"], { methods: ["CARD"] }, { ...scope, permissions: ["minimarket:sales:write"] }), code("FORBIDDEN"));
  const image = await sharp({ create: { width: 50, height: 50, channels: 3, background: "white" } }).png().toBuffer();
  await savePaymentQr(scope, "YAPE", "Cuenta de prueba", image);
  await savePaymentQr(secondScope, "YAPE", "Otra sucursal", image);
  const data = await getMinimarketData(scope, "pos", new URLSearchParams()); assert.equal(data.paymentQrs.length, 1); assert.equal(data.paymentQrs[0].payee, "Cuenta de prueba");
  await assert.rejects(savePaymentQr({ ...scope, permissions: ["minimarket:sales:write"] }, "YAPE", "No autorizado", image), code("FORBIDDEN"));
  await assert.rejects(savePaymentQr(scope, "YAPE", "Inválido", Buffer.from("<svg><script/></svg>")), code("INVALID_QR_IMAGE"));
  const p = await product({ stock: 5 }), input = { ...cart(p.presentations[0].id), payments: [{ method: "YAPE", amountCents: 300, reference: "YAPE-1234" }] };
  await assert.rejects(checkoutRetail(scope, input), code("PAYMENT_NOT_CONFIRMED"));
  assert.equal(await db.sale.count({ where: { tenantId: scope.tenantId } }), 0);
  await checkoutRetail(scope, { ...input, digitalPaymentConfirmed: true });
  assert.equal((await db.cashSession.findUniqueOrThrow({ where: { id: cashId } })).expectedCents, 10000);
  assert.equal((await getMinimarketData(scope, "sales", new URLSearchParams())).sales[0].payments[0].reference, "YAPE-1234");
  await savePaymentQr(scope, "YAPE", "", null); assert.equal((await getMinimarketData(secondScope, "pos", new URLSearchParams())).paymentQrs.length, 1);
});

test("categorías: creación, duplicados, renombrado, filtros y eliminación mantienen el aislamiento", async () => {
  const input = { idempotencyKey: randomUUID(), name: "Bebidas" };
  const category = await command(["categories"], input) as { id: string };
  assert.equal((await command(["categories"], input) as { id: string }).id, category.id);
  await assert.rejects(command(["categories"], { name: "  BEBIDAS  " }), code("DUPLICATE_CATEGORY"));
  const otherCategory = await command(["categories"], { name: "Bebidas" }, secondScope) as { id: string };
  await assert.rejects(command(["categories", category.id], { name: "Ajena" }, otherScope, "PATCH"), code("NOT_FOUND"));
  await assert.rejects(command(["categories", category.id], {}, secondScope, "DELETE"), code("NOT_FOUND"));
  const p = await product();
  await command(["products", p.id], { name: "Agua", category: "bebidas", minimumStock: 0, active: false }, scope, "PATCH");
  assert.equal((await db.retailProduct.findUniqueOrThrow({ where: { id: p.id } })).category, "Bebidas");
  await command(["categories", category.id], { name: "Bebidas frías" }, scope, "PATCH");
  const data = await getMinimarketData(scope, "catalog", new URLSearchParams({ category: "Bebidas frías", status: "inactive" }));
  assert.equal(data.products[0]?.id, p.id);
  assert.equal(data.categories.find((row) => row.id === category.id)?.productCount, 1);
  assert.equal((await getMinimarketData(scope, "catalog", new URLSearchParams({ category: "Bebidas frías", status: "active" }))).totalRows, 0);
  assert.equal((await getMinimarketData(scope, "pos", new URLSearchParams({ status: "inactive" }))).products.length, 0);
  assert.equal((await db.category.findUniqueOrThrow({ where: { id: otherCategory.id } })).name, "Bebidas");
  await assert.rejects(command(["categories", category.id], {}, scope, "DELETE"), code("CATEGORY_IN_USE"));
  await command(["products", p.id], { name: "Agua", category: "General", minimumStock: 0, active: true }, scope, "PATCH");
  await command(["categories", category.id], {}, scope, "DELETE");
  assert.equal(await db.category.findUnique({ where: { id: category.id } }), null);
  assert.equal(minimarketPermission("categories", "POST"), "minimarket:catalog:write");
});

test("presentaciones: corregir código conserva ventas históricas, rechaza duplicados y exige catálogo", async () => {
  const p = await product({ stock: 5 });
  const presentation = p.presentations[0];
  await checkoutRetail(scope, cart(presentation.id));
  const update = { name: "Unidad corregida", sku: "PRESENTACION-1", barcode: "775000000001", priceCents: 400, active: true };
  await command(["presentations", presentation.id], update, scope, "PATCH");
  const found = await lookupBarcode(scope, update.barcode);
  assert.equal(found.presentationId, presentation.id);
  assert.equal((await db.retailSaleLine.findFirstOrThrow({ where: { presentationId: presentation.id } })).unitPriceCents, 300);
  const second = await product();
  await assert.rejects(command(["presentations", second.presentations[0].id], update, scope, "PATCH"), code("DUPLICATE_PRODUCT"));
  await assert.rejects(command(["presentations", presentation.id], { ...update, barcode: "OTRO" }, { ...scope, permissions: ["minimarket:prices:write"] }, "PATCH"), code("FORBIDDEN"));
  await command(["presentations", presentation.id], { priceCents: 450, active: true }, { ...scope, permissions: ["minimarket:prices:write"] }, "PATCH");
  await command(["presentations", presentation.id], { ...update, barcode: "", sku: "" }, scope, "PATCH");
  assert.equal((await db.retailPresentation.findUniqueOrThrow({ where: { id: presentation.id } })).barcode, null);
});

test("la migración registra categorías históricas sin duplicarlas ni modificar productos", async () => {
  const p = await product();
  await db.category.deleteMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId } });
  const sql = await readFile(new URL("../../../../prisma/migrations/20260920010000_retail_categories/migration.sql", import.meta.url), "utf8");
  await db.$executeRawUnsafe(sql);
  await db.$executeRawUnsafe(sql);
  assert.equal(await db.category.count({ where: { tenantId: scope.tenantId, branchId: scope.branchId, name: "General" } }), 1);
  assert.equal((await db.retailProduct.findUniqueOrThrow({ where: { id: p.id } })).category, "General");
});

test("importación reutiliza catálogo e inventario, crea presentaciones juntas y revierte cualquier error", async () => {
  const row = { sku: "IM-01", barcode: "0775123456789", name: "Importado", category: "General", presentation: "Unidad", unit: "UND", factor: 1, costCents: 100, priceCents: 200, stock: 12, minimumStock: 2, trackExpiry: false, lotCode: "", expiresOn: "", weighted: false };
  const input = { idempotencyKey: randomUUID(), rows: [row, { ...row, presentation: "Pack seis", factor: 6, barcode: "0775123456796", priceCents: 1000, stock: 0 }] };
  const result = await command(["imports"], input); assert.deepEqual(await command(["imports"], input), result);
  const imported = await db.inventoryItem.findFirstOrThrow({ where: { tenantId: scope.tenantId, branchId: scope.branchId, sku: row.sku }, include: { retailProduct: { include: { presentations: true } } } });
  assert.equal(imported.stock, 12); assert.equal(imported.retailProduct!.presentations.length, 2);
  assert.equal(await db.inventoryMovement.count({ where: { itemId: imported.id, originType: "RETAIL_IMPORT" } }), 1);
  await assert.rejects(command(["imports"], { rows: [{ ...row, sku: "IM-NEW", barcode: "NEW" }, row] }), code("IMPORT_ERRORS"));
  assert.equal(await db.inventoryItem.count({ where: { tenantId: scope.tenantId, sku: "IM-NEW" } }), 0);
});

test("proveedores: compra a crédito, pagos parciales, caja, límites e idempotencia", async () => {
  const supplier = await command(["suppliers"], { documentType: "RUC", documentNumber: "20123456789", name: "Distribuidor" }) as { id: string };
  const p = await product();
  const purchase = await command(["purchases"], { supplierName: "Snapshot", supplierId: supplier.id, credit: true, dueOn: "2090-01-01", lines: [{ productId: p.id, quantity: 10, unitCostCents: 100 }] }) as { id: string };
  const payable = await db.inventoryPayable.findUniqueOrThrow({ where: { purchaseId: purchase.id } });
  const payment = { idempotencyKey: randomUUID(), amountCents: 400, method: "CASH", cashSessionId: cashId };
  const result = await command(["payables", payable.id, "payments"], payment);
  assert.deepEqual(await command(["payables", payable.id, "payments"], payment), result);
  assert.equal((await db.cashSession.findUniqueOrThrow({ where: { id: cashId } })).expectedCents, 9600);
  assert.equal((await db.inventoryPayable.findUniqueOrThrow({ where: { id: payable.id } })).paidCents, 400);
  await assert.rejects(command(["payables", payable.id, "payments"], { amountCents: 700, method: "TRANSFER" }), code("PAYABLE_LIMIT"));
  await assert.rejects(command(["payables", payable.id, "payments"], { amountCents: 100, method: "TRANSFER" }, secondScope), code("NOT_FOUND"));
  await assert.rejects(command(["payables", payable.id, "payments"], { amountCents: 100, method: "CASH", cashSessionId: "missing" }), code("NOT_FOUND"));
  assert.equal(await db.inventorySupplierPayment.count({ where: { payableId: payable.id } }), 1);
  await command(["payables", payable.id, "payments"], { amountCents: 600, method: "TRANSFER", reference: "B-01" });
  const data = await getMinimarketData(scope, "purchases", new URLSearchParams());
  assert.equal(data.payables[0].status, "PAID"); assert.equal(data.payables[0].payments.length, 2);
  assert.equal((await getMinimarketData({ ...scope, permissions: ["inventory:read"] }, "purchases", new URLSearchParams())).payables.length, 0);
});

test("PostgreSQL: pagos simultáneos a proveedor no exceden el saldo", async (context) => {
  if (!process.env.INVENTORY_TEST_DATABASE_URL) return context.skip("Requiere PostgreSQL real.");
  const supplier = await command(["suppliers"], { documentType: "DNI", documentNumber: "12345678", name: "Proveedor" }) as { id: string };
  const p = await product();
  const purchase = await command(["purchases"], { supplierName: "Proveedor", supplierId: supplier.id, credit: true, dueOn: "2090-01-01", lines: [{ productId: p.id, quantity: 1, unitCostCents: 100 }] }) as { id: string };
  const payable = await db.inventoryPayable.findUniqueOrThrow({ where: { purchaseId: purchase.id } });
  const results = await Promise.allSettled([1, 2].map(() => command(["payables", payable.id, "payments"], { amountCents: 100, method: "TRANSFER" })));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await db.inventoryPayable.findUniqueOrThrow({ where: { id: payable.id } })).paidCents, 100);
});

test("transferencia: borrador sin stock, despacho FEFO, tránsito, recepción idempotente y Kardex en ambas sedes", async () => {
  const p = await product({ stock: 12, expiry: true, factor: 6 });
  const destination = await command(["products"], { name: "Arroz destino", sku: p.item.sku, trackExpiry: true, presentations: [{ name: "Unidad", factor: 1, priceCents: 300 }] }, secondScope) as { id: string };
  const target = await db.retailProduct.findUniqueOrThrow({ where: { id: destination.id } });
  const transfer = await command(["transfers"], { destinationBranchId: secondScope.branchId, lines: [{ presentationId: p.presentations[0].id, quantity: 1 }] }) as { id: string };
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: p.itemId } })).stock, 12);
  await assert.rejects(command(["transfers", transfer.id, "dispatch"], {}, secondScope), code("NOT_FOUND"));
  await command(["transfers", transfer.id, "dispatch"], {});
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: p.itemId } })).stock, 6);
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: target.itemId } })).stock, 0);
  await assert.rejects(command(["transfers", transfer.id, "receive"], {}, otherScope), code("NOT_FOUND"));
  const receipt = { idempotencyKey: randomUUID() };
  const result = await command(["transfers", transfer.id, "receive"], receipt, secondScope);
  assert.deepEqual(await command(["transfers", transfer.id, "receive"], receipt, secondScope), result);
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: target.itemId } })).stock, 6);
  const lot = await db.retailLot.findFirstOrThrow({ where: { productId: target.id } }); assert.equal(lot.code, "A"); assert.equal(lot.stock, 6);
  assert.equal(await db.inventoryMovement.count({ where: { tenantId: scope.tenantId, originType: "RETAIL_TRANSFER", originId: transfer.id } }), 2);
  await assert.rejects(command(["transfers", transfer.id, "receive"], {}, secondScope), code("TRANSFER_INVALID"));
});

test("transferencia: recepción incompatible revierte completamente el destino", async () => {
  const p = await product({ stock: 2, expiry: true });
  const destination = await command(["products"], { name: "Destino", sku: p.item.sku, trackExpiry: true, presentations: [{ name: "Unidad", factor: 1, priceCents: 300 }] }, secondScope) as { id: string };
  await command(["purchases"], { supplierName: "Proveedor", lines: [{ productId: destination.id, quantity: 1, unitCostCents: 100, lotCode: "A", expiresOn: "2080-01-01" }] }, secondScope);
  const transfer = await command(["transfers"], { destinationBranchId: secondScope.branchId, lines: [{ presentationId: p.presentations[0].id, quantity: 1 }] }) as { id: string };
  await command(["transfers", transfer.id, "dispatch"], {});
  await assert.rejects(command(["transfers", transfer.id, "receive"], {}, secondScope), code("TRANSFER_INVALID"));
  assert.equal((await db.retailTransfer.findUniqueOrThrow({ where: { id: transfer.id } })).status, "DISPATCHED");
  assert.equal((await db.retailLot.findFirstOrThrow({ where: { productId: destination.id } })).stock, 1);
});

test("multicaja reutiliza turnos: dos cajeros no mezclan saldos ni pueden operar la caja ajena", async () => {
  const actor = await db.user.create({ data: { name: "Cajero dos", email: `${randomUUID()}@test.local`, passwordHash: "not-a-login" } });
  const cashier = { ...scope, actorId: actor.id, permissions: ["minimarket:cash:write", "minimarket:sales:write"] };
  const opened = await command(["cash"], { openingCents: 2000, registerName: "Caja dos" }, cashier) as { session: { id: string } };
  const p = await product({ stock: 4 });
  const paid = await checkoutRetail(cashier, { ...cart(p.presentations[0].id), cashSessionId: opened.session.id });
  assert.equal((await db.sale.findUniqueOrThrow({ where: { id: paid.id } })).cashSessionId, opened.session.id);
  assert.equal((await db.cashSession.findUniqueOrThrow({ where: { id: opened.session.id } })).expectedCents, 2300);
  assert.equal((await db.cashSession.findUniqueOrThrow({ where: { id: cashId } })).expectedCents, 10000);
  await assert.rejects(checkoutRetail(cashier, cart(p.presentations[0].id)), code("FORBIDDEN"));
  await assert.rejects(command(["cash", cashId, "movement"], { type: "OUT", amountCents: 100, reason: "Intento caja ajena" }, cashier), code("FORBIDDEN"));
  await assert.rejects(command(["cash", cashId, "close"], { countedCents: 10000, expectedCents: 10000 }, cashier), code("FORBIDDEN"));
  const view = await getMinimarketData(cashier, "checkout", new URLSearchParams());
  assert.deepEqual(view.cashSessions.map((c) => c.id), [opened.session.id]);
  assert.equal(view.cash?.id, opened.session.id);
  await command(["cash", opened.session.id, "close"], { countedCents: 2300, expectedCents: 2300 }, cashier);
  await assert.rejects(command(["cash"], { registerName: " CAJA PRINCIPAL ", openingCents: 0 }, cashier), code("CASH_ALREADY_OPEN"));
});

test("PostgreSQL: aperturas simultáneas de la misma caja conservan un único turno", async (context) => {
  if (!process.env.INVENTORY_TEST_DATABASE_URL) return context.skip("Requiere PostgreSQL real.");
  const scopes = await Promise.all([1, 2].map(async (number) => {
    const actor = await db.user.create({ data: { name: `Cajero ${number}`, email: `${randomUUID()}@test.local`, passwordHash: "not-a-login" } });
    return { ...scope, actorId: actor.id };
  }));
  const results = await Promise.allSettled(scopes.map((actor) => command(["cash"], { registerName: "Caja concurrente", openingCents: 0 }, actor)));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await db.cashSession.count({ where: { tenantId: scope.tenantId, branchId: scope.branchId, registerName: "Caja concurrente", status: "OPEN" } }), 1);
});

test("barcode exacto identifica presentación, respeta sucursal y oculta costos al cajero", async () => {
  const p = await product({ stock: 12 });
  const barcode = randomUUID();
  const pack = await command(["presentations"], { productId: p.id, name: "Pack seis", barcode, factor: 6, priceCents: 1500 }) as { id: string };
  const found = await lookupBarcode(scope, barcode);
  assert.equal(found.presentationId, pack.id);
  assert.equal(found.product.presentations.find((row) => row.id === pack.id)?.factor, 6);
  const cashier = await lookupBarcode({ ...scope, permissions: ["minimarket:sales:write"] }, barcode);
  assert.equal(cashier.product.unitCostCents, null); assert.deepEqual(cashier.movements, []);
  await assert.rejects(lookupBarcode(secondScope, barcode), code("NOT_FOUND"));
  await assert.rejects(lookupBarcode(otherScope, barcode), code("NOT_FOUND"));
  await assert.rejects(command(["presentations"], { productId: p.id, name: "Otra", barcode, factor: 1, priceCents: 300 }), (error: unknown) => error instanceof AppError && error.message.includes("Pack seis"));
});

test("conteo múltiple confirma todo con trazabilidad e idempotencia y revierte si una línea cambia", async () => {
  const first = await product({ stock: 10 }), second = await product({ stock: 5 });
  const input = { idempotencyKey: randomUUID(), lines: [{ productId: first.id, expectedStock: 10, countedStock: 8, reason: "Conteo físico verificado" }, { productId: second.id, expectedStock: 5, countedStock: 6, reason: "Conteo físico verificado" }] };
  const result = await command(["counts", "batch"], input) as { id: string };
  assert.deepEqual(await command(["counts", "batch"], input), result);
  assert.equal(await db.inventoryMovement.count({ where: { countId: result.id } }), 2);
  assert.equal(await db.inventoryCountLine.count({ where: { countId: result.id } }), 2);
  await assert.rejects(command(["counts", "batch"], { lines: [{ productId: first.id, expectedStock: 8, countedStock: 1, reason: "Prueba rollback completo" }, { productId: second.id, expectedStock: 5, countedStock: 1, reason: "Stock ya ha cambiado" }] }), code("STOCK_CHANGED"));
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: first.itemId } })).stock, 8);
});
async function refund(saleId: string, lineId: string, quantity: number, total: number, extra: Record<string, unknown> = {}) { return command(["sales", saleId, "refund"], { cashSessionId: cashId, reason: "Producto devuelto", payments: [{ method: "CASH", amountCents: total }], lines: [{ lineId, quantity, restock: true }], ...extra }); }

test("unidad/paquete/peso: compra, cobro mixto, snapshot inmutable e idempotencia", async () => {
  const p = await product({ stock: 20, factor: 6, price: 1500 });
  const input = cart(p.presentations[0].id, 2, 3000); input.payments = [{ method: "CASH", amountCents: 1000, reference: null }, { method: "YAPE", amountCents: 2000, reference: "Y-001" }]; input.cashReceivedCents = 2000; input.digitalPaymentConfirmed = true;
  const sale = await checkoutRetail(scope, input);
  assert.deepEqual(await checkoutRetail(scope, input), sale);
  assert.equal(sale.changeCents, 1000);
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: p.itemId } })).stock, 8);
  assert.equal((await db.cashSession.findUniqueOrThrow({ where: { id: cashId } })).expectedCents, 11000);
  const stored = await db.sale.findUniqueOrThrow({ where: { id: sale.id }, include: { payments: true } }); assert.equal(stored.payments.length, 2);
  await command(["presentations", p.presentations[0].id], { priceCents: 1600, active: true }, scope, "PATCH");
  assert.equal(JSON.parse(stored.commercialSnapshot!).lines[0].unitPriceCents, 1500);
  await assert.rejects(checkoutRetail(scope, { ...input, cashReceivedCents: 2100 }), code("IDEMPOTENCY_CONFLICT"));
  const weighted = await product({ weighted: true, stock: 2, price: 500 });
  await checkoutRetail(scope, cart(weighted.presentations[0].id, .375, 188));
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: weighted.itemId } })).stock, 1.625);
});

test("FEFO: el lote más próximo se consume primero y un lote vencido no se vende", async () => {
  const p = await product({ expiry: true, stock: 2 });
  await command(["purchases"], { supplierName: "Otro", lines: [{ productId: p.id, quantity: 3, unitCostCents: 200, lotCode: "B", expiresOn: "2080-01-01" }] });
  await checkoutRetail(scope, cart(p.presentations[0].id, 4, 1200));
  const lots = await db.retailLot.findMany({ where: { productId: p.id }, orderBy: { code: "asc" } }); assert.deepEqual(lots.map((l) => l.stock), [1, 0]);
  await db.retailLot.update({ where: { id: lots[0].id }, data: { expiresOn: "2000-01-01" } });
  await assert.rejects(checkoutRetail(scope, cart(p.presentations[0].id)), code("INSUFFICIENT_VALID_STOCK"));
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: p.itemId } })).stock, 1);
});

test("aislamiento: producto, compra, caja, cliente, devolución y consultas por empresa/sucursal", async () => {
  const p = await product({ stock: 10 }); const sale = await checkoutRetail(scope, cart(p.presentations[0].id));
  const line = await db.retailSaleLine.findFirstOrThrow({ where: { retailSale: { sale: { id: sale.id } } } });
  for (const foreign of [secondScope, otherScope]) {
    await assert.rejects(checkoutRetail(foreign, cart(p.presentations[0].id)), code("PRODUCT_NOT_FOUND"));
    await assert.rejects(command(["purchases"], { supplierName: "Intruso", lines: [{ productId: p.id, quantity: 1, unitCostCents: 100 }] }, foreign), code("NOT_FOUND"));
    await assert.rejects(command(["cash", cashId, "close"], { countedCents: 10300, expectedCents: 10300 }, foreign), code("NOT_FOUND"));
    await assert.rejects(command(["sales", sale.id, "refund"], { cashSessionId: cashId, reason: "Intrusión prueba", payments: [{ method: "CASH", amountCents: 300 }], lines: [{ lineId: line.id, quantity: 1, restock: true }] }, foreign), code("NOT_FOUND"));
    assert.equal((await getMinimarketData(foreign, "catalog", new URLSearchParams())).products.length, 0);
    assert.equal((await getMinimarketData(foreign, "sales", new URLSearchParams())).sales.length, 0);
  }
  const customer = await db.customer.create({ data: { tenantId: otherScope.tenantId, name: "Ajeno" } });
  await assert.rejects(checkoutRetail(scope, { ...cart(p.presentations[0].id), customerId: customer.id }));
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: p.itemId } })).stock, 9);
});

test("rollback de cobro: pago inválido, caja cerrada y fallo de auditoría revierten venta, lotes, stock y clave", async (context) => {
  const p = await product({ expiry: true, stock: 10 });
  const before = await db.retailOperation.count({ where: { tenantId: scope.tenantId } });
  await assert.rejects(checkoutRetail(scope, cart(p.presentations[0].id, 1, 1)), code("PAYMENT_TOTAL_MISMATCH"));
  await assert.rejects(checkoutRetail(scope, { ...cart(p.presentations[0].id), cashSessionId: "foreign-cash" }));
  context.mock.method(prisma, "$transaction", ((operation: (tx: unknown) => Promise<unknown>) => db.$transaction((tx) => operation(new Proxy(tx, { get(target, key) { if (key === "auditLog") return { create: async () => { throw new Error("audit failure"); } }; return Reflect.get(target, key); } })))) as typeof prisma.$transaction);
  await assert.rejects(checkoutRetail(scope, cart(p.presentations[0].id)), /audit failure/);
  assert.equal(await db.sale.count({ where: { tenantId: scope.tenantId } }), 0);
  assert.equal(await db.retailOperation.count({ where: { tenantId: scope.tenantId } }), before);
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: p.itemId } })).stock, 10);
  assert.equal((await db.retailLot.findUniqueOrThrow({ where: { id: p.lots[0].id } })).stock, 10);
});

test("devoluciones parciales: redondeo acumulado, límite por método, reposición y repetición", async () => {
  const p = await product({ weighted: true, stock: 2, price: 101 }); const sale = await checkoutRetail(scope, cart(p.presentations[0].id, 1, 101));
  const line = await db.retailSaleLine.findFirstOrThrow({ where: { retailSale: { sale: { id: sale.id } } } });
  const idempotencyKey = randomUUID();
  await refund(sale.id, line.id, .5, 51, { idempotencyKey });
  await refund(sale.id, line.id, .5, 51, { idempotencyKey });
  await assert.rejects(refund(sale.id, line.id, .5, 50, { payments: [{ method: "CARD", amountCents: 50 }] }), code("REFUND_METHOD_LIMIT"));
  await refund(sale.id, line.id, .5, 50);
  await assert.rejects(refund(sale.id, line.id, .1, 10), code("RETURN_EXCEEDS_SALE"));
  assert.equal((await db.sale.findUniqueOrThrow({ where: { id: sale.id } })).status, "REFUNDED");
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: p.itemId } })).stock, 2);
  assert.equal((await db.cashSession.findUniqueOrThrow({ where: { id: cashId } })).expectedCents, 10000);
});

test("devolución de lotes: daños no reponen y vencidos rechazan reposición sin efectos", async () => {
  const p = await product({ expiry: true, stock: 3 }); const sale = await checkoutRetail(scope, cart(p.presentations[0].id, 2, 600));
  const line = await db.retailSaleLine.findFirstOrThrow({ where: { retailSale: { sale: { id: sale.id } } } });
  await db.retailLot.update({ where: { id: p.lots[0].id }, data: { expiresOn: "2000-01-01" } });
  await assert.rejects(refund(sale.id, line.id, 1, 300), code("EXPIRED_RETURN"));
  await refund(sale.id, line.id, 1, 300, { lines: [{ lineId: line.id, quantity: 1, restock: false }] });
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: p.itemId } })).stock, 1);
  assert.equal((await db.retailSaleLine.findUniqueOrThrow({ where: { id: line.id } })).returnedQuantity, 1);
});

test("compra/conteo: reintentos, lote obligatorio, costo ponderado y cambio de stock", async () => {
  const p = await product({ expiry: true, stock: 2 });
  const input = { idempotencyKey: randomUUID(), supplierName: "Proveedor", lines: [{ productId: p.id, quantity: 2, unitCostCents: 300, lotCode: "A", expiresOn: "2090-01-01" }] };
  await command(["purchases"], input); await command(["purchases"], input);
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: p.itemId } })).unitCostCents, 200);
  await assert.rejects(command(["counts"], { productId: p.id, expectedStock: 4, countedStock: 1, reason: "Inventario físico" }), code("LOT_REQUIRED"));
  await assert.rejects(command(["counts"], { productId: p.id, lotId: p.lots[0].id, expectedStock: 2, countedStock: 1, reason: "Inventario físico" }), code("STOCK_CHANGED"));
  const count = { idempotencyKey: randomUUID(), productId: p.id, lotId: p.lots[0].id, expectedStock: 4, countedStock: 1, reason: "Inventario físico" };
  await command(["counts"], count); await command(["counts"], count);
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: p.itemId } })).stock, 1);
  assert.equal((await db.retailLot.findUniqueOrThrow({ where: { id: p.lots[0].id } })).stock, 1);
});

test("permisos cerrados y datos mínimos de POS; no expone costos, reportes ni usuarios", async () => {
  await product({ stock: 2 });
  const session = { tenantType: "MINIMARKET", enabledModules: ["pos", "catalog", "reports"], permissions: ["minimarket:sales:write"] } as AuthSession;
  assert.doesNotThrow(() => assertMinimarketAccess(session, "pos"));
  assert.throws(() => assertMinimarketAccess(session, "reports"), code("FORBIDDEN"));
  assert.throws(() => assertMinimarketAccess(session, "checkout"), code("MODULE_DISABLED"));
  assert.throws(() => minimarketPermission("unknown", "POST"), code("NOT_FOUND"));
  const data = await getMinimarketData({ ...scope, permissions: session.permissions }, "pos", new URLSearchParams());
  assert.equal(data.products[0].unitCostCents, null); assert.equal(data.summary, null); assert.deepEqual(data.sales, []); assert.deepEqual(data.customers, []);
});

test("devolución mixta y recibo mínimo conservan métodos sin revelar costos", async () => {
  const p = await product({ stock: 2 });
  const input = cart(p.presentations[0].id, 2, 600);
  input.payments = [{ method: "CASH", amountCents: 200, reference: null }, { method: "CARD", amountCents: 400, reference: "voucher" }];
  const sale = await checkoutRetail(scope, input);
  const line = await db.retailSaleLine.findFirstOrThrow({ where: { retailSale: { sale: { id: sale.id } } } });
  await refund(sale.id, line.id, 2, 600, { payments: input.payments });
  assert.equal((await db.cashSession.findUniqueOrThrow({ where: { id: cashId } })).expectedCents, 10000);
  const receipt = await handleMinimarketCommand("GET", ["sales", sale.id], undefined, scope);
  assert.equal(JSON.stringify(receipt).includes("unitCostCents"), false);
  const report = await getMinimarketData(scope, "reports", new URLSearchParams());
  assert.equal(report.summary?.salesCents, 600); assert.equal(report.summary?.refundedCents, 600);
});

test("compra con línea ajena revierte lotes anteriores y una devolución sin efectivo revierte reposición", async () => {
  const p = await product({ expiry: true, stock: 1 });
  await assert.rejects(command(["purchases"], { supplierName: "Proveedor", lines: [{ productId: p.id, quantity: 1, unitCostCents: 100, lotCode: "A", expiresOn: "2090-01-01" }, { productId: "other-product", quantity: 1, unitCostCents: 1 }] }), code("NOT_FOUND"));
  assert.equal((await db.retailLot.findUniqueOrThrow({ where: { id: p.lots[0].id } })).stock, 1);
  const sale = await checkoutRetail(scope, cart(p.presentations[0].id));
  const line = await db.retailSaleLine.findFirstOrThrow({ where: { retailSale: { sale: { id: sale.id } } } });
  await command(["cash", cashId, "movement"], { type: "OUT", amountCents: 10300, reason: "Depósito bancario" });
  await assert.rejects(refund(sale.id, line.id, 1, 300), code("CASH_UNAVAILABLE"));
  assert.equal((await db.retailSaleLine.findUniqueOrThrow({ where: { id: line.id } })).returnedQuantity, 0);
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: p.itemId } })).stock, 0);
  assert.equal((await db.retailLot.findUniqueOrThrow({ where: { id: p.lots[0].id } })).stock, 0);
});

function barrier(context: TestContext) {
  let arrived = 0, timeout = false; let release!: () => void;
  const gate = new Promise<void>((resolveGate) => { release = resolveGate; });
  const timer = setTimeout(() => { timeout = true; release(); }, 10000); context.after(() => clearTimeout(timer));
  const original = PrismaCheckoutPort.prototype.checkQuota;
  context.mock.method(PrismaCheckoutPort.prototype, "checkQuota", async function (this: PrismaCheckoutPort) { if (arrived < 2) { arrived++; if (arrived === 2) release(); await gate; } return original.call(this); });
  return () => { assert.equal(timeout, false); assert.equal(arrived, 2); };
}
test("PostgreSQL: dos cajeros compiten por la última unidad sin stock negativo", { skip: !process.env.INVENTORY_TEST_DATABASE_URL }, async (context) => {
  const p = await product({ expiry: true, stock: 1 }); const synchronized = barrier(context);
  const results = await Promise.allSettled([checkoutRetail(scope, cart(p.presentations[0].id)), checkoutRetail(scope, cart(p.presentations[0].id))]); synchronized();
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await db.sale.count({ where: { tenantId: scope.tenantId } }), 1);
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: p.itemId } })).stock, 0);
  assert.equal((await db.cashSession.findUniqueOrThrow({ where: { id: cashId } })).expectedCents, 10300);
});
test("PostgreSQL: cobros simultáneos con la misma clave crean una venta", { skip: !process.env.INVENTORY_TEST_DATABASE_URL }, async () => {
  const p = await product({ stock: 10 }); const input = cart(p.presentations[0].id);
  const results = await Promise.all([checkoutRetail(scope, input), checkoutRetail(scope, input)]);
  assert.equal(results[0].id, results[1].id);
  assert.equal(await db.sale.count({ where: { tenantId: scope.tenantId } }), 1);
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: p.itemId } })).stock, 9);
});
test("PostgreSQL: devoluciones simultáneas no exceden lo vendido", { skip: !process.env.INVENTORY_TEST_DATABASE_URL }, async () => {
  const p = await product({ stock: 1 }); const sale = await checkoutRetail(scope, cart(p.presentations[0].id));
  const line = await db.retailSaleLine.findFirstOrThrow({ where: { retailSale: { sale: { id: sale.id } } } });
  const results = await Promise.allSettled([refund(sale.id, line.id, 1, 300), refund(sale.id, line.id, 1, 300)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: p.itemId } })).stock, 1);
  assert.equal((await db.cashSession.findUniqueOrThrow({ where: { id: cashId } })).expectedCents, 10000);
});
test("PostgreSQL: compras simultáneas preservan stock de artículo y lote", { skip: !process.env.INVENTORY_TEST_DATABASE_URL }, async () => {
  const p = await product({ expiry: true, stock: 1 });
  await Promise.all([1, 2].map(() => command(["purchases"], { supplierName: "Proveedor", lines: [{ productId: p.id, quantity: 2, unitCostCents: 100, lotCode: "A", expiresOn: "2090-01-01" }] })));
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: p.itemId } })).stock, 5);
  assert.equal((await db.retailLot.findUniqueOrThrow({ where: { id: p.lots[0].id } })).stock, 5);
});

async function configureFiscal() {
  await saveSunatCredentials(scope, { apiUrl: "https://api.nubefact.com/api/v1/local-test", environment: "BETA", token: "test-only-no-live-credentials" });
  await command(["fiscal", "settings"], { enabled: true, environment: "BETA", taxRatePct: 18, invoiceSeries: "F001", receiptSeries: "B001" });
}
async function classifiedProduct(options: Parameters<typeof product>[0] = {}) {
  const p = await product(options);
  await command(["products", p.id], { name: p.item.name, category: p.category, minimumStock: 0, active: true, taxCategory: "GRAVADA" }, scope, "PATCH");
  return p;
}
const acceptFiscal = () => Response.json({ aceptada_por_sunat: true, enlace_del_pdf: "https://example.com/comprobante.pdf" });

test("fiscal: el cobro reserva trama y outbox atómicos; factura usa cliente, moneda y peso históricos", async (context) => {
  await configureFiscal();
  const p = await classifiedProduct({ weighted: true, stock: 3, price: 1180, factor: 2 });
  const buyer = await command(["customers"], { name: "Razón original", dni: "20123456789" }) as { id: string };
  const input = { ...cart(p.presentations[0].id, .5, 590), documentKind: "FACTURA" as const, customerId: buyer.id };
  const sale = await checkoutRetail(scope, input);
  assert.deepEqual(await checkoutRetail(scope, input), sale);
  const queued = await db.fiscalJob.findFirstOrThrow({ where: { saleId: sale.id } });
  assert.equal(queued.status, "PENDING"); assert.equal(queued.attempts, 0);
  const payload = JSON.parse(queued.payload); assert.equal(payload.items[0].unidad_de_medida, "KGM"); assert.equal(payload.items[0].cantidad, 1); assert.equal(payload.total, 5.9); assert.equal(payload.total_igv, .9);
  await db.customer.update({ where: { id: buyer.id }, data: { name: "Nombre cambiado" } });
  await db.tenant.update({ where: { id: scope.tenantId }, data: { currency: "USD" } });
  await command(["fiscal", "settings"], { enabled: true, environment: "BETA", taxRatePct: 0, invoiceSeries: "F002", receiptSeries: "B002" });
  let calls = 0;
  context.mock.method(globalThis, "fetch", async (_url: string | URL | Request, options?: RequestInit) => { calls++; const sent = JSON.parse(String(options?.body)); assert.equal(sent.cliente_denominacion, "Razón original"); assert.equal(sent.moneda, 1); assert.equal(sent.serie, "F001"); return acceptFiscal(); });
  assert.equal((await deliverFiscalJob(scope, queued.id, true)).status, "ISSUED");
  await deliverFiscalJob(scope, queued.id, true); assert.equal(calls, 1);
  const data = await getMinimarketData(scope, "sales", new URLSearchParams()); assert.equal(data.sales[0].fiscalJobs[0].status, "ISSUED");
});

test("fiscal: clasificación pendiente o factura sin RUC revierte caja, stock, venta, clave y correlativo", async () => {
  await configureFiscal(); const p = await product({ stock: 2 });
  const input = { ...cart(p.presentations[0].id), documentKind: "BOLETA" as const };
  await assert.rejects(checkoutRetail(scope, input), code("FISCAL_CLASSIFICATION"));
  await command(["products", p.id], { name: p.item.name, category: p.category, minimumStock: 0, active: true, taxCategory: "GRAVADA" }, scope, "PATCH");
  await assert.rejects(checkoutRetail(scope, { ...input, documentKind: "FACTURA" }), code("FISCAL_CLASSIFICATION"));
  assert.equal(await db.sale.count({ where: { tenantId: scope.tenantId } }), 0);
  assert.equal(await db.fiscalJob.count({ where: { tenantId: scope.tenantId } }), 0);
  assert.equal(await db.restaurantDocumentSequence.count({ where: { tenantId: scope.tenantId } }), 0);
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: p.itemId } })).stock, 2);
  assert.equal((await db.cashSession.findUniqueOrThrow({ where: { id: cashId } })).expectedCents, 10000);
  const sale = await checkoutRetail(scope, input); assert.ok(sale.id);
});

test("fiscal: devolución parcial exige original aceptado y conserva hasta el último céntimo de IGV", async (context) => {
  await configureFiscal(); const p = await classifiedProduct({ stock: 3, price: 100 });
  const sale = await checkoutRetail(scope, { ...cart(p.presentations[0].id, 3, 300), documentKind: "BOLETA" });
  const original = await db.fiscalJob.findFirstOrThrow({ where: { saleId: sale.id } });
  const line = await db.retailSaleLine.findFirstOrThrow({ where: { retailSale: { sale: { id: sale.id } } } });
  await assert.rejects(refund(sale.id, line.id, 1, 100), code("FISCAL_STATUS_PENDING"));
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: p.itemId } })).stock, 0);
  assert.equal((await db.cashSession.findUniqueOrThrow({ where: { id: cashId } })).expectedCents, 10300);
  context.mock.method(globalThis, "fetch", async () => acceptFiscal());
  await deliverFiscalJob(scope, original.id, true);
  const key = randomUUID();
  await refund(sale.id, line.id, 1, 100, { idempotencyKey: key }); await refund(sale.id, line.id, 1, 100, { idempotencyKey: key });
  await refund(sale.id, line.id, 1, 100); await refund(sale.id, line.id, 1, 100);
  const notes = await db.fiscalJob.findMany({ where: { saleId: sale.id, kind: "CREDIT_NOTE" }, orderBy: { number: "asc" } });
  assert.equal(notes.length, 3);
  const payloads = notes.map((note) => JSON.parse(note.payload));
  assert.deepEqual(payloads.map((p) => Math.round(p.total_gravada * 100)), [85, 84, 85]);
  assert.equal(payloads.reduce((sum, p) => sum + Math.round(p.total_igv * 100), 0), 46);
  assert.ok(payloads.every((p) => p.tipo_de_nota_de_credito === 7 && p.documento_que_se_modifica_numero === original.number));
  assert.equal((await db.sale.findUniqueOrThrow({ where: { id: sale.id } })).status, "REFUNDED");
  for (const note of notes) await deliverFiscalJob(scope, note.id, true);
});

test("fiscal: empresa, sucursal y ruta del proveedor quedan aisladas en los reintentos", async (context) => {
  await configureFiscal(); const p = await classifiedProduct({ stock: 1 });
  const sale = await checkoutRetail(scope, { ...cart(p.presentations[0].id), documentKind: "BOLETA" });
  const job = await db.fiscalJob.findFirstOrThrow({ where: { saleId: sale.id } });
  await assert.rejects(deliverFiscalJob(secondScope, job.id, true), code("NOT_FOUND"));
  await assert.rejects(deliverFiscalJob(otherScope, job.id, true), code("NOT_FOUND"));
  await db.restaurantIntegrationCredential.update({ where: { tenantId_provider: { tenantId: scope.tenantId, provider: "NUBEFACT" } }, data: { apiUrl: "https://api.nubefact.com/api/v1/other-account" } });
  await assert.rejects(deliverFiscalJob(scope, job.id, true), code("SUNAT_ACCOUNT_CHANGED"));
  assert.equal((await db.fiscalJob.findUniqueOrThrow({ where: { id: job.id } })).apiUrl, job.apiUrl);
  await db.restaurantIntegrationCredential.update({ where: { tenantId_provider: { tenantId: scope.tenantId, provider: "NUBEFACT" } }, data: { apiUrl: job.apiUrl } });
  context.mock.method(globalThis, "fetch", async () => acceptFiscal());
  assert.equal((await deliverFiscalJob(scope, job.id, true)).status, "ISSUED");
});

test("fiscal: error después de reservar outbox revierte toda la venta", async (context) => {
  await configureFiscal(); const p = await classifiedProduct({ stock: 1 });
  const record = PrismaCheckoutPort.prototype.record;
  context.mock.method(PrismaCheckoutPort.prototype, "record", async function(this: PrismaCheckoutPort, ...args: Parameters<typeof record>) { await record.apply(this, args); throw new Error("failure after outbox"); });
  await assert.rejects(checkoutRetail(scope, { ...cart(p.presentations[0].id), documentKind: "BOLETA" }), /failure after outbox/);
  assert.equal(await db.fiscalJob.count({ where: { tenantId: scope.tenantId } }), 0);
  assert.equal(await db.restaurantElectronicDocument.count({ where: { tenantId: scope.tenantId } }), 0);
  assert.equal(await db.sale.count({ where: { tenantId: scope.tenantId } }), 0);
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: p.itemId } })).stock, 1);
});

test("fiscal: lease vencida se concilia; una respuesta antigua no sobreescribe un intento nuevo", async (context) => {
  await configureFiscal(); const p = await classifiedProduct({ stock: 1 });
  const sale = await checkoutRetail(scope, { ...cart(p.presentations[0].id), documentKind: "BOLETA" });
  const job = await db.fiscalJob.findFirstOrThrow({ where: { saleId: sale.id } });
  let release!: () => void; let entered!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const hold = new Promise<void>((resolve) => { release = resolve; });
  context.mock.method(globalThis, "fetch", async (_url: string | URL | Request, options?: RequestInit) => { const body = JSON.parse(String(options?.body)); if (body.operacion === "generar_comprobante") { entered(); await hold; return Response.json({ aceptada_por_sunat: false }); } return acceptFiscal(); });
  const first = deliverFiscalJob(scope, job.id, true); await started;
  await db.fiscalJob.update({ where: { id: job.id }, data: { leaseExpiresAt: new Date(0) } });
  await deliverFiscalJob(scope, job.id, true); release();
  await assert.rejects(first, code("DOCUMENT_LEASE_LOST"));
  assert.equal((await db.fiscalJob.findUniqueOrThrow({ where: { id: job.id } })).status, "ISSUED");
});

test("PostgreSQL: cobros fiscales repetidos y dos trabajadores conservan una sola identidad", { skip: !process.env.INVENTORY_TEST_DATABASE_URL }, async (context) => {
  await configureFiscal(); const p = await classifiedProduct({ stock: 1 });
  const input = { ...cart(p.presentations[0].id), documentKind: "BOLETA" as const };
  const sales = await Promise.all([checkoutRetail(scope, input), checkoutRetail(scope, input)]); assert.equal(sales[0].id, sales[1].id);
  const jobs = await db.fiscalJob.findMany({ where: { saleId: sales[0].id } }); assert.equal(jobs.length, 1);
  let sends = 0; context.mock.method(globalThis, "fetch", async () => { sends++; return acceptFiscal(); });
  const results = await Promise.allSettled([deliverFiscalJob(scope, jobs[0].id, true), deliverFiscalJob(scope, jobs[0].id, true)]);
  assert.ok(results.some((r) => r.status === "fulfilled"));
  for (const r of results) if (r.status === "rejected") assert.ok(code("DOCUMENT_BUSY")(r.reason));
  assert.equal(sends, 1);
});

test("fiscal: trabajador respeta backoff, recupera tomas y deja revisión después de diez intentos", async (context) => {
  await configureFiscal(); const p = await classifiedProduct({ stock: 1 });
  const sale = await checkoutRetail(scope, { ...cart(p.presentations[0].id), documentKind: "BOLETA" });
  const job = await db.fiscalJob.findFirstOrThrow({ where: { saleId: sale.id } });
  // The PostgreSQL release suite shares a database with other test files.
  // Make this fixture due first so their pending jobs cannot fill the batch.
  await db.fiscalJob.update({ where: { id: job.id }, data: { nextAttemptAt: new Date(0) } });
  context.mock.method(globalThis, "fetch", async () => { throw new Error("provider offline"); });
  await runFiscalBatch();
  const failed = await db.fiscalJob.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(failed.status, "UNKNOWN"); assert.equal(failed.attempts, 1); assert.ok(failed.nextAttemptAt > new Date());
  await runFiscalBatch(); assert.equal((await db.fiscalJob.findUniqueOrThrow({ where: { id: job.id } })).attempts, 1);
  await db.fiscalJob.update({ where: { id: job.id }, data: { status: "SENDING", attempts: 9, leaseToken: "expired-test", leaseExpiresAt: new Date(0), nextAttemptAt: new Date(0) } });
  await runFiscalBatch(); assert.equal((await db.fiscalJob.findUniqueOrThrow({ where: { id: job.id } })).status, "REVIEW");
  await runFiscalBatch(); assert.equal((await db.fiscalJob.findUniqueOrThrow({ where: { id: job.id } })).attempts, 10);
  context.mock.method(globalThis, "fetch", async () => acceptFiscal());
  await deliverFiscalJob(scope, job.id, true); assert.equal((await db.fiscalJob.findUniqueOrThrow({ where: { id: job.id } })).status, "ISSUED");
});

test("fiscal: aceptación y auditoría se confirman juntas; un fallo deja una toma recuperable", async (context) => {
  await configureFiscal(); const p = await classifiedProduct({ stock: 1 });
  const sale = await checkoutRetail(scope, { ...cart(p.presentations[0].id), documentKind: "BOLETA" });
  const job = await db.fiscalJob.findFirstOrThrow({ where: { saleId: sale.id } });
  context.mock.method(globalThis, "fetch", async () => acceptFiscal());
  context.mock.method(prisma, "$transaction", async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: { isolationLevel?: Prisma.TransactionIsolationLevel }) => db.$transaction(async (tx) => {
    const proxy = Object.create(tx);
    proxy.auditLog = { create: async (input: Prisma.AuditLogCreateArgs) => { if (input.data.action === "FISCAL_ISSUED") throw new Error("audit unavailable"); return tx.auditLog.create(input); } };
    return callback(proxy);
  }, options));
  await assert.rejects(deliverFiscalJob(scope, job.id, true), /audit unavailable/);
  assert.equal((await db.fiscalJob.findUniqueOrThrow({ where: { id: job.id } })).status, "SENDING");
  assert.equal((await db.restaurantElectronicDocument.findUniqueOrThrow({ where: { saleId: sale.id } })).status, "PENDING");
  assert.equal((await db.sale.findUniqueOrThrow({ where: { id: sale.id } })).status, "PAID");
});

test("PostgreSQL: devoluciones fiscales concurrentes no duplican nota, dinero ni mercadería", { skip: !process.env.INVENTORY_TEST_DATABASE_URL }, async (context) => {
  await configureFiscal(); const p = await classifiedProduct({ stock: 1, price: 118 });
  const sale = await checkoutRetail(scope, { ...cart(p.presentations[0].id, 1, 118), documentKind: "BOLETA" });
  const original = await db.fiscalJob.findFirstOrThrow({ where: { saleId: sale.id } });
  context.mock.method(globalThis, "fetch", async () => acceptFiscal()); await deliverFiscalJob(scope, original.id, true);
  const line = await db.retailSaleLine.findFirstOrThrow({ where: { retailSale: { sale: { id: sale.id } } } });
  const results = await Promise.allSettled([refund(sale.id, line.id, 1, 118), refund(sale.id, line.id, 1, 118)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  for (const r of results) if (r.status === "rejected") assert.ok(code("RETURN_EXCEEDS_SALE")(r.reason));
  const notes = await db.fiscalJob.findMany({ where: { saleId: sale.id, kind: "CREDIT_NOTE" } });
  assert.equal(notes.length, 1); assert.equal(JSON.parse(notes[0].payload).total_igv, .18);
  assert.equal((await db.cashSession.findUniqueOrThrow({ where: { id: cashId } })).expectedCents, 10000);
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: p.itemId } })).stock, 1);
});


test("promoción por presentación conserva descuento fiscal y devolución, ámbito y vigencia", async () => {
  const p = await product({ stock: 20 }); const id = p.presentations[0].id;
  const input = { name: "Tres por dos", kind: "3X2", value: 0, retailProductId: p.id, retailPresentationId: id, priority: 10, minQuantity: 3 };
  await command(["promotions"], input);
  await command(["promotions"], { ...input, name: "Oferta vencida", kind: "PERCENT", value: 90, priority: 100, endsAt: "2000-01-01T00:00:00.000Z" });
  await assert.rejects(command(["promotions"], input, otherScope), code("NOT_FOUND"));
  const quote = await quoteRetail(scope, { lines: [{ presentationId: id, quantity: 3 }] });
  assert.equal(quote.totalCents, 600); assert.equal(quote.discountCents, 300);
  const result = await checkoutRetail(scope, cart(id, 3, 600));
  const sale = await db.sale.findUniqueOrThrow({ where: { id: result.id }, include: { retailSale: { include: { lines: true } } } });
  assert.equal(sale.discountCents, 300); const snapshot = JSON.parse(sale.commercialSnapshot!);
  assert.equal(snapshot.lines[0].totalCents, 900); assert.equal(snapshot.lines[0].discountCents, 300);
  assert.equal(commercialFiscalSource(snapshot, sale.code, sale.createdAt).lines[0].totalCents, 600);
  const detail = sale.retailSale!.lines[0]; assert.equal(detail.totalCents, 600);
  await refund(sale.id, detail.id, 1, 200); await refund(sale.id, detail.id, 2, 400);
  assert.equal((await db.cashSession.findUniqueOrThrow({ where: { id: cashId } })).expectedCents, 10000);
});


test("permisos granulares no conceden retiros, compras ni catálogo completo", () => {
  assert.equal(hasPermission(["minimarket:cash:open"], "minimarket:cash:read"), true);
  assert.equal(hasPermission(["minimarket:cash:open"], minimarketPermission("cash", "POST", "movement")), false);
  assert.equal(hasPermission(["minimarket:counts:write"], minimarketPermission("purchases", "POST")), false);
  assert.equal(hasPermission(["minimarket:prices:write"], minimarketPermission("products", "POST")), false);
  assert.equal(hasPermission(["minimarket:cash:write"], minimarketPermission("cash", "POST", "close")), true);
  assert.equal(hasPermission(["inventory:write"], minimarketPermission("counts", "POST")), true);
});

test("reportes usan costos históricos, separan merma devuelta y alertas configuradas", async () => {
  const p = await product({ stock: 4, expiry: true });
  await command(["products", p.id], { name: "Arroz", category: "General", minimumStock: 4, active: true, expiryAlertDays: 10 }, scope, "PATCH");
  const today = new Date(); const next = new Date(today.getTime() + 8 * 86400000).toISOString().slice(0, 10);
  await db.retailLot.update({ where: { id: p.lots[0].id }, data: { expiresOn: next } });
  const sale = await checkoutRetail(scope, cart(p.presentations[0].id, 2, 600));
  const line = await db.retailSaleLine.findFirstOrThrow({ where: { retailSale: { sale: { id: sale.id } } } });
  await refund(sale.id, line.id, 1, 300, { lines: [{ lineId: line.id, quantity: 1, restock: false }] });
  const report = await getMinimarketData(scope, "reports", new URLSearchParams());
  assert.equal(report.report?.marginCents, 100); // 300 net paid minus 200 cost; damaged return is not restocked.
  assert.equal(report.report?.byPayment[0].refundedCents, 300); assert.equal(report.report?.expiringCount, 1);
  assert.equal(report.report?.byBranch.length, 1);
  const foreign = await getMinimarketData(otherScope, "reports", new URLSearchParams()); assert.equal(foreign.report?.analyzedSales, 0);
});

test("PostgreSQL: dos recepciones de transferencia y pagos simultáneos no duplican stock ni exceden deuda", async (context) => {
  if (!process.env.INVENTORY_TEST_DATABASE_URL) return context.skip("Requiere PostgreSQL real.");
  const p = await product({ stock: 2 });
  const dest = await command(["products"], { name: "Destino", sku: p.item.sku, presentations: [{ name: "Unidad", factor: 1, priceCents: 300 }] }, secondScope) as { id: string };
  const transfer = await command(["transfers"], { destinationBranchId: secondScope.branchId, lines: [{ presentationId: p.presentations[0].id, quantity: 2 }] }) as { id: string };
  await command(["transfers", transfer.id, "dispatch"], {});
  const receipts = await Promise.allSettled([1, 2].map(() => command(["transfers", transfer.id, "receive"], {}, secondScope)));
  assert.equal(receipts.filter((r) => r.status === "fulfilled").length, 1);
  const target = await db.retailProduct.findUniqueOrThrow({ where: { id: dest.id }, include: { item: true } }); assert.equal(target.item.stock, 2);
  const supplier = await command(["suppliers"], { documentType: "OTHER", documentNumber: "SUP", name: "Proveedor" }) as { id: string };
  const purchase = await command(["purchases"], { supplierName: "Proveedor", supplierId: supplier.id, credit: true, dueOn: "2090-01-01", lines: [{ productId: p.id, quantity: 1, unitCostCents: 100 }] }) as { id: string };
  const payable = await db.inventoryPayable.findFirstOrThrow({ where: { purchaseId: purchase.id } });
  const payments = await Promise.allSettled([1, 2].map(() => command(["payables", payable.id, "payments"], { method: "CASH", amountCents: 75, cashSessionId: cashId })));
  assert.equal(payments.filter((r) => r.status === "fulfilled").length, 1); assert.equal((await db.inventoryPayable.findUniqueOrThrow({ where: { id: payable.id } })).paidCents, 75);
});


test("conteo de varios lotes de un artículo conserva resumen único y detalle por lote", async () => {
  const p = await product({ stock: 4, expiry: true });
  await command(["purchases"], { supplierName: "Proveedor", lines: [{ productId: p.id, quantity: 3, unitCostCents: 100, lotCode: "B", expiresOn: "2091-01-01" }] });
  const lots = await db.retailLot.findMany({ where: { productId: p.id }, orderBy: { code: "asc" } });
  const input = { lines: lots.map((lot) => ({ productId: p.id, lotId: lot.id, expectedStock: lot.stock, countedStock: lot.stock - 1, reason: "Conteo físico por lote" })) };
  const result = await command(["counts", "batch"], input) as { id: string };
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: p.itemId } })).stock, 5);
  const lines = await db.inventoryCountLine.findMany({ where: { countId: result.id } }); assert.equal(lines.length, 1); assert.equal(lines[0].difference, -2);
  assert.equal(await db.inventoryMovement.count({ where: { countId: result.id } }), 2);
});
