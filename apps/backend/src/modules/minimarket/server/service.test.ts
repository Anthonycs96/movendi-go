import { saveSunatCredentials } from "@/modules/invoicing/server/connection";
import { deliverFiscalJob, runFiscalBatch } from "@/modules/invoicing/server/outbox";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
  for (const model of ["fiscalConfiguration", "fiscalJob", "restaurantIntegrationCredential", "restaurantElectronicDocument", "tenant", "branch", "retailProduct", "retailPresentation", "retailSale", "retailSaleLine", "retailLot", "retailOperation", "cashSession", "cashMovement", "sale", "inventoryItem", "inventoryMovement", "inventoryPurchase", "customer"] as const) {
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
async function refund(saleId: string, lineId: string, quantity: number, total: number, extra: Record<string, unknown> = {}) { return command(["sales", saleId, "refund"], { cashSessionId: cashId, reason: "Producto devuelto", payments: [{ method: "CASH", amountCents: total }], lines: [{ lineId, quantity, restock: true }], ...extra }); }

test("unidad/paquete/peso: compra, cobro mixto, snapshot inmutable e idempotencia", async () => {
  const p = await product({ stock: 20, factor: 6, price: 1500 });
  const input = cart(p.presentations[0].id, 2, 3000); input.payments = [{ method: "CASH", amountCents: 1000, reference: null }, { method: "YAPE", amountCents: 2000, reference: "Y-001" }]; input.cashReceivedCents = 2000;
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
