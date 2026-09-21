import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test, type TestContext } from "node:test";
import { Prisma, PrismaClient } from "@prisma/client";
import { salonInstant, salonLocalDateTime } from "@movendi/contracts";
import { prisma } from "@/core/database/prisma";
import { AppError } from "@/core/auth/errors";
import type { TenantScope } from "@/core/auth/types";
import { handleBarbershopCommand as command } from "./commands";
import { getSalonReports, getSalonHistory } from "./queries";
import { salonPermission } from "./access";

const require = createRequire(import.meta.url);
let directory: string, db: PrismaClient, scope: TenantScope, staffId: string, serviceId: string, customerId: string, productId: string, itemId: string, supplyId: string, cashId: string;
let counter = 0;
before(async () => {
  const external = process.env.INVENTORY_TEST_DATABASE_URL;
  if (external) {
    const url = new URL(external); assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.pathname, "/inventory_hexagonal_test");
    const Client = require(process.env.INVENTORY_TEST_CLIENT!).PrismaClient; db = new Client({ datasources: { db: { url: external } } });
  } else {
    directory = await mkdtemp(join(tmpdir(), "movendi-salon-test-")); await writeFile(join(directory, "salon.db"), "", { flag: "wx" });
    const url = `file:${join(directory, "salon.db").replaceAll("\\", "/")}`;
    execFileSync(process.execPath, [require.resolve("prisma/build/index.js"), "migrate", "deploy", "--schema", fileURLToPath(new URL("../../../../prisma/schema.prisma", import.meta.url))], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe", timeout: 60000 });
    db = new PrismaClient({ datasources: { db: { url } } });
  }
  const plan = await db.platformPlan.create({ data: { key: "SALON_TEST", name: "Salon test", monthlyPriceCents: 100, maxUsers: 100, maxMonthlyOperations: 100000 } });
  const tenant = await db.tenant.create({ data: { slug: "salon-test", name: "Salón", shortName: "SAL", type: "BARBERSHOP", planId: plan.id, timezone: "America/Lima", paymentMethods: JSON.stringify(["CASH", "YAPE", "PLIN", "CARD", "TRANSFER", "OTHER"]) } });
  const branch = await db.branch.create({ data: { tenantId: tenant.id, name: "Principal" } });
  const user = await db.user.create({ data: { name: "Test", email: "salon@test.local", passwordHash: "not-a-login" } });
  scope = { tenantId: tenant.id, branchId: branch.id, actorId: user.id, permissions: ["*"] };
  const staff = await db.staffMember.create({ data: { tenantId: tenant.id, branchId: branch.id, name: "Ana", commissionPct: 40, productCommissionPct: 10 } }); staffId = staff.id;
  for (let day = 0; day < 7; day++) await db.staffSchedule.create({ data: { tenantId: tenant.id, branchId: branch.id, staffId, weekday: day, startsAt: "08:00", endsAt: "20:00" } });
  customerId = (await db.customer.create({ data: { tenantId: tenant.id, name: "Cliente frecuente", phone: "999000321" } })).id;
  serviceId = (await db.service.create({ data: { tenantId: tenant.id, branchId: branch.id, name: "Corte", durationMinutes: 30, priceCents: 3000 } })).id;
  itemId = (await db.inventoryItem.create({ data: { tenantId: tenant.id, branchId: branch.id, name: "Cera", sku: "CERA", kind: "PRODUCT", stock: 100, unitCostCents: 500 } })).id;
  supplyId = (await db.inventoryItem.create({ data: { tenantId: tenant.id, branchId: branch.id, name: "Champú", sku: "CHAMPU", kind: "INPUT", unit: "L", stock: 10, unitCostCents: 1000 } })).id;
  await db.serviceSupply.create({ data: { serviceId, itemId: supplyId, quantity: 0.1 } });
  productId = (await db.salonProduct.create({ data: { tenantId: tenant.id, branchId: branch.id, itemId, priceCents: 2000 } })).id;
  cashId = (await db.cashSession.create({ data: { tenantId: tenant.id, branchId: branch.id, openedById: user.id, openingCents: 10000, expectedCents: 10000, activeSlot: "PRIMARY" } })).id;
});
after(async () => { await db?.$disconnect(); if (directory) { assert.ok(resolve(directory).startsWith(`${resolve(tmpdir())}${sep}movendi-salon-test-`)); await rm(directory, { recursive: true, force: true }); } });
function bind(t: TestContext) {
  t.mock.method(prisma, "$transaction", db.$transaction.bind(db));
  for (const model of ["tenant", "sale", "salePayment", "salonSaleLine", "customer", "appointment"] as const) { const original = prisma[model]; Object.defineProperty(prisma, model, { value: db[model], configurable: true }); t.after(() => Object.defineProperty(prisma, model, { value: original, configurable: true })); }
}
const code = (value: string) => (error: unknown) => error instanceof AppError && error.code === value;
function ticket(extra: Record<string, unknown> = {}) { return { idempotencyKey: `salon-test-${++counter}`, customerId, lines: [{ serviceId, staffId, quantity: 1 }, { productId, staffId, quantity: 2 }], payments: [{ method: "CASH", amountCents: 2000 }, { method: "YAPE", amountCents: 5000 }], ...extra }; }
function future(hour = 10) { const d = new Date(); d.setUTCDate(d.getUTCDate() + 4 + counter++); return `${d.toISOString().slice(0, 10)}T${hour}:00`; }

test("zona horaria: datetime-local e instantes explícitos coinciden; fecha imposible se rechaza", () => { assert.equal(salonInstant("2030-02-10T09:00").toISOString(), "2030-02-10T14:00:00.000Z"); assert.equal(salonLocalDateTime("2030-02-10T14:00:00Z"), "2030-02-10T09:00"); assert.throws(() => salonInstant("2030-02-31T09:00")); });
test("permisos: editar agenda no autoriza cobros ni devoluciones", () => { assert.equal(salonPermission("appointments", "POST", "checkout"), "barbershop:cash:write"); assert.equal(salonPermission("sales", "POST", "refund"), "barbershop:refunds:write"); assert.throws(() => salonPermission("unknown", "POST")); });
test("venta mixta: stock, insumos, pagos combinados, caja, comisiones e idempotencia", async (t) => {
  bind(t); const before = await db.cashSession.findUniqueOrThrow({ where: { id: cashId } }), stock = await db.inventoryItem.findUniqueOrThrow({ where: { id: itemId } }), supply = await db.inventoryItem.findUniqueOrThrow({ where: { id: supplyId } });
  const input = ticket({ cashReceivedCents: 3000 }), result = await command("POST", ["sales"], input, scope);
  const sale = await db.sale.findUniqueOrThrow({ where: { id: result.id }, include: { payments: true, salonSale: { include: { lines: true } } } });
  assert.equal(sale.totalCents, 7000); assert.equal(sale.changeCents, 1000); assert.equal(sale.payments.length, 2); assert.equal(sale.salonSale!.lines.reduce((sum, l) => sum + l.commissionCents, 0), 1600);
  assert.equal((await db.cashSession.findUniqueOrThrow({ where: { id: cashId } })).expectedCents, before.expectedCents + 2000);
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: itemId } })).stock, stock.stock - 2);
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: supplyId } })).stock, supply.stock - 0.1);
  assert.equal((await command("POST", ["sales"], input, scope)).id, result.id);
  await assert.rejects(command("POST", ["sales"], { ...input, customerId: null }, scope), code("IDEMPOTENCY_CONFLICT"));
});
test("stock insuficiente revierte venta, pagos, comisión y caja", async (t) => {
  bind(t); const count = await db.sale.count(), cash = await db.cashSession.findUniqueOrThrow({ where: { id: cashId } });
  await assert.rejects(command("POST", ["sales"], ticket({ lines: [{ productId, quantity: 100 }], payments: [{ method: "CASH", amountCents: 200000 }] }), scope), code("INSUFFICIENT_STOCK"));
  assert.equal(await db.sale.count(), count); assert.equal((await db.cashSession.findUniqueOrThrow({ where: { id: cashId } })).expectedCents, cash.expectedCents);
});
test("descuento reparte céntimos y usa comisión fija; conserva histórico", async (t) => {
  bind(t); await db.staffMember.update({ where: { id: staffId }, data: { commissionFixedCents: 700 } });
  const result = await command("POST", ["sales"], ticket({ discountCents: 1001, discountReason: "Atención especial", payments: [{ method: "PLIN", amountCents: 5999 }] }), scope);
  const sale = await db.sale.findUniqueOrThrow({ where: { id: result.id }, include: { salonSale: { include: { lines: true } } } });
  assert.equal(sale.salonSale!.lines.reduce((s, l) => s + l.discountCents, 0), 1001); assert.equal(sale.salonSale!.lines.find((l) => l.serviceId)?.commissionCents, 700);
  await db.staffMember.update({ where: { id: staffId }, data: { commissionFixedCents: null } });
  assert.equal((await db.salonSaleLine.findFirstOrThrow({ where: { salonSaleId: sale.salonSaleId!, serviceId } })).commissionCents, 700);
  await assert.rejects(command("POST", ["sales"], ticket({ discountCents: 100, discountReason: "No autorizado" }), { ...scope, permissions: ["barbershop:cash:write"] }), code("DISCOUNT_AUTHORIZATION"));
});
test("agenda: horario Lima, colisión, bloqueo, habilitación y reprogramación", async (t) => {
  bind(t); const startsAt = future(); const result = await command("POST", ["appointments"], { customerId, serviceId, staffId, startsAt }, scope);
  assert.equal((await db.appointment.findUniqueOrThrow({ where: { id: result.id } })).startsAt.getUTCHours(), 15);
  await assert.rejects(command("POST", ["appointments"], { customerId, serviceId, staffId, startsAt }, scope), code("SCHEDULE_CONFLICT"));
  await assert.rejects(command("POST", ["blocks"], { staffId, startsAt, endsAt: startsAt.replace("10:00", "12:00"), reason: "Vacaciones" }, scope), code("PENDING_APPOINTMENTS"));
  await command("PATCH", ["appointments", result.id, "reschedule"], { serviceId, staffId, startsAt: startsAt.replace("10:00", "12:00") }, scope);
  const block = await command("POST", ["blocks"], { staffId, startsAt, endsAt: startsAt.replace("10:00", "11:00"), reason: "Descanso" }, scope);
  await assert.rejects(command("POST", ["appointments"], { customerId, serviceId, staffId, startsAt }, scope), code("STAFF_BLOCKED"));
  await command("PATCH", ["blocks", block.id], {}, scope);
  await command("POST", ["appointments"], { customerId, serviceId, staffId, startsAt }, scope);
});
test("otra sucursal no puede vender productos, profesionales ni consumir insumos ajenos", async (t) => {
  bind(t); const branch = await db.branch.create({ data: { tenantId: scope.tenantId, name: "Otra" } });
  await db.cashSession.create({ data: { tenantId: scope.tenantId, branchId: branch.id, openedById: scope.actorId, activeSlot: "PRIMARY" } });
  await assert.rejects(command("POST", ["sales"], ticket(), { ...scope, branchId: branch.id }), code("STAFF_REQUIRED"));
  await assert.rejects(command("POST", ["sales"], ticket({ lines: [{ productId, quantity: 1 }] }), { ...scope, branchId: branch.id }), code("NOT_FOUND"));
});
test("devolución resta efectivo, repone productos y conserva insumos consumidos; repetición segura", async (t) => {
  bind(t); const sale = await command("POST", ["sales"], ticket(), scope);
  const before = await db.inventoryItem.findUniqueOrThrow({ where: { id: supplyId } });
  const refund = await command("POST", ["sales", sale.id, "refund"], { reason: "Cliente devolvió productos", restock: true }, scope);
  assert.equal((await command("POST", ["sales", sale.id, "refund"], { reason: "Cliente devolvió productos", restock: true }, scope)).id, refund.id);
  assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: supplyId } })).stock, before.stock);
  assert.equal((await db.sale.findUniqueOrThrow({ where: { id: sale.id } })).status, "REFUNDED");
});
test("reportes e historial incluyen venta directa y excluyen devueltas del margen", async (t) => {
  bind(t); const report = await getSalonReports(scope, "1d"), total = await db.sale.aggregate({ where: { tenantId: scope.tenantId, branchId: scope.branchId, status: "PAID" }, _sum: { totalCents: true } });
  assert.equal(report.revenueCents, total._sum.totalCents); assert.ok(report.staff.length > 0); assert.ok((await getSalonHistory(scope, new URLSearchParams())).sales.some((s) => s.status === "REFUNDED"));
});
test("PostgreSQL: dos reservas simultáneas del mismo horario solo guardan una", async (t) => {
  if (!process.env.INVENTORY_TEST_DATABASE_URL) return t.skip("Concurrencia real se valida en PostgreSQL"); bind(t);
  const input = { customerId, serviceId, staffId, startsAt: future() };
  const results = await Promise.allSettled([command("POST", ["appointments"], input, scope), command("POST", ["appointments"], input, scope)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
});

test("habilitación de servicio y horario fuera de rango se rechazan sin crear citas", async (t) => {
  bind(t); const other = await db.staffMember.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, name: "Especialista", commissionPct: 10 } });
  await db.serviceStaff.create({ data: { serviceId, staffId: other.id } });
  await assert.rejects(command("POST", ["appointments"], { customerId, serviceId, staffId, startsAt: future() }, scope), code("STAFF_NOT_QUALIFIED"));
  await db.serviceStaff.deleteMany({ where: { serviceId } });
  await assert.rejects(command("POST", ["appointments"], { customerId, serviceId, staffId, startsAt: future(23) }, scope), code("OUTSIDE_STAFF_SCHEDULE"));
  await assert.rejects(command("POST", ["schedules"], { staffId, weekday: 1, startsAt: "29:00", endsAt: "30:00" }, scope), code("VALIDATION_ERROR"));
});
test("pagos: total incorrecto, efectivo insuficiente y método deshabilitado revierten todo", async (t) => {
  bind(t); const count = await db.sale.count();
  await assert.rejects(command("POST", ["sales"], ticket({ payments: [{ method: "YAPE", amountCents: 1 }] }), scope), code("PAYMENT_TOTAL_MISMATCH"));
  await assert.rejects(command("POST", ["sales"], ticket({ cashReceivedCents: 1 }), scope), code("INSUFFICIENT_TENDER"));
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: scope.tenantId } });
  await db.tenant.update({ where: { id: tenant.id }, data: { paymentMethods: '["CASH"]' } });
  try { await assert.rejects(command("POST", ["sales"], ticket(), scope), code("PAYMENT_DISABLED")); } finally { await db.tenant.update({ where: { id: tenant.id }, data: { paymentMethods: tenant.paymentMethods } }); }
  assert.equal(await db.sale.count(), count);
});
test("productos sin control de existencias conservan stock, precio y comisión", async (t) => {
  bind(t); await db.inventoryItem.update({ where: { id: itemId }, data: { trackStock: false } });
  const before = await db.inventoryItem.findUniqueOrThrow({ where: { id: itemId } });
  try { const result = await command("POST", ["sales"], ticket(), scope); assert.ok(result.id); assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: itemId } })).stock, before.stock); } finally { await db.inventoryItem.update({ where: { id: itemId }, data: { trackStock: true } }); }
});
test("promoción vigente se aplica y promoción vencida no se cobra", async (t) => {
  bind(t); const promotion = await command("POST", ["promotions"], { name: "Cliente frecuente", kind: "PERCENT", value: 10 }, scope);
  const sale = await command("POST", ["sales"], ticket({ promotionId: promotion.id, payments: [{ method: "CARD", amountCents: 6300 }] }), scope);
  assert.equal((await db.sale.findUniqueOrThrow({ where: { id: sale.id } })).discountCents, 700);
  await db.promotion.update({ where: { id: promotion.id }, data: { endsAt: new Date("2020-01-01T00:00:00Z") } });
  await assert.rejects(command("POST", ["sales"], ticket({ promotionId: promotion.id }), scope), code("PROMOTION_UNAVAILABLE"));
});
test("comisión liquidada guarda referencia y bloquea devolución sin conciliación", async (t) => {
  bind(t); const result = await command("POST", ["sales"], ticket(), scope);
  const sale = await db.sale.findUniqueOrThrow({ where: { id: result.id } });
  const lines = await db.salonSaleLine.findMany({ where: { salonSaleId: sale.salonSaleId!, commissionCents: { gt: 0 } } });
  const lineIds = lines.map((l) => l.id);
  await command("POST", ["commissions"], { lineIds, reference: "Transferencia de prueba 001" }, scope);
  assert.ok((await db.salonSaleLine.findUniqueOrThrow({ where: { id: lineIds[0] } })).commissionPaidAt);
  await assert.rejects(command("POST", ["commissions"], { lineIds, reference: "Duplicada" }, scope), code("COMMISSION_CHANGED"));
  await assert.rejects(command("POST", ["sales", sale.id, "refund"], { reason: "Devolver venta liquidada" }, scope), code("COMMISSION_ALREADY_PAID"));
});
test("fallo antes del commit revierte venta mixta, insumos y comisiones", async (t) => {
  bind(t); const count = await db.sale.count(), stock = await db.inventoryItem.findUniqueOrThrow({ where: { id: itemId } }), cash = await db.cashSession.findUniqueOrThrow({ where: { id: cashId } });
  t.mock.method(prisma, "$transaction", (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) => db.$transaction(async (tx) => { await operation(tx); throw new Error("salon-injected-rollback"); }));
  await assert.rejects(command("POST", ["sales"], ticket(), scope), /salon-injected-rollback/);
  assert.equal(await db.sale.count(), count); assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: itemId } })).stock, stock.stock); assert.equal((await db.cashSession.findUniqueOrThrow({ where: { id: cashId } })).expectedCents, cash.expectedCents);
});
test("PostgreSQL: un cobro mixto simultáneo con igual clave produce una venta y un descuento de stock", async (t) => {
  if (!process.env.INVENTORY_TEST_DATABASE_URL) return t.skip("Concurrencia real se valida en PostgreSQL"); bind(t);
  const input = ticket(), stock = await db.inventoryItem.findUniqueOrThrow({ where: { id: itemId } });
  const results = await Promise.all([command("POST", ["sales"], input, scope), command("POST", ["sales"], input, scope)]);
  assert.equal(results[0].id, results[1].id); assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: itemId } })).stock, stock.stock - 2);
});

test("servicios con citas pendientes conservan actividad y profesionales habilitados", async (t) => {
  bind(t);
  const service = await db.service.findUniqueOrThrow({ where: { id: serviceId } });
  const input = { name: service.name, category: "Cabello", durationMinutes: 30, price: 30 };
  await command("POST", ["appointments"], { customerId, serviceId, staffId, startsAt: future(18) }, scope);
  await assert.rejects(command("PATCH", ["services", serviceId], { ...input, active: false }, scope), code("PENDING_APPOINTMENTS"));
  const other = await db.staffMember.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, name: "Otro profesional" } });
  await assert.rejects(command("PATCH", ["services", serviceId], { ...input, staffIds: [other.id] }, scope), code("PENDING_APPOINTMENTS"));
  assert.equal((await db.service.findUniqueOrThrow({ where: { id: serviceId } })).active, true);
});

test("historial antiguo conserva snapshot y normaliza páginas fraccionarias", async (t) => {
  bind(t);
  const appointment = await db.appointment.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, customerId, serviceId, staffId, startsAt: new Date(), endsAt: new Date(), status: "COMPLETED", priceCents: 3000 } });
  const result = await command("POST", ["sales"], ticket(), scope);
  await db.sale.update({ where: { id: result.id }, data: { salonSaleId: null, appointmentId: appointment.id } });
  await db.service.update({ where: { id: serviceId }, data: { name: "Nombre modificado después" } });
  const history = await getSalonHistory(scope, new URLSearchParams("page=1.5"));
  assert.equal(history.page, 1);
  const sale = history.sales.find((s) => s.id === result.id)!;
  assert.equal(sale.lines[0].name, "Corte"); assert.equal(sale.lines[0].unitPriceCents, 3000); assert.equal(sale.refundable, false);
});
