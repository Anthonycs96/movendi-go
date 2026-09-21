import { test, expect, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { mkdir } from "node:fs/promises";

const db = new PrismaClient();
const base = "/api/operations/restaurant";
let tenantId: string, branchId: string;
let waiter: APIRequestContext, kitchen: APIRequestContext, cashier: APIRequestContext;
let registerId: string, sessionId: string;
async function login(api: APIRequestContext, email = "admin@brasa.local") {
  const response = await api.post("/api/auth/login", { data: { email, password: "Nexo2026!", businessSlug: "brasa-norte" } });
  expect(response.status(), await response.text()).toBe(200);
}
async function command(api: APIRequestContext, path: string, data: unknown, method: "post" | "patch" = "post") {
  const response = await api[method](`${base}/${path}`, { data });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}
async function order(api: APIRequestContext, tableId?: string) {
  const category = await db.category.findFirstOrThrow({ where: { tenantId, branchId } });
  const products = await Promise.all(["Cocina uno", "Cocina dos", "Cocina tres", "Bar bebida"].map((name, index) => db.product.upsert({ where: { tenantId_branchId_name: { tenantId, branchId, name } }, update: {}, create: { tenantId, branchId, categoryId: category.id, name, priceCents: 100, kitchenArea: index === 3 ? "BAR" : "KITCHEN" } })));
  const created = await command(api, "orders", { source: tableId ? "DINE_IN" : "TAKEAWAY", tableId, items: products.map(product => ({ productId: product.id, quantity: 1 })) });
  return db.restaurantOrder.findUniqueOrThrow({ where: { id: created.id }, include: { items: { orderBy: { name: "asc" } }, kitchenTicket: true } });
}
test.describe.serial("Preparación individual, servicio y cajas identificadas", () => {
  test.beforeAll(async ({ request, playwright }) => {
    expect(process.env.DATABASE_URL).toMatch(/e2e|inventory_hexagonal_test/);
    await login(request);
    const { session } = await (await request.get("/api/data/tenant?section=floor")).json();
    tenantId = session.tenantId; branchId = session.branchId;
    const hash = (await db.user.findFirstOrThrow({ where: { email: "admin@brasa.local" } })).passwordHash;
    for (const [key, permissions] of [
      ["SERVE_ONLY", ["restaurant:orders:serve", "restaurant:orders:write", "restaurant:floor:read"]],
      ["CHARGE_ONLY", ["restaurant:orders:charge"]],
    ] as const) {
      const role = await db.role.create({ data: { tenantId, key, name: key, permissions: JSON.stringify(permissions) } });
      const user = await db.user.create({ data: { email: `${key.toLowerCase()}@brasa.local`, name: key, passwordHash: hash } });
      await db.membership.create({ data: { tenantId, branchId, roleId: role.id, userId: user.id } });
    }
    waiter = await playwright.request.newContext({ baseURL: "http://localhost:3100" });
    kitchen = await playwright.request.newContext({ baseURL: "http://localhost:3100" });
    cashier = await playwright.request.newContext({ baseURL: "http://localhost:3100" });
    await login(waiter, "SERVE_ONLY@brasa.local"); await login(kitchen, "cocina@brasa.local"); await login(cashier, "CHARGE_ONLY@brasa.local");
  });
  test.afterAll(async () => { await Promise.all([waiter?.dispose(), kitchen?.dispose(), cashier?.dispose()]); await db.$disconnect(); });

  test("cajas por ID: aislamiento, montos, concurrencia, responsable e historial", async ({ request }) => {
    await login(request);
    registerId = (await command(request, "cash-registers", { name: "Caja terraza" })).id;
    const otherBranch = await db.branch.create({ data: { tenantId, name: "Otra sede QA" } });
    const foreign = await db.branch.findFirstOrThrow({ where: { tenantId: { not: tenantId } } });
    const invalid = await Promise.all([
      db.cashRegister.create({ data: { tenantId, branchId: otherBranch.id, name: "Ajena sede", nameKey: "ajena sede" } }),
      db.cashRegister.create({ data: { tenantId: foreign.tenantId, branchId: foreign.id, name: "Ajena empresa", nameKey: "ajena empresa" } }),
      db.cashRegister.create({ data: { tenantId, branchId, name: "Inactiva QA", nameKey: "inactiva qa", active: false } }),
    ]);
    for (const cashRegister of invalid) expect((await request.post(`${base}/cash`, { data: { cashRegisterId: cashRegister.id, openingAmount: 0 } })).status()).toBe(400);
    for (const openingAmount of [-1, "abc", 1.234, "", "1e3"]) expect((await request.post(`${base}/cash`, { data: { cashRegisterId: registerId, openingAmount } })).status()).toBe(400);
    expect((await request.post(`${base}/cash`, { data: { registerName: "Texto no permitido", openingAmount: 0 } })).status()).toBe(400);
    const started = Date.now();
    const results = await Promise.all([1, 2].map(() => request.post(`${base}/cash`, { data: { cashRegisterId: registerId, openingAmount: "12,50", openedById: "user-super", openedAt: "2000-01-01", branchId: otherBranch.id } })));
    expect(results.map(result => result.status()).sort()).toEqual([200, 409]);
    const saved = await db.cashSession.findFirstOrThrow({ where: { cashRegisterId: registerId, status: "OPEN" } });
    sessionId = saved.id;
    expect(saved.openingCents).toBe(1250); expect(saved.openedById).toBe("user-brasa-admin"); expect(saved.branchId).toBe(branchId); expect(saved.openedAt.getTime()).toBeGreaterThanOrEqual(started);
    expect(await db.cashSession.count({ where: { tenantId, branchId, status: "OPEN" } })).toBeGreaterThan(1);
    expect((await request.patch(`${base}/cash-registers/${registerId}`, { data: { name: "Otro nombre", active: false } })).status()).toBe(409);
    expect((await request.delete(`${base}/cash-registers/${registerId}`)).status()).toBe(404);
    for (const api of [waiter, kitchen, cashier]) expect((await api.post(`${base}/cash`, { data: { cashRegisterId: registerId, openingAmount: 0 } })).status()).toBe(403);
  });

  test("preparación por producto, parcial, dos dispositivos y servicio por permisos", async ({ request }) => {
    await login(request);
    const created = await order(request);
    const lines = created.items.filter(item => item.name.startsWith("Cocina"));
    const bar = created.items.find(item => item.name.startsWith("Bar"))!;
    const path = `kitchen/${created.kitchenTicket!.id}/status`;
    await command(kitchen, path, { status: "PREPARING", itemIds: [lines[0].id] }, "patch");
    expect((await db.orderItem.findUniqueOrThrow({ where: { id: lines[1].id } })).status).toBe("PENDING");
    expect((await db.orderItem.findUniqueOrThrow({ where: { id: bar.id } })).status).toBe("PENDING");
    const firstStart = (await db.orderItem.findUniqueOrThrow({ where: { id: lines[0].id } })).startedAt;
    await command(kitchen, path, { status: "PREPARING", itemIds: [lines[0].id] }, "patch");
    expect((await db.orderItem.findUniqueOrThrow({ where: { id: lines[0].id } })).startedAt).toEqual(firstStart);
    const simultaneous = await Promise.all([
      kitchen.patch(`${base}/${path}`, { data: { status: "READY", itemIds: [lines[0].id] } }),
      request.patch(`${base}/${path}`, { data: { status: "PREPARING", itemIds: [lines[1].id] } }),
    ]);
    for (const result of simultaneous) expect(result.status(), await result.text()).toBe(200);
    expect((await db.kitchenTicket.findUniqueOrThrow({ where: { id: created.kitchenTicket!.id } })).status).toBe("PARTIALLY_READY");
    expect((await kitchen.patch(`${base}/orders/${created.id}/serve`, { data: { itemIds: [lines[0].id] } })).status()).toBe(403);
    expect((await kitchen.patch(`${base}/${path}`, { data: { status: "SERVED", itemIds: [lines[0].id] } })).status()).toBe(403);
    expect((await waiter.patch(`${base}/orders/${created.id}/status`, { data: { status: "SERVED" } })).status()).toBe(409);
    expect((await waiter.patch(`${base}/orders/${created.id}/serve`, { data: { itemIds: [lines[1].id] } })).status()).toBe(409);
    await command(waiter, `orders/${created.id}/serve`, { itemIds: [lines[0].id] }, "patch");
    const served = await db.orderItem.findUniqueOrThrow({ where: { id: lines[0].id } });
    expect(served.readyAt).not.toBeNull(); expect(served.servedAt).not.toBeNull(); expect(served.readyByUserId).toBe("user-brasa-kitchen"); expect(served.servedByUserId).not.toBe(served.readyByUserId);
    expect((await db.orderItem.findUniqueOrThrow({ where: { id: lines[1].id } })).status).toBe("PREPARING");
    expect((await kitchen.patch(`${base}/${path}`, { data: { status: "READY", confirmed: true, itemIds: [bar.id, lines[2].id] } })).status()).toBe(409);
    await command(kitchen, path, { status: "READY", confirmed: true, itemIds: lines.slice(1).map(item => item.id) }, "patch");
    await command(kitchen, path, { status: "READY", confirmed: true, itemIds: [bar.id] }, "patch");
    expect((await db.kitchenTicket.findUniqueOrThrow({ where: { id: created.kitchenTicket!.id } })).status).toBe("READY");
    await command(waiter, `orders/${created.id}/serve`, {}, "patch");
    expect((await db.kitchenTicket.findUniqueOrThrow({ where: { id: created.kitchenTicket!.id } })).status).toBe("SERVED");
    for (const api of [waiter, kitchen]) expect((await api.post(`${base}/orders/${created.id}/checkout`, { data: { paymentMethod: "CASH", cashSessionId: sessionId } })).status()).toBe(403);
    expect((await cashier.post(`${base}/orders/${created.id}/checkout`, { data: { paymentMethod: "CASH" } })).status()).toBe(400);
    const paid = await command(cashier, `orders/${created.id}/checkout`, { paymentMethod: "CASH", cashSessionId: sessionId });
    expect((await db.sale.findUniqueOrThrow({ where: { id: paid.id } })).cashSessionId).toBe(sessionId);
    expect((await db.cashSession.findUniqueOrThrow({ where: { id: sessionId } })).expectedCents).toBe(1650);
    await command(request, `cash/${sessionId}/close`, { countedAmount: 16.5 });
    await command(request, `cash-registers/${registerId}`, { name: "Caja terraza", active: false }, "patch");
    expect((await db.cashSession.findUniqueOrThrow({ where: { id: sessionId } })).cashRegisterId).toBe(registerId);
  });

  test("dar permiso de cobro al mozo no le concede apertura, cierre ni cancelación", async ({ request }) => {
    await login(request);
    const role = await db.role.findFirstOrThrow({ where: { tenantId, key: "SERVE_ONLY" } });
    const changed = await request.patch(`/api/operations/core/roles/${role.id}`, { data: { name: "Mozo con cobro", permissions: "restaurant:orders:read,restaurant:orders:write,restaurant:orders:serve,restaurant:orders:charge,restaurant:floor:read" } });
    expect(changed.status(), await changed.text()).toBe(200);
    await login(waiter, "serve_only@brasa.local");
    const created = await order(request);
    const cash = await db.cashSession.findFirstOrThrow({ where: { tenantId, branchId, status: "OPEN" } });
    expect((await waiter.patch(`${base}/orders/${created.id}/status`, { data: { status: "CANCELLED", reason: "Prueba de permisos" } })).status()).toBe(403);
    expect((await waiter.post(`${base}/cash/${cash.id}/close`, { data: { countedAmount: cash.expectedCents / 100 } })).status()).toBe(403);
    expect((await waiter.post(`${base}/cash/${cash.id}/movement`, { data: { type: "IN", amount: 1, reason: "Prueba de permisos" } })).status()).toBe(403);
    for (const invalidId of ["cash-nova-open", sessionId]) expect((await waiter.post(`${base}/orders/${created.id}/checkout`, { data: { paymentMethod: "CARD", cashSessionId: invalidId } })).status()).toBe(409);
    await command(waiter, `orders/${created.id}/checkout`, { paymentMethod: "CARD", cashSessionId: cash.id });
    expect((await db.sale.findUniqueOrThrow({ where: { orderId: created.id } })).cashierId).toBe((await db.user.findFirstOrThrow({ where: { email: "serve_only@brasa.local" } })).id);
  });

  test("interfaz táctil, listo antes de servir, pedido antiguo y apertura desde frontend", async ({ page }) => {
    await login(page.request);
    const table = await db.diningTable.findFirstOrThrow({ where: { tenantId, branchId, status: "AVAILABLE" } });
    const created = await order(page.request, table.id);
    // Old records have no timestamps/recipe snapshots. Current routing is resolved safely.
    await db.orderItem.updateMany({ where: { orderId: created.id }, data: { recipeSnapshot: null, preparationAreaKey: "GENERAL", preparationAreaName: "General" } });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/t/brasa-norte/kitchen");
    const card = page.locator(".kitchen-ticket").filter({ hasText: created.code }).filter({ hasText: "Cocina uno" });
    await card.getByRole("button", { name: "Preparar · Cocina uno", exact: true }).click();
    await card.getByRole("button", { name: "Marcar listo · Cocina uno", exact: true }).click();
    await expect(card.getByText("Parcialmente listo", { exact: true })).toBeVisible();
    await expect(card.getByText("Listo para servir", { exact: true })).toBeVisible();
    const action = card.getByRole("button", { name: "Preparar · Cocina dos", exact: true });
    expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await mkdir("outputs/restaurant-service", { recursive: true });
    await page.screenshot({ path: "outputs/restaurant-service/kitchen-mobile.png", fullPage: true });
    page.once("dialog", dialog => dialog.accept());
    await card.getByRole("button", { name: "Marcar todos listos" }).click();
    await expect(card.getByRole("button", { name: /^Preparar/ })).toHaveCount(0);
    expect((await db.orderItem.findUniqueOrThrow({ where: { id: created.items.find(item => item.name === "Bar bebida")!.id } })).status).toBe("PENDING");
    await page.goto("/t/brasa-norte/floor");
    await page.locator(".floor-table").filter({ hasText: table.name }).getByRole("button", { name: new RegExp(table.name) }).first().click();
    await expect(page.locator(".attention-items").getByText("Listo para servir", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Servir Cocina uno", exact: true }).click();
    await expect(page.locator(".attention-items").getByText("Servido", { exact: true })).toBeVisible();
    await page.screenshot({ path: "outputs/restaurant-service/floor-mobile.png", fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.goto("/t/brasa-norte/settings");
    await page.getByRole("button", { name: "Nueva caja", exact: true }).click();
    await page.getByRole("dialog").getByLabel("Nombre de caja").fill("Caja creada desde web");
    await page.getByRole("dialog").getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.goto("/t/brasa-norte/checkout");
    await page.getByRole("button", { name: "Abrir caja", exact: true }).click();
    const modal = page.getByRole("dialog");
    await expect(modal.getByLabel("Caja o punto de venta")).toHaveValue(/.+/);
    await page.screenshot({ path: "outputs/restaurant-service/open-cash-mobile.png", fullPage: true });
    await modal.getByLabel("Monto inicial (S/)").fill("25.50");
    await modal.getByRole("button", { name: "Abrir caja", exact: true }).click();
    await expect(modal).toHaveCount(0);
    await expect(page.getByLabel("Turno de caja")).toBeVisible();
    await page.screenshot({ path: "outputs/restaurant-service/cash-mobile.png", fullPage: true });
  });
});
