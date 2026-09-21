import { consumeRestaurantSaleInventory, reverseRestaurantSaleInventory } from "@/modules/restaurant/server/sale-inventory";
import { TransactionConflictError, withSerializableTransaction } from "@/core/database/transactions";
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
import { assertLoginAllowed } from "@/core/auth/login-throttle";
import type { TenantScope } from "@/core/auth/types";
import { prisma } from "@/core/database/prisma";
import type { InventoryPurchaseInput } from "../public";
import { PrismaInventoryRepository } from "../infrastructure/prisma/prisma-inventory-repository";
import { applyInventoryMovement, registerInventoryCount, registerInventoryPurchase, type InventoryMovementInput } from "./service";
import { inventoryCountCode } from "./operation-code";
import { handleInventoryOperation } from "@/core/composition/inventory";

// SQLite uses real migrations; the PostgreSQL runner owns its disposable schema.
const require = createRequire(import.meta.url);
let directory: string;
let db: PrismaClient;
let scope: TenantScope;
let secondBranchId: string;
let otherTenantId: string;

before(async () => {
  const postgresUrl = process.env.INVENTORY_TEST_DATABASE_URL;
  if (postgresUrl) {
    const parsed = new URL(postgresUrl);
    assert.equal(parsed.hostname, "127.0.0.1");
    assert.equal(parsed.pathname, "/inventory_hexagonal_test");
    assert.equal(parsed.username, "inventory_test");
    assert.ok(process.env.INVENTORY_TEST_CLIENT);
    const { PrismaClient: PostgresClient } = require(process.env.INVENTORY_TEST_CLIENT!) as { PrismaClient: typeof PrismaClient };
    db = new PostgresClient({ datasources: { db: { url: postgresUrl } } });
  } else {
    directory = await mkdtemp(join(tmpdir(), "movendi-inventory-test-"));
    await writeFile(join(directory, "inventory.db"), "", { flag: "wx" });
    const url = `file:${join(directory, "inventory.db").replaceAll("\\", "/")}`;
    const schema = fileURLToPath(new URL("../../../../prisma/schema.prisma", import.meta.url));
    execFileSync(process.execPath, [require.resolve("prisma/build/index.js"), "migrate", "deploy", "--schema", schema], {
      env: { ...process.env, DATABASE_URL: url }, stdio: "pipe", timeout: 60_000,
    });
    db = new PrismaClient({ datasources: { db: { url } } });
  }
  const tenant = await db.tenant.create({ data: { slug: "inventory-test", name: "Inventario", shortName: "INV", type: "RESTAURANT" } });
  const otherTenant = await db.tenant.create({ data: { slug: "other-inventory-test", name: "Otra empresa", shortName: "OTR", type: "TRANSPORT" } });
  const branch = await db.branch.create({ data: { tenantId: tenant.id, name: "Principal" } });
  const secondBranch = await db.branch.create({ data: { tenantId: tenant.id, name: "Otra sede" } });
  const actor = await db.user.create({ data: { name: "Prueba", email: "inventory@test.local", passwordHash: "not-a-login" } });
  scope = { tenantId: tenant.id, branchId: branch.id, actorId: actor.id, permissions: ["*"] };
  secondBranchId = secondBranch.id;
  otherTenantId = otherTenant.id;
});

after(async () => {
  await db?.$disconnect();
  if (directory) {
    const root = resolve(tmpdir());
    assert.ok(resolve(directory).startsWith(`${root}${sep}movendi-inventory-test-`));
    await rm(directory, { recursive: true, force: true });
  }
});

let sequence = 0;
function item(overrides: { stock?: number; unitCostCents?: number; trackStock?: boolean; active?: boolean; branchId?: string | null; tenantId?: string } = {}) {
  return db.inventoryItem.create({ data: {
    tenantId: scope.tenantId, branchId: scope.branchId, sku: `TEST-${++sequence}`, name: "Arroz", unit: "KG", stock: 10, unitCostCents: 100, ...overrides,
  } });
}

function move(itemId: string, overrides: Partial<InventoryMovementInput> = {}, executionScope = scope) {
  return db.$transaction((tx) => applyInventoryMovement(tx, executionScope, {
    itemId, type: "CONSUMPTION", direction: "OUT", quantity: 1, originType: "MANUAL", ...overrides,
  }));
}

function error(code: string, status: number) {
  return (value: unknown) => value instanceof AppError && value.code === code && value.status === status;
}

async function restaurantSale(recipeSnapshot: string | null) {
  const article = await item();
  const suffix = ++sequence;
  const category = await db.category.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, name: `Legacy ${suffix}` } });
  const product = await db.product.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, categoryId: category.id, name: `Plato ${suffix}`, priceCents: 500,
    recipe: { create: { yieldQuantity: 2, ingredients: { create: { itemId: article.id, quantity: 1.5, wastePercent: 10 } } } } } });
  const order = await db.restaurantOrder.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, createdById: scope.actorId, code: `LEGACY-${suffix}`,
    items: { create: { tenantId: scope.tenantId, productId: product.id, name: product.name, quantity: 2, unitPriceCents: 500, totalCents: 1000, recipeSnapshot } } } });
  const sale = await db.sale.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, orderId: order.id, code: `LEGACY-SALE-${suffix}`, paymentMethod: "CASH", totalCents: 1000 } });
  return { article, order, sale };
}

test("receta legacy conserva rendimiento, merma, consumo y devolución idempotente", async () => {
  const { article, order, sale } = await restaurantSale(null);
  assert.equal(await db.$transaction((tx) => consumeRestaurantSaleInventory(tx, scope, order.id, sale.id, true, false)), 0);
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.equal(await db.$transaction((tx) => consumeRestaurantSaleInventory(tx, scope, order.id, sale.id)), 1);
    assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: article.id } })).stock, 8.35);
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.equal(await db.$transaction((tx) => reverseRestaurantSaleInventory(tx, scope, sale.id, "Devolución")), 1);
    assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: article.id } })).stock, 10);
  }
  assert.equal(await db.inventoryMovement.count({ where: { itemId: article.id } }), 2);
  await assert.rejects(db.$transaction((tx) => consumeRestaurantSaleInventory(tx, { ...scope, branchId: secondBranchId }, order.id, sale.id)), error("ORDER_NOT_FOUND", 404));
  await assert.rejects(db.$transaction((tx) => reverseRestaurantSaleInventory(tx, { ...scope, tenantId: otherTenantId }, sale.id, "Ajena")), error("SALE_WITHOUT_INVENTORY", 409));
});

test("venta con snapshot enlaza la reserva sin descontar dos veces y revierte ante fallo", async () => {
  const { article, order, sale } = await restaurantSale("[]");
  await move(article.id, { type: "ORDER_RESERVATION", quantity: 2, orderId: order.id });
  await assert.rejects(db.$transaction(async (tx) => {
    await consumeRestaurantSaleInventory(tx, scope, order.id, sale.id);
    throw new Error("Fallo posterior al enlace");
  }), /Fallo posterior/);
  assert.equal(await db.inventoryMovement.count({ where: { orderId: order.id, type: "ORDER_RESERVATION", saleId: null } }), 1);
  assert.equal(await db.$transaction((tx) => consumeRestaurantSaleInventory(tx, scope, order.id, sale.id)), 1);
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: article.id } })).stock, 8);
  await assert.rejects(db.$transaction(async (tx) => {
    await reverseRestaurantSaleInventory(tx, scope, sale.id, "Revertida");
    throw new Error("Fallo después de devolver");
  }), /Fallo después/);
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: article.id } })).stock, 8);
  assert.equal(await db.inventoryMovement.count({ where: { saleId: sale.id, type: "SALE_RETURN" } }), 0);
});

function countCommands(context: TestContext) {
  context.mock.method(prisma, "$transaction", db.$transaction.bind(db));
  const auditLog = prisma.auditLog;
  Object.defineProperty(prisma, "auditLog", { value: db.auditLog, configurable: true });
  context.after(() => { Object.defineProperty(prisma, "auditLog", { value: auditLog, configurable: true }); });
  return (body: unknown, executionScope = scope) => handleInventoryOperation("POST", ["counts"], body, executionScope, "RESTAURANT");
}

test("composición conserva reglas de Restaurante sin imponerlas a otro rubro", async (context) => {
  countCommands(context);
  for (const model of ["restaurantConfiguration", "restaurantBranchConfiguration", "inventoryItem"] as const) {
    const original = prisma[model];
    Object.defineProperty(prisma, model, { value: db[model], configurable: true });
    context.after(() => { Object.defineProperty(prisma, model, { value: original, configurable: true }); });
  }
  await db.restaurantConfiguration.create({ data: { tenantId: scope.tenantId, settings: JSON.stringify({ inventory: { preventNegativeStock: false } }) } });
  const article = await item({ stock: 0 });
  await handleInventoryOperation("POST", ["movements"], { itemId: article.id, type: "CONSUMPTION", quantity: 1 }, scope, "RESTAURANT");
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: article.id } })).stock, -1);
  await assert.rejects(handleInventoryOperation("POST", ["items"], { sku: "RULE-REST", name: "Regla", unit: "CAJA-X" }, scope, "RESTAURANT"), error("CONFIG_VALUE_NOT_ALLOWED", 400));
  const branch = await db.branch.create({ data: { tenantId: otherTenantId, name: "Reglas genéricas" } });
  const otherScope = { ...scope, tenantId: otherTenantId, branchId: branch.id };
  const created = await handleInventoryOperation("POST", ["items"], { sku: "RULE-GENERIC", name: "Sin reglas restaurante", unit: "CAJA-X" }, otherScope, "TRANSPORT");
  await assert.rejects(handleInventoryOperation("POST", ["movements"], { itemId: created.id, type: "CONSUMPTION", quantity: 1 }, otherScope, "TRANSPORT"), error("INSUFFICIENT_STOCK", 409));
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: created.id } })).stock, 0);
});

test("conteo conserva ajustes de entrada/salida, documento y costos", async (context) => {
  const count = countCommands(context);
  const incoming = await item();
  const outgoing = await item();
  const countedAt = new Date("2026-03-01T12:00:00Z");
  const result = await count({ countedAt, notes: "Inventario físico", lines: [{ itemId: incoming.id, countedQuantity: 12.5 }, { itemId: outgoing.id, countedQuantity: 0 }] });
  const stored = await db.inventoryCount.findUniqueOrThrow({ where: { id: result.id }, include: { lines: true, movements: true } });
  assert.equal(stored.branchId, scope.branchId);
  assert.equal(stored.tenantId, scope.tenantId);
  assert.deepEqual(stored.countedAt, countedAt);
  assert.equal(stored.lines.length, 2);
  assert.equal(stored.movements.length, 2);
  assert.equal(stored.lines.find((line) => line.itemId === incoming.id)?.difference, 2.5);
  assert.equal(stored.lines.find((line) => line.itemId === outgoing.id)?.difference, -10);
  for (const movement of stored.movements) {
    assert.equal(movement.reference, stored.code);
    assert.equal(movement.notes, "Inventario físico");
    assert.deepEqual(movement.occurredAt, countedAt);
    assert.equal(movement.unitCostCents, 100);
  }
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: incoming.id } })).stock, 12.5);
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: outgoing.id } })).stock, 0);
});

test("conteo sin diferencias se conserva y repetirlo no revierte movimientos posteriores", async (context) => {
  const count = countCommands(context);
  const article = await item();
  const input = { idempotencyKey: "zero-count-replay", lines: [{ itemId: article.id, countedQuantity: 10 }] };
  const first = await count(input);
  await move(article.id);
  assert.equal((await count({ ...input, notes: "Nota posterior" })).id, first.id);
  await assert.rejects(count({ ...input, lines: [{ itemId: article.id, countedQuantity: 9 }] }), error("IDEMPOTENCY_CONFLICT", 409));
  assert.equal(await db.inventoryCountLine.count({ where: { countId: first.id } }), 1);
  assert.equal(await db.inventoryMovement.count({ where: { countId: first.id } }), 0);
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: article.id } })).stock, 9);
});

test("conteo rechaza duplicados y revierte todas sus líneas ante un artículo ajeno o sin seguimiento", async (context) => {
  const count = countCommands(context);
  const article = await item();
  const line = { itemId: article.id, countedQuantity: 15 };
  await assert.rejects(count({ lines: [line, line] }), error("DUPLICATE_LINES", 400));
  const initial = await db.inventoryCount.count({ where: { tenantId: scope.tenantId } });
  const initialLines = await db.inventoryCountLine.count({ where: { count: { tenantId: scope.tenantId } } });
  for (const invalid of [await item({ tenantId: otherTenantId, branchId: null }), await item({ branchId: secondBranchId }), await item({ active: false }), await item({ trackStock: false })]) {
    await assert.rejects(count({ lines: [line, { itemId: invalid.id, countedQuantity: 12 }] }), error(invalid.trackStock ? "INVENTORY_ITEM_NOT_FOUND" : "STOCK_NOT_TRACKED", invalid.trackStock ? 404 : 409));
    assert.equal(await db.inventoryCount.count({ where: { tenantId: scope.tenantId } }), initial);
    assert.equal(await db.inventoryCountLine.count({ where: { count: { tenantId: scope.tenantId } } }), initialLines);
    assert.equal(await db.inventoryMovement.count({ where: { itemId: article.id } }), 0);
    assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: article.id } })).stock, 10);
  }
});

test("conteos de empresas y sucursales distintas pueden usar la misma clave", async (context) => {
  const count = countCommands(context);
  const foreignBranch = await db.branch.create({ data: { tenantId: otherTenantId, name: "Conteos" } });
  const ids = new Set<string>();
  for (const executionScope of [scope, { ...scope, branchId: secondBranchId }, { ...scope, tenantId: otherTenantId, branchId: foreignBranch.id }]) {
    const article = await item({ tenantId: executionScope.tenantId, branchId: executionScope.branchId });
    const input = { idempotencyKey: "shared-count-key", lines: [{ itemId: article.id, countedQuantity: 8 }] };
    const result = await count(input, executionScope);
    assert.equal((await count(input, executionScope)).id, result.id);
    ids.add(result.id);
    assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: article.id } })).stock, 8);
  }
  assert.equal(ids.size, 3);
});

test("conteo histórico con claves de ajuste anteriores se reconoce sin recalcular stock", async (context) => {
  const count = countCommands(context);
  const article = await item();
  const key = "legacy-count-key";
  const historical = await db.$transaction(async (tx) => {
    const document = await tx.inventoryCount.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, createdById: scope.actorId, code: inventoryCountCode(scope.branchId, key), lines: { create: { itemId: article.id, expectedQuantity: 10, countedQuantity: 8, difference: -2 } } } });
    await applyInventoryMovement(tx, scope, { itemId: article.id, type: "COUNT_ADJUSTMENT", direction: "OUT", quantity: 2, originType: "COUNT", originId: document.id, countId: document.id, idempotencyKey: `COUNT:${key}:0` });
    return document;
  });
  await move(article.id);
  assert.equal((await count({ idempotencyKey: key, lines: [{ itemId: article.id, countedQuantity: 8 }] })).id, historical.id);
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: article.id } })).stock, 7);
  assert.equal(await db.inventoryMovement.count({ where: { countId: historical.id } }), 1);
});

test("conteo suma solo reservas pendientes o retenidas de su sede, sin liberar stock reservado", async (context) => {
  const count = countCommands(context);
  const article = await item({ stock: 3 });
  const category = await db.category.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, name: "Conteo físico" } });
  const product = await db.product.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, categoryId: category.id, name: "Plato conteo", priceCents: 100 } });
  for (const [index, status] of ["PENDING", "HELD", "PREPARING", "READY", "CANCELLED"].entries()) {
    const order = await db.restaurantOrder.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, createdById: scope.actorId, code: `COUNT-ORDER-${index}` } });
    const line = await db.orderItem.create({ data: { tenantId: scope.tenantId, orderId: order.id, productId: product.id, name: product.name, unitPriceCents: 100, totalCents: 100, status } });
    await db.inventoryMovement.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, itemId: article.id, type: "ORDER_RESERVATION", direction: "OUT", quantity: 1, stockBefore: 4, stockAfter: 3, unitCostCents: 100, totalCostCents: 100, originType: "ORDER_ITEM", originId: line.id } });
    // A movement from another branch must not contribute to this count.
    await db.inventoryMovement.create({ data: { tenantId: scope.tenantId, branchId: secondBranchId, itemId: article.id, type: "ORDER_RESERVATION", direction: "OUT", quantity: 50, stockBefore: 53, stockAfter: 3, unitCostCents: 100, totalCostCents: 5000, originType: "ORDER_ITEM", originId: line.id } });
  }
  const result = await count({ lines: [{ itemId: article.id, countedQuantity: 6 }] });
  const line = await db.inventoryCountLine.findFirstOrThrow({ where: { countId: result.id } });
  assert.equal(line.expectedQuantity, 5);
  assert.equal(line.difference, 1);
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: article.id } })).stock, 4);
  // Counting fewer units than those reserved cannot silently create negative stock.
  const initial = await db.inventoryCount.count({ where: { tenantId: scope.tenantId } });
  await assert.rejects(count({ lines: [{ itemId: article.id, countedQuantity: 0 }] }), error("INSUFFICIENT_STOCK", 409));
  assert.equal(await db.inventoryCount.count({ where: { tenantId: scope.tenantId } }), initial);
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: article.id } })).stock, 4);
});

test("conteo revierte documento, líneas y ajuste si falla el llamador después", async () => {
  const article = await item();
  const initial = await db.inventoryCount.count({ where: { tenantId: scope.tenantId } });
  await assert.rejects(db.$transaction(async (tx) => {
    await registerInventoryCount(tx, scope, { lines: [{ itemId: article.id, countedQuantity: 2 }] });
    throw new Error("Fallo posterior al conteo");
  }), /Fallo posterior/);
  assert.equal(await db.inventoryCount.count({ where: { tenantId: scope.tenantId } }), initial);
  assert.equal(await db.inventoryCountLine.count({ where: { itemId: article.id } }), 0);
  assert.equal(await db.inventoryMovement.count({ where: { itemId: article.id } }), 0);
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: article.id } })).stock, 10);
});

test("PostgreSQL: dos conteos con la misma clave confirman un documento, con o sin ajuste", { skip: !process.env.INVENTORY_TEST_DATABASE_URL, timeout: 30_000 }, async (context) => {
  context.mock.method(prisma, "$transaction", db.$transaction.bind(db));
  for (const countedQuantity of [7, 10]) {
    const article = await item();
    let arrived = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolveBarrier) => { release = resolveBarrier; });
    const input = { idempotencyKey: `concurrent-count-${countedQuantity}`, lines: [{ itemId: article.id, countedQuantity }] };
    async function register() {
      let firstAttempt = true;
      return withSerializableTransaction(async (tx) => {
        if (firstAttempt) {
          firstAttempt = false;
          await tx.inventoryItem.findUniqueOrThrow({ where: { id: article.id } });
          if (++arrived === 2) release();
          await barrier;
        }
        return registerInventoryCount(tx, scope, input);
      });
    }
    const results = await Promise.all([register(), register()]);
    assert.equal(results[0].id, results[1].id);
    assert.equal(await db.inventoryCountLine.count({ where: { itemId: article.id } }), 1);
    assert.equal(await db.inventoryMovement.count({ where: { itemId: article.id } }), countedQuantity === 10 ? 0 : 1);
    assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: article.id } })).stock, countedQuantity);
  }
});

test("movimiento conserva costo, precisión, metadatos y resultado completo", async () => {
  const article = await item();
  const occurredAt = new Date("2026-01-01T12:00:00Z");
  const movement = await move(article.id, { type: "PURCHASE", direction: "IN", quantity: 2.0000001, unitCostCents: 250, originType: "PURCHASE", originId: "reference", notes: "Recepción", reference: "OC-1", occurredAt });
  assert.equal(movement.quantity, 2);
  assert.equal(movement.stockBefore, 10);
  assert.equal(movement.stockAfter, 12);
  assert.equal(movement.unitCostCents, 250);
  assert.equal(movement.totalCostCents, 500);
  assert.equal(movement.actorId, scope.actorId);
  assert.equal(movement.tenantId, scope.tenantId);
  assert.equal(movement.branchId, scope.branchId);
  assert.equal(movement.originId, "reference");
  assert.equal(movement.reference, "OC-1");
  assert.equal(movement.notes, "Recepción");
  assert.deepEqual(movement.occurredAt, occurredAt);
  assert.ok(movement.createdAt instanceof Date);
  assert.equal(movement.saleId, null);
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: article.id } })).unitCostCents, 125);
});

test("reintento devuelve el mismo movimiento incluso si el artículo se desactivó", async () => {
  const article = await item();
  const first = await move(article.id, { idempotencyKey: "same-movement" });
  await db.inventoryItem.update({ where: { id: article.id }, data: { active: false } });
  assert.deepEqual(await move(article.id, { idempotencyKey: "same-movement" }), first);
  assert.equal(await db.inventoryMovement.count({ where: { itemId: article.id } }), 1);
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: article.id } })).stock, 9);
  await assert.rejects(move(article.id, { quantity: 2, idempotencyKey: "same-movement" }), error("IDEMPOTENCY_CONFLICT", 409));
  await assert.rejects(move(article.id, { idempotencyKey: "same-movement" }, { ...scope, branchId: secondBranchId }), error("IDEMPOTENCY_CONFLICT", 409));
});

test("aislamiento de empresa/sede y asignación legacy de artículo sin sucursal", async () => {
  const otherBranch = await item({ branchId: secondBranchId });
  const otherTenant = await item({ tenantId: otherTenantId, branchId: null });
  const inactive = await item({ active: false });
  for (const article of [otherBranch, otherTenant, inactive]) {
    await assert.rejects(move(article.id), error("INVENTORY_ITEM_NOT_FOUND", 404));
  }
  const legacy = await item({ branchId: null });
  await move(legacy.id);
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: legacy.id } })).branchId, scope.branchId);
});

test("validaciones conservan códigos y no escriben movimientos", async () => {
  const article = await item({ stock: 0 });
  for (const quantity of [0, -1, NaN, Infinity, 0.0000001]) {
    await assert.rejects(move(article.id, { quantity }), error("INVALID_QUANTITY", 400));
  }
  await assert.rejects(move(article.id), error("INSUFFICIENT_STOCK", 409));
  const untracked = await item({ trackStock: false });
  await assert.rejects(move(untracked.id), error("STOCK_NOT_TRACKED", 409));
  assert.equal(await db.inventoryMovement.count({ where: { itemId: { in: [article.id, untracked.id] } } }), 0);
});

test("conserva la política explícita de stock negativo y costo de salida", async () => {
  const article = await item({ stock: 0, unitCostCents: 300 });
  const movement = await move(article.id, { preventNegativeStock: false, unitCostCents: 450 });
  assert.equal(movement.stockAfter, -1);
  assert.equal(movement.totalCostCents, 450);
  const stored = await db.inventoryItem.findUniqueOrThrow({ where: { id: article.id } });
  assert.equal(stored.stock, -1);
  assert.equal(stored.unitCostCents, 300);
});

test("fallar al insertar el movimiento revierte la actualización previa del saldo", async () => {
  const article = await item();
  // Invalid FK fails at the actual INSERT after the item's balance was updated.
  await assert.rejects(move(article.id, { saleId: "nonexistent-sale" }));
  const stored = await db.inventoryItem.findUniqueOrThrow({ where: { id: article.id } });
  assert.equal(stored.stock, 10);
  assert.equal(stored.unitCostCents, 100);
  assert.equal(await db.inventoryMovement.count({ where: { itemId: article.id } }), 0);
});

test("el movimiento participa en la transacción del llamador", async () => {
  const article = await item();
  await assert.rejects(db.$transaction(async (tx) => {
    await applyInventoryMovement(tx, scope, { itemId: article.id, type: "CONSUMPTION", direction: "OUT", quantity: 2, originType: "TRANSPORT_MAINTENANCE" });
    throw new Error("Fallo posterior del caso de uso");
  }), /Fallo posterior/);
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: article.id } })).stock, 10);
  assert.equal(await db.inventoryMovement.count({ where: { itemId: article.id } }), 0);
});

test("repositorio Prisma rechaza un saldo que cambió desde su lectura", async () => {
  const article = await item();
  await db.$transaction(async (tx) => {
    const repository = new PrismaInventoryRepository(tx, scope);
    const snapshot = await repository.findActiveItem(article.id);
    assert.ok(snapshot);
    await tx.inventoryItem.update({ where: { id: article.id }, data: { stock: 9 } });
    assert.equal(await repository.updateStockIfUnchanged(snapshot, 8, 100), false);
  });
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: article.id } })).stock, 9);
});

test("ejecutor compartido conserva reintentos de concurrencia y su error al agotarlos", async (context) => {
  let attempts = 0;
  const transaction = context.mock.method(prisma, "$transaction", async () => {
    attempts += 1;
    if (attempts < 5) throw new TransactionConflictError("Conflicto de prueba");
    return "confirmed";
  });
  assert.equal(await withSerializableTransaction(async () => "unused"), "confirmed");
  assert.equal(attempts, 5);
  transaction.mock.mockImplementation(async () => { throw new TransactionConflictError("Conflicto de prueba"); });
  await assert.rejects(withSerializableTransaction(async () => "unused"), error("INVENTORY_BUSY", 409));
  assert.equal(transaction.mock.callCount(), 11);
  const businessError = new AppError("INSUFFICIENT_STOCK", 409, "Sin stock");
  transaction.mock.mockImplementation(async () => { throw businessError; });
  await assert.rejects(withSerializableTransaction(async () => "unused"), (value) => value === businessError);
  assert.equal(transaction.mock.callCount(), 12);
});

test("conflicto optimista de inventario se traduce a la señal del ejecutor compartido", async (context) => {
  const article = await item();
  context.mock.method(PrismaInventoryRepository.prototype, "updateStockIfUnchanged", async () => false);
  await assert.rejects(move(article.id), (value) => value instanceof TransactionConflictError);
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: article.id } })).stock, 10);
  assert.equal(await db.inventoryMovement.count({ where: { itemId: article.id } }), 0);
});

test("ejecutor compartido reintenta P2034 con el mismo aislamiento y plazo", async (context) => {
  let attempts = 0;
  context.mock.method(prisma, "$transaction", async (_operation: unknown, options: unknown) => {
    assert.deepEqual(options, { isolationLevel: "Serializable", timeout: 30_000 });
    if (++attempts < 3) throw new Prisma.PrismaClientKnownRequestError("Write conflict", { code: "P2034", clientVersion: "5.22.0" });
    return "confirmed";
  });
  assert.equal(await withSerializableTransaction(async () => "unused"), "confirmed");
  assert.equal(attempts, 3);
});

function purchase(input: InventoryPurchaseInput, executionScope = scope) {
  return db.$transaction((tx) => registerInventoryPurchase(tx, executionScope, input));
}

test("compra conserva documento, líneas, valoración y movimientos", async () => {
  const first = await item();
  const second = await item({ stock: 0 });
  const purchasedAt = new Date("2026-02-02T12:00:00Z");
  const result = await purchase({ supplierName: "Proveedor", documentNumber: "F001-123", notes: "Entrega", purchasedAt,
    lines: [{ itemId: first.id, quantity: 2, unitCost: 250 }, { itemId: second.id, quantity: 1.5, unitCost: 101 }] });
  assert.equal(result.totalCents, 652);
  assert.equal(result.branchId, scope.branchId);
  assert.equal(result.tenantId, scope.tenantId);
  assert.equal(result.createdById, scope.actorId);
  assert.equal(result.status, "POSTED");
  assert.equal(result.lines.length, 2);
  const movements = await db.inventoryMovement.findMany({ where: { purchaseId: result.id } });
  assert.equal(movements.length, 2);
  assert.equal(movements.reduce((sum, movement) => sum + movement.totalCostCents, 0), 652);
  for (const movement of movements) {
    assert.equal(movement.reference, "F001-123");
    assert.equal(movement.notes, "Entrega");
    assert.deepEqual(movement.occurredAt, purchasedAt);
    assert.equal(movement.originId, result.id);
  }
  const stored = await db.inventoryItem.findUniqueOrThrow({ where: { id: first.id } });
  assert.equal(stored.stock, 12);
  assert.equal(stored.unitCostCents, 125);
});

test("repetir compra no duplica stock; rechaza cambios y otra sucursal", async () => {
  const article = await item();
  const input: InventoryPurchaseInput = { supplierName: "Proveedor", idempotencyKey: "purchase-replay", lines: [{ itemId: article.id, quantity: 2, unitCost: 250 }] };
  const first = await purchase(input);
  assert.equal((await purchase(input)).id, first.id);
  for (const changed of [
    { ...input, supplierName: "Otro proveedor" }, { ...input, documentNumber: "OTRA" },
    { ...input, notes: "Cambio" }, { ...input, purchasedAt: new Date("2000-01-01") },
    { ...input, lines: [{ ...input.lines[0], quantity: 3 }] },
    { ...input, lines: [{ ...input.lines[0], unitCost: 251 }] },
    { ...input, lines: [{ ...input.lines[0], itemId: "other-item" }] },
  ]) await assert.rejects(purchase(changed), error("IDEMPOTENCY_CONFLICT", 409));
  await assert.rejects(purchase(input, { ...scope, branchId: secondBranchId }), error("IDEMPOTENCY_CONFLICT", 409));
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: article.id } })).stock, 12);
  assert.equal(await db.inventoryMovement.count({ where: { purchaseId: first.id } }), 1);
});

test("otra empresa puede usar la misma clave sin recibir la compra ajena", async () => {
  const branch = await db.branch.create({ data: { tenantId: otherTenantId, name: "Compras" } });
  const article = await item({ tenantId: otherTenantId, branchId: branch.id });
  const result = await purchase({ supplierName: "Otro proveedor", idempotencyKey: "purchase-replay", lines: [{ itemId: article.id, quantity: 1, unitCost: 100 }] }, { ...scope, tenantId: otherTenantId, branchId: branch.id });
  assert.equal(result.tenantId, otherTenantId);
  assert.equal(result.branchId, branch.id);
});

test("compra revierte documento, líneas, costos y stock si falla una línea posterior", async () => {
  const first = await item();
  const invalidItems = [await item({ branchId: secondBranchId }), await item({ tenantId: otherTenantId, branchId: null }), await item({ trackStock: false })];
  const initialPurchases = await db.inventoryPurchase.count({ where: { tenantId: scope.tenantId } });
  const initialLines = await db.inventoryPurchaseLine.count({ where: { purchase: { tenantId: scope.tenantId } } });
  for (const invalid of invalidItems) {
    await assert.rejects(purchase({ supplierName: "Fallará", lines: [
      { itemId: first.id, quantity: 3, unitCost: 500 }, { itemId: invalid.id, quantity: 1, unitCost: 100 },
    ] }), error(invalid.trackStock ? "INVENTORY_ITEM_NOT_FOUND" : "STOCK_NOT_TRACKED", invalid.trackStock ? 404 : 409));
    const stored = await db.inventoryItem.findUniqueOrThrow({ where: { id: first.id } });
    assert.equal(stored.stock, 10);
    assert.equal(stored.unitCostCents, 100);
    assert.equal(await db.inventoryMovement.count({ where: { itemId: first.id } }), 0);
    assert.equal(await db.inventoryPurchase.count({ where: { tenantId: scope.tenantId } }), initialPurchases);
    assert.equal(await db.inventoryPurchaseLine.count({ where: { purchase: { tenantId: scope.tenantId } } }), initialLines);
  }
});

test("compra rechaza líneas duplicadas y revierte ante un fallo del llamador", async () => {
  const article = await item();
  const line = { itemId: article.id, quantity: 1, unitCost: 100 };
  const initialPurchases = await db.inventoryPurchase.count({ where: { tenantId: scope.tenantId } });
  await assert.rejects(purchase({ supplierName: "Duplicada", lines: [line, line] }), error("DUPLICATE_LINES", 400));
  await assert.rejects(db.$transaction(async (tx) => {
    await registerInventoryPurchase(tx, scope, { supplierName: "Revertida", lines: [line] });
    throw new Error("Fallo después de registrar la compra");
  }), /Fallo después/);
  assert.equal(await db.inventoryPurchase.count({ where: { tenantId: scope.tenantId } }), initialPurchases);
  assert.equal(await db.inventoryMovement.count({ where: { itemId: article.id } }), 0);
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: article.id } })).stock, 10);
});

test("una clave de movimiento ya usada no permite registrar una compra sin su entrada", async () => {
  const first = await item();
  const second = await item();
  await move(second.id, { type: "PURCHASE", direction: "IN", quantity: 1, unitCostCents: 100, idempotencyKey: "PURCHASE:collision-key:1" });
  const initialPurchases = await db.inventoryPurchase.count({ where: { tenantId: scope.tenantId } });
  await assert.rejects(purchase({ supplierName: "Colisión", idempotencyKey: "collision-key", lines: [
    { itemId: first.id, quantity: 1, unitCost: 100 }, { itemId: second.id, quantity: 1, unitCost: 100 },
  ] }), error("IDEMPOTENCY_CONFLICT", 409));
  assert.equal(await db.inventoryPurchase.count({ where: { tenantId: scope.tenantId } }), initialPurchases);
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: first.id } })).stock, 10);
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: second.id } })).stock, 11);
  assert.equal(await db.inventoryMovement.count({ where: { itemId: first.id } }), 0);
});

test("login bloqueado informa la espera restante y permite ingresar al expirar", async (context) => {
  context.mock.method(prisma, "$transaction", db.$transaction.bind(db));
  const keyHash = "inventory-auth-regression";
  const windowMs = Number(process.env.LOGIN_RATE_WINDOW_MINUTES ?? 15) * 60_000;
  const attempts = Number(process.env.LOGIN_RATE_MAX_ATTEMPTS ?? 5);
  await db.loginThrottle.create({ data: { keyHash, attempts, windowStartedAt: new Date(Date.now() - windowMs / 2) } });
  await assert.rejects(assertLoginAllowed(keyHash), (value: unknown) => {
    assert.ok(value instanceof AppError);
    assert.equal(value.code, "LOGIN_RATE_LIMITED");
    assert.equal(value.status, 429);
    const seconds = (value.details as { retryAfterSeconds: number }).retryAfterSeconds;
    assert.ok(seconds > 0 && seconds <= Math.ceil(windowMs / 2000));
    return true;
  });
  assert.equal((await db.loginThrottle.findUniqueOrThrow({ where: { keyHash } })).attempts, attempts);
  await db.loginThrottle.update({ where: { keyHash }, data: { windowStartedAt: new Date(Date.now() - windowMs - 1000) } });
  await assertLoginAllowed(keyHash);
  assert.equal((await db.loginThrottle.findUniqueOrThrow({ where: { keyHash } })).attempts, 1);
});

test("PostgreSQL: dos consumos simultáneos de la última unidad no duplican la salida", { skip: !process.env.INVENTORY_TEST_DATABASE_URL, timeout: 30_000 }, async (context) => {
  context.mock.method(prisma, "$transaction", db.$transaction.bind(db));
  const article = await item({ stock: 1 });
  let arrived = 0;
  let release!: () => void;
  const barrier = new Promise<void>((resolveBarrier) => { release = resolveBarrier; });
  async function consume() {
    let firstAttempt = true;
    return withSerializableTransaction(async (tx) => {
      if (firstAttempt) {
        firstAttempt = false;
        // Establish both real Serializable snapshots before either writer proceeds.
        await tx.inventoryItem.findUniqueOrThrow({ where: { id: article.id } });
        if (++arrived === 2) release();
        await barrier;
      }
      return applyInventoryMovement(tx, scope, { itemId: article.id, type: "CONSUMPTION", direction: "OUT", quantity: 1, originType: "TEST" });
    });
  }
  const outcomes = await Promise.allSettled([consume(), consume()]);
  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
  const rejected = outcomes.find((outcome) => outcome.status === "rejected");
  assert.ok(rejected?.status === "rejected" && error("INSUFFICIENT_STOCK", 409)(rejected.reason));
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: article.id } })).stock, 0);
  assert.equal(await db.inventoryMovement.count({ where: { itemId: article.id } }), 1);
});

test("PostgreSQL: compras simultáneas con la misma clave registran una sola entrada", { skip: !process.env.INVENTORY_TEST_DATABASE_URL, timeout: 30_000 }, async (context) => {
  context.mock.method(prisma, "$transaction", db.$transaction.bind(db));
  const article = await item({ stock: 0 });
  const input = { supplierName: "Concurrente", idempotencyKey: "concurrent-purchase", lines: [{ itemId: article.id, quantity: 2, unitCost: 250 }] };
  let arrived = 0;
  let release!: () => void;
  const barrier = new Promise<void>((resolveBarrier) => { release = resolveBarrier; });
  async function register() {
    let firstAttempt = true;
    return withSerializableTransaction(async (tx) => {
      if (firstAttempt) {
        firstAttempt = false;
        await tx.inventoryItem.findUniqueOrThrow({ where: { id: article.id } });
        if (++arrived === 2) release();
        await barrier;
      }
      return registerInventoryPurchase(tx, scope, input);
    });
  }
  const results = await Promise.all([register(), register()]);
  assert.equal(results[0].id, results[1].id);
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: article.id } })).stock, 2);
  assert.equal(await db.inventoryMovement.count({ where: { itemId: article.id } }), 1);
  assert.equal(await db.inventoryPurchaseLine.count({ where: { itemId: article.id } }), 1);
});
