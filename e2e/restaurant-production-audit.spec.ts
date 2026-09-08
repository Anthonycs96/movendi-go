import { expect, test, type APIRequestContext } from "@playwright/test";
import type { RestaurantData } from "@movendi/contracts";
import { PrismaClient } from "@prisma/client";
import { copyFile, mkdir, writeFile } from "node:fs/promises";

const password = "Audit-local-2026!";
const changedPasswords = new Map<string, string>();
let slug: string;
let tenantId: string;
let productId: string;
let drinkId: string;
let tableId: string;
let itemId: string;

async function login(api: APIRequestContext, email = `admin@${slug}.local`, businessSlug = slug, secret = password) {
  const effectivePassword = changedPasswords.get(email) ?? secret;
  const response = await api.post("/api/auth/login", { data: { email, businessSlug, password: effectivePassword, rememberSession: false } });
  expect(response.status(), await response.text()).toBe(200);
  if ((await response.json()).redirectTo.startsWith("/change-password")) {
    const newPassword = `${password}-changed`;
    const changed = await api.post("/api/auth/change-password", { data: { currentPassword: effectivePassword, newPassword } });
    expect(changed.status(), await changed.text()).toBe(200);
    changedPasswords.set(email, newPassword);
  }
}

async function command(api: APIRequestContext, path: string, data: unknown, method = "POST") {
  const response = await api.fetch(`/api/operations/${path}`, { method, data });
  expect(response.status(), `${path}: ${await response.text()}`).toBe(200);
  return await response.json() as { id: string; ok: boolean };
}

async function data(api: APIRequestContext, section = "dashboard") {
  const response = await api.get(`/api/data/tenant?section=${section}`);
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json() as { data: RestaurantData }).data;
}

async function order(api: APIRequestContext, extra: Record<string, unknown> = {}) {
  return command(api, "restaurant/orders", { source: "TAKEAWAY", items: [{ productId, quantity: 1 }], ...extra });
}

test.beforeAll(async ({ browser }) => {
  slug = `audit-${Date.now().toString(36)}`;
  const page = await browser.newPage();
  await login(page.request, "superadmin@multisaas.local", "nova-studio", "Nexo2026!");
  await page.goto("/platform/businesses");
  await page.getByRole("button", { name: /Nuevo negocio|Nueva empresa/i }).click();
  await page.getByLabel("Nombre comercial").fill(`Restaurante ${slug}`);
  await page.getByLabel("Nombre corto").fill("Auditoría real");
  await page.getByLabel(/Identificador URL/).fill(slug);
  await page.getByRole("dialog").getByLabel("Rubro").selectOption("RESTAURANT");
  await page.getByLabel("Primera sede").fill("Sede auditada");
  await page.getByLabel("Administrador", { exact: true }).fill("Administrador auditoría");
  await page.getByLabel("Correo del administrador").fill(`admin@${slug}.local`);
  await page.getByLabel(/Clave temporal/).fill(password);
  const created = page.waitForResponse((response) => response.url().endsWith("/api/operations/platform/tenants") && response.request().method() === "POST");
  await page.getByRole("button", { name: /Crear y continuar/i }).click();
  const response = await created;
  expect(response.status(), await response.text()).toBe(200);
  tenantId = (await response.json()).id;
  const setup = (payload: unknown) => command(page.request, `platform/onboarding/${tenantId}`, payload, "PATCH");
  await setup({ step: "MODULES", enabledModules: ["dashboard", "floor", "orders", "kitchen", "menu", "checkout", "settings", "inventory", "reports", "clients", "promotions"] });
  await setup({ step: "OPERATIONS", preparationAreas: [{ name: "Cocina", dispatchMode: "KDS" }, { name: "Barra", dispatchMode: "KDS" }], paymentMethods: ["CASH", "CARD"], hours: Array.from({ length: 7 }, (_, weekday) => ({ weekday, open: "08:00", close: "23:00", closed: false })) });
  await setup({ step: "CATALOG", categories: [{ name: "Platos", preparationArea: "Cocina" }, { name: "Bebidas", preparationArea: "Barra" }], products: [{ name: "Plato auditado", category: "Platos", price: 20, cost: 8 }, { name: "Bebida auditada", category: "Bebidas", price: 5, cost: 2 }] });
  await setup({ step: "TEAM", roles: [
    { key: "WAITER", name: "Mesero", permissions: ["dashboard:read", "restaurant:orders:read", "restaurant:orders:write", "restaurant:floor:read", "restaurant:floor:write", "restaurant:menu:read"] },
    { key: "CASHIER", name: "Cajero", permissions: ["dashboard:read", "restaurant:orders:read", "restaurant:cash:write"] },
    { key: "KITCHEN", name: "Cocina", permissions: ["restaurant:kitchen:read", "restaurant:kitchen:write"] },
    { key: "MANAGER", name: "Responsable", permissions: ["*"] },
  ], users: ["WAITER", "CASHIER", "KITCHEN"].map((roleKey) => ({ name: roleKey, email: `${roleKey.toLowerCase()}@${slug}.local`, password, roleKey })) });
  await setup({ step: "TABLES", zones: [{ name: "Salón", prefix: "M", count: 4, seats: 4 }] });
  await login(page.request);
  const initial = await data(page.request);
  productId = initial.products.find((item) => item.name === "Plato auditado")!.id;
  drinkId = initial.products.find((item) => item.name === "Bebida auditada")!.id;
  tableId = initial.tables[0].id;
  itemId = (await command(page.request, "inventory/items", { sku: "AUDIT-INPUT", name: "Insumo auditado", kind: "INPUT", unit: "KG", openingStock: 1000, minimumStock: 2, unitCost: 8 })).id;
  await command(page.request, `inventory/recipes/${productId}`, { yieldQuantity: 1, ingredients: [{ itemId, quantity: 1, wastePercent: 0 }] });
  await command(page.request, "restaurant/cash", { openingAmount: 100 });
  await login(page.request, "superadmin@multisaas.local", "nova-studio", "Nexo2026!");
  await setup({ step: "BUSINESS", name: `Restaurante ${slug}`, shortName: "Auditoría real", branchName: "Sede auditada", email: "", country: "PE", currency: "PEN", timezone: "America/Lima" });
  for (const [step, sections] of Object.entries({
    RESTAURANT_OPERATION: { general: initial.configuration.general, orders: initial.configuration.orders, delivery: initial.configuration.delivery },
    RESTAURANT_KITCHEN: { kitchen: initial.configuration.kitchen },
    RESTAURANT_SALES: { sales: initial.configuration.sales, promotions: initial.configuration.promotions },
    RESTAURANT_CONTROL: { floor: initial.configuration.floor, menu: initial.configuration.menu, customers: initial.configuration.customers, inventory: initial.configuration.inventory, notifications: initial.configuration.notifications, reports: initial.configuration.reports },
    RESTAURANT_INTEGRATIONS: { integrations: initial.configuration.integrations },
  })) await setup({ step, sections });
  await setup({ step: "PRINTING", skip: true });
  await setup({ step: "REVIEW", ready: true });
  await page.close();
});

test.beforeEach(async ({ request }) => { await login(request); });

test("jornada: pedido, cocina/barra, entrega, cobro mixto, inventario, compra y caja", async ({ request }) => {
  const initial = await data(request);
  await command(request, "restaurant/configuration/sales", { ...initial.configuration.sales, splitPaymentsEnabled: true }, "PATCH");
  const created = await order(request, { source: "DINE_IN", tableId, items: [{ productId, quantity: 2 }, { productId: drinkId, quantity: 1 }] });
  let current = await data(request);
  const ticket = current.orders.find((item) => item.id === created.id)!.kitchenTicket!;
  const kitchenLines = current.orders.find((item) => item.id === created.id)!.items;
  for (const key of new Set(kitchenLines.map((line) => line.preparationAreaKey))) {
    const itemIds = kitchenLines.filter((line) => line.preparationAreaKey === key).map((line) => line.id);
    for (const status of ["PREPARING", "READY", "SERVED"]) await command(request, `restaurant/kitchen/${ticket.id}/status`, { status, itemIds }, "PATCH");
  }
  const sale = await command(request, `restaurant/orders/${created.id}/checkout`, { payments: [{ method: "CASH", amount: 25 }, { method: "CARD", amount: 20 }] });
  current = await data(request);
  expect(current.orders.find((item) => item.id === created.id)).toMatchObject({ status: "COMPLETED", paid: true, totalCents: 4500 });
  expect(current.sales.find((item) => item.id === sale.id)?.payments).toHaveLength(2);
  expect(current.cashSession!.expectedCents).toBe(initial.cashSession!.expectedCents + 2500);
  expect(current.tables.find((item) => item.id === tableId)?.status).toBe("CLEANING");
  await command(request, `restaurant/tables/${tableId}/clean`, {});
  const inventory = await request.get("/api/data/tenant?section=inventory");
  const stock = (await inventory.json()).data.inventoryModule;
  expect(stock.items.find((item: { id: string }) => item.id === itemId).stock).toBe(998);
  await command(request, "inventory/purchases", { supplierName: "Proveedor auditado", idempotencyKey: `purchase-${slug}`, lines: [{ itemId, quantity: 2, unitCost: 8 }] });
  const repeated = await command(request, "inventory/purchases", { supplierName: "Proveedor auditado", idempotencyKey: `purchase-${slug}`, lines: [{ itemId, quantity: 2, unitCost: 8 }] });
  expect(repeated.id).toBeTruthy();
  const reports = await data(request, "reports");
  expect(reports.reports).toBeTruthy();
});

test("un mesero no puede cobrar y un cajero sí", async ({ request, playwright }) => {
  const created = await order(request);
  const waiter = await playwright.request.newContext({ baseURL: "http://localhost:3100" });
  const cashier = await playwright.request.newContext({ baseURL: "http://localhost:3100" });
  await login(waiter, `waiter@${slug}.local`);
  await login(cashier, `cashier@${slug}.local`);
  const forbidden = await waiter.post(`/api/operations/restaurant/orders/${created.id}/checkout`, { data: { paymentMethod: "CARD" } });
  expect.soft(forbidden.status(), await forbidden.text()).toBe(403);
  expect.soft((await forbidden.json()).error.code).toBe("FORBIDDEN");
  const allowed = await cashier.post(`/api/operations/restaurant/orders/${created.id}/checkout`, { data: { paymentMethod: "CARD" } });
  expect.soft(allowed.status(), await allowed.text()).toBe(200);
  await waiter.dispose(); await cashier.dispose();
});

test("no permite completar un pedido sin registrar la venta", async ({ request }) => {
  const created = await order(request);
  await command(request, `restaurant/orders/${created.id}/status`, { status: "SERVED" }, "PATCH");
  const response = await request.patch(`/api/operations/restaurant/orders/${created.id}/status`, { data: { status: "COMPLETED" } });
  expect(response.status(), await response.text()).toBe(409);
});

test("repetir una solicitud para llevar no duplica pedido ni comanda", async ({ request }) => {
  const payload = { source: "TAKEAWAY", idempotencyKey: `order-${slug}`, items: [{ productId, quantity: 1 }] };
  const first = await command(request, "restaurant/orders", payload);
  const second = await command(request, "restaurant/orders", payload);
  expect(second.id).toBe(first.id);
  const changed = await request.post("/api/operations/restaurant/orders", { data: { ...payload, items: [{ productId, quantity: 2 }] } });
  expect(changed.status()).toBe(409);
  const addition = { idempotencyKey: `addition-${slug}`, items: [{ productId, quantity: 1 }] };
  await command(request, `restaurant/orders/${first.id}/items`, addition, "PATCH");
  await command(request, `restaurant/orders/${first.id}/items`, addition, "PATCH");
  expect((await data(request)).orders.find((item) => item.id === first.id)?.totalCents).toBe(4000);
});

test("valida campos, relaciones ajenas, sesión y stock insuficiente con rollback", async ({ request, playwright }) => {
  const invalid = await request.post("/api/operations/restaurant/orders", { data: { items: [] } });
  expect(invalid.status()).toBe(400);
  const otherTenant = await playwright.request.newContext({ baseURL: "http://localhost:3100" });
  await login(otherTenant, "admin@brasa.local", "brasa-norte", "Nexo2026!");
  const otherData = await data(otherTenant);
  expect(otherData.products.length).toBeGreaterThan(0);
  expect(otherData.customers.length).toBeGreaterThan(0);
  const foreign = await request.post("/api/operations/restaurant/orders", { data: { source: "TAKEAWAY", items: [{ productId: otherData.products[0].id, quantity: 1 }] } });
  expect(foreign.status()).toBe(400);
  const customer = await request.get(`/api/operations/core/customers/${otherData.customers[0].id}`);
  expect(customer.status()).toBe(404);
  expect((await data(request)).products.some((item) => item.id === otherData.products[0].id)).toBe(false);
  await otherTenant.dispose();
  const noSession = await playwright.request.newContext({ baseURL: "http://localhost:3100" });
  expect((await noSession.get("/api/data/tenant")).status()).toBe(401);
  await noSession.dispose();
  const scarce = await command(request, "inventory/items", { sku: "SCARCE", name: "Escaso", unit: "UND", openingStock: 0, unitCost: 1 });
  await command(request, `inventory/recipes/${drinkId}`, { yieldQuantity: 1, ingredients: [{ itemId: scarce.id, quantity: 1 }] });
  const before = (await data(request)).orders.length;
  const attempt = await request.post("/api/operations/restaurant/orders", { data: { source: "TAKEAWAY", items: [{ productId: drinkId, quantity: 1 }] } });
  expect(attempt.status(), await attempt.text()).toBe(409);
  expect((await data(request)).orders.length).toBe(before);
});

test("doble cobro concurrente registra una única venta", async ({ request }) => {
  const created = await order(request);
  const results = await Promise.all([1, 2].map(() => request.post(`/api/operations/restaurant/orders/${created.id}/checkout`, { data: { paymentMethod: "CARD" } })));
  expect(results.map((result) => result.status()).sort()).toEqual([200, 409]);
});

test("adiciones concurrentes conservan todas las líneas y su total", async ({ request }) => {
  const created = await order(request);
  const results = await Promise.all([1, 2].map(() => request.patch(`/api/operations/restaurant/orders/${created.id}/items`, { data: { items: [{ productId, quantity: 1 }] } })));
  const accepted = results.filter((result) => result.status() === 200).length;
  expect(accepted).toBeGreaterThan(0);
  for (const result of results) expect([200, 409], await result.text()).toContain(result.status());
  const current = (await data(request)).orders.find((item) => item.id === created.id)!;
  expect(current.totalCents).toBe(current.items.reduce((sum, line) => sum + line.totalCents, 0));
  expect(current.totalCents).toBe(2000 * (1 + accepted));
});

test("un módulo desactivado bloquea tanto lectura como escritura por API", async ({ request, playwright }) => {
  const platform = await playwright.request.newContext({ baseURL: "http://localhost:3100" });
  await login(platform, "superadmin@multisaas.local", "nova-studio", "Nexo2026!");
  const modules = ["dashboard", "floor", "orders", "kitchen", "menu", "checkout", "settings", "inventory", "reports", "clients", "promotions"];
  try {
    await command(platform, `platform/onboarding/${tenantId}`, { step: "MODULES", enabledModules: modules.filter((item) => item !== "inventory") }, "PATCH");
    expect((await request.get("/api/data/tenant?section=inventory")).status()).toBe(403);
    expect((await request.post("/api/operations/inventory/items", { data: { sku: "DISABLED", name: "No permitido", unit: "KG" } })).status()).toBe(403);
  } finally {
    await command(platform, `platform/onboarding/${tenantId}`, { step: "MODULES", enabledModules: modules }, "PATCH");
    await command(platform, `platform/onboarding/${tenantId}`, { step: "REVIEW", ready: true }, "PATCH");
    await platform.dispose();
  }
});

test("un cajero asignado a una sede no puede cambiar a otra", async ({ request, playwright }) => {
  const branch = await command(request, "core/branches", { name: "Sucursal secundaria" });
  const cashier = await playwright.request.newContext({ baseURL: "http://localhost:3100" });
  await login(cashier, `cashier@${slug}.local`);
  const response = await cashier.post("/api/auth/branch", { data: { branchId: branch.id } });
  expect(response.status(), await response.text()).toBe(403);
  expect((await response.json()).error.code).toBe("BRANCH_ACCESS_DENIED");
  await cashier.dispose();
});

test("la caja cierra con saldo correcto y dos aperturas simultáneas no duplican caja", async ({ request }) => {
  let current = await data(request);
  const cash = current.cashSession!;
  const contribution = { type: "IN", amount: 10, reason: "Aporte auditoría", idempotencyKey: `cash-${slug}` };
  await command(request, `restaurant/cash/${cash.id}/movement`, contribution);
  await command(request, `restaurant/cash/${cash.id}/movement`, contribution);
  await command(request, `restaurant/cash/${cash.id}/movement`, { type: "OUT", amount: 5, reason: "Retiro auditoría" });
  current = await data(request);
  expect(current.cashSession!.expectedCents).toBe(cash.expectedCents + 500);
  await command(request, `restaurant/cash/${cash.id}/close`, { countedAmount: current.cashSession!.expectedCents / 100 });
  expect((await data(request)).cashSession).toBeNull();
  const responses = await Promise.all([1, 2].map(() => request.post("/api/operations/restaurant/cash", { data: { openingAmount: 100 } })));
  expect(responses.map((response) => response.status()).sort()).toEqual([200, 409]);
  expect((await request.post(`/api/operations/restaurant/cash/${cash.id}/movement`, { data: { type: "IN", amount: 1, reason: "Caja cerrada" } })).status()).toBe(404);
});

test("el tablero suma más de 50 ventas y conserva pedidos antiguos aún abiertos", async ({ request }) => {
  test.setTimeout(180_000);
  const initial = await data(request);
  const pending = await order(request);
  let revenue = 0;
  for (let index = 0; index < 102; index += 1) {
    const created = await order(request);
    await command(request, `restaurant/orders/${created.id}/checkout`, { paymentMethod: "CARD" });
    revenue += 2000;
  }
  const current = await data(request);
  expect(current.metrics.todayRevenueCents).toBe(initial.metrics.todayRevenueCents + revenue);
  expect(current.orders.some((item) => item.id === pending.id)).toBe(true);
  expect(current.kitchen.some((item) => item.id === pending.id)).toBe(true);
});

test("el carrito conserva sus datos y reutiliza la solicitud tras perder la respuesta", async ({ page }) => {
  await login(page.request);
  const before = await data(page.request);
  await page.goto(`/t/${slug}/floor`);
  await page.getByRole("button", { name: "Para llevar", exact: true }).click();
  await page.getByRole("button", { name: "Agregar Plato auditado", exact: true }).first().click();
  let lost = false;
  let requestKey = "";
  await page.route("**/api/operations/restaurant/orders", async (route) => {
    if (!lost) {
      lost = true;
      requestKey = route.request().postDataJSON().idempotencyKey;
      const committed = await route.fetch();
      expect(committed.status()).toBe(200);
      await route.abort("failed");
    } else {
      expect(route.request().postDataJSON().idempotencyKey).toBe(requestKey);
      await route.continue();
    }
  });
  const submit = page.getByRole("button", { name: /^Enviar a cocina/ }).first();
  await submit.click();
  await expect(submit).toBeEnabled();
  expect(requestKey.length).toBeGreaterThan(8);
  await submit.click();
  await expect(page.getByText("El pedido ya quedó registrado.").first()).toBeVisible();
  const after = await data(page.request);
  expect(after.metrics.activeOrders).toBe(before.metrics.activeOrders + 1);
});

test("impresión: una estación reclama, falla, reintenta y confirma la comanda", async ({ request }) => {
  const printer = await command(request, "restaurant/print-devices", { name: "Impresora QA", connectionType: "BROWSER", paperWidthMm: 80 });
  await command(request, "restaurant/print-settings", { mode: "SIMPLE", automatic: false, defaultPrinterId: printer.id, fields: ["table", "orderCode", "itemNotes"] }, "PATCH");
  const created = await order(request);
  const current = await data(request);
  const orderCode = current.orders.find((item) => item.id === created.id)!.code;
  const jobs = await request.get(`/api/operations/restaurant/print-jobs/${printer.id}`);
  const job = (await jobs.json()).jobs.find((item: { order: { code: string } }) => item.order.code === orderCode);
  expect(job.payload.items[0].name).toBe("Plato auditado");
  const claims = await Promise.all(["station-one", "station-two"].map(async (stationId) => {
    const response = await request.post(`/api/operations/restaurant/print-jobs/${job.id}/claim`, { data: { stationId } });
    return { stationId, ...(await response.json()) } as { stationId: string; claimed: boolean };
  }));
  expect(claims.filter((claim) => claim.claimed)).toHaveLength(1);
  const stationId = claims.find((claim) => claim.claimed)!.stationId;
  await command(request, `restaurant/print-jobs/${job.id}/status`, { stationId, status: "FAILED", error: "Sin papel (prueba)" }, "PATCH");
  await command(request, `restaurant/print-jobs/${job.id}/retry`, {});
  await command(request, `restaurant/print-jobs/${job.id}/claim`, { stationId });
  await command(request, `restaurant/print-jobs/${job.id}/status`, { stationId, status: "PRINTED" }, "PATCH");
  expect((await request.patch(`/api/operations/restaurant/print-jobs/${job.id}/status`, { data: { stationId, status: "PRINTED" } })).status()).toBe(409);
  const next = await order(request);
  const nextCode = (await data(request)).orders.find((item) => item.id === next.id)!.code;
  const nextJobs = await request.get(`/api/operations/restaurant/print-jobs/${printer.id}`);
  const expiring = (await nextJobs.json()).jobs.find((item: { order: { code: string } }) => item.order.code === nextCode);
  await command(request, `restaurant/print-jobs/${expiring.id}/claim`, { stationId });
  const db = new PrismaClient();
  try { await db.restaurantPrintJob.updateMany({ where: { id: expiring.id, tenantId }, data: { leaseExpiresAt: new Date(0) } }); }
  finally { await db.$disconnect(); }
  expect((await request.patch(`/api/operations/restaurant/print-jobs/${expiring.id}/status`, { data: { stationId, status: "PRINTED" } })).status()).toBe(409);
  const reclaim = await request.post(`/api/operations/restaurant/print-jobs/${expiring.id}/claim`, { data: { stationId: "station-recovery" } });
  expect(await reclaim.json()).toMatchObject({ claimed: true });
  await command(request, `restaurant/print-jobs/${expiring.id}/status`, { stationId: "station-recovery", status: "PRINTED" }, "PATCH");
});

test("repetir un conteo no duplica el documento ni revierte movimientos posteriores", async ({ request }) => {
  const item = await command(request, "inventory/items", { sku: "COUNT-AUDIT", name: "Conteo auditado", unit: "UND", openingStock: 10 });
  const payload = { idempotencyKey: `count-${slug}`, lines: [{ itemId: item.id, countedQuantity: 10 }] };
  const first = await command(request, "inventory/counts", payload);
  await command(request, "inventory/movements", { itemId: item.id, type: "RESTOCK", quantity: 5, idempotencyKey: `move-${slug}` });
  const second = await command(request, "inventory/counts", payload);
  expect(second.id).toBe(first.id);
  const inventory = await request.get("/api/data/tenant?section=inventory");
  expect((await inventory.json()).data.inventoryModule.items.find((row: { id: string }) => row.id === item.id).stock).toBe(15);
});

test("reserva, recepción, traslado, cancelación y rechazo de editar una mesa ocupada", async ({ request }) => {
  const tables = (await data(request)).tables;
  const source = tables.find((item) => item.status === "AVAILABLE")!;
  const target = tables.find((item) => item.status === "AVAILABLE" && item.id !== source.id)!;
  const invalid = await request.post(`/api/operations/restaurant/tables/${source.id}/reserve`, { data: { name: "Reserva QA", partySize: source.seats + 1 } });
  expect(invalid.status()).toBe(400);
  await command(request, `restaurant/tables/${source.id}/reserve`, { name: "Reserva QA", partySize: 2, reservedAt: new Date(Date.now() + 3_600_000).toISOString() });
  expect((await request.post(`/api/operations/restaurant/tables/${source.id}/reserve`, { data: { name: "Reserva QA", partySize: 2 } })).status()).toBe(409);
  expect((await request.post("/api/operations/restaurant/orders", { data: { source: "DINE_IN", tableId: source.id, items: [{ productId, quantity: 1 }] } })).status()).toBe(409);
  await command(request, `restaurant/tables/${source.id}/seat`, {});
  const created = await order(request, { source: "DINE_IN", tableId: source.id });
  const deactivation = await request.patch(`/api/operations/restaurant/tables/${source.id}`, { data: { name: source.name, areaId: source.area.id, seats: source.seats, active: "false" } });
  expect(deactivation.status()).toBe(409);
  await command(request, `restaurant/orders/${created.id}/transfer`, { tableId: target.id }, "PATCH");
  await command(request, `restaurant/orders/${created.id}/status`, { status: "CANCELLED", reason: "Solicitud del cliente (QA)" }, "PATCH");
  const current = await data(request);
  expect(current.tables.find((item) => item.id === target.id)?.status).toBe("AVAILABLE");
  expect(current.orders.find((item) => item.id === created.id)?.kitchenTicket?.status).toBe("CANCELLED");
  expect((await request.post(`/api/operations/restaurant/orders/${created.id}/checkout`, { data: { paymentMethod: "CASH" } })).status()).toBe(409);
  const reservations = await Promise.all(["Una reserva", "Otra reserva"].map((name) => request.post(`/api/operations/restaurant/tables/${target.id}/reserve`, { data: { name, partySize: 2 } })));
  expect(reservations.map((response) => response.status()).sort()).toEqual([200, 409]);
  expect((await data(request)).tables.find((item) => item.id === target.id)?.status).toBe("RESERVED");
  await command(request, `restaurant/tables/${target.id}/seat`, {});
});

test("todas las pantallas cargan sin errores ni desborde en PC, tablet y móvil", async ({ page }) => {
  await login(page.request);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const section of ["dashboard", "floor", "orders", "kitchen", "menu", "clients", "inventory", "promotions", "checkout", "reports", "settings"]) {
      const response = await page.goto(`/t/${slug}/${section}`);
      expect(response?.status(), `${width}/${section}`).toBe(200);
      await expect(page.locator("h1")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `${width}/${section}: overflow`).toBe(true);
    }
  }
  expect(errors).toEqual([]);
});

test("cliente desde formulario, delivery, estados y cobro", async ({ page }) => {
  await login(page.request);
  await page.goto(`/t/${slug}/clients`);
  await page.getByRole("button", { name: "Nuevo cliente", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nombre", { exact: true }).fill("Cliente delivery QA");
  await dialog.getByLabel("Documento", { exact: true }).fill("45678901");
  await dialog.getByLabel("Celular").fill("900000001");
  await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByPlaceholder("Buscar por nombre o documento").fill("Cliente delivery QA");
  await expect(page.getByRole("row").filter({ hasText: "Cliente delivery QA" })).toHaveCount(1);
  const customer = (await data(page.request)).customers.find((item) => item.name === "Cliente delivery QA")!;
  const created = await order(page.request, { source: "DELIVERY", customerId: customer.id, deliveryPhone: "900000001", deliveryAddress: "Dirección de prueba 123", deliveryFee: 5 });
  const current = (await data(page.request)).orders.find((item) => item.id === created.id)!;
  expect(current.totalCents).toBe(2500);
  await command(page.request, `restaurant/kitchen/${current.kitchenTicket!.id}/status`, { status: "READY" }, "PATCH");
  for (const status of ["DISPATCHED", "DELIVERED"]) await command(page.request, `restaurant/orders/${created.id}/delivery-status`, { status }, "PATCH");
  await command(page.request, `restaurant/orders/${created.id}/checkout`, { paymentMethod: "CARD" });
});

test("el costo histórico no cambia al editar el catálogo y los reportes solo se calculan al pedirlos", async ({ request }) => {
  const current = await data(request);
  expect(current.reports).toBeNull();
  const product = current.products.find((item) => item.id === productId)!;
  const before = (await data(request, "reports")).reports!.metrics;
  const update = (cost: number) => command(request, `restaurant/products/${productId}`, { name: product.name, categoryId: product.category.id, price: product.priceCents / 100, cost, active: "true" }, "PATCH");
  await update(99);
  try { expect((await data(request, "reports")).reports!.metrics).toEqual(before); }
  finally { await update(product.costCents / 100); }
});

test("una sesión vencida no lee ni modifica datos", async ({ playwright }) => {
  const isolated = await playwright.request.newContext({ baseURL: "http://localhost:3100" });
  const db = new PrismaClient();
  try {
    await login(isolated, `kitchen@${slug}.local`);
    // Fault injection is limited to the synthetic tenant in the isolated E2E DB.
    const changed = await db.session.updateMany({ where: { tenantId, user: { email: `kitchen@${slug}.local` } }, data: { expiresAt: new Date(0) } });
    expect(changed.count).toBeGreaterThan(0);
    expect((await isolated.get("/api/data/tenant?section=kitchen")).status()).toBe(401);
    expect((await isolated.post("/api/operations/restaurant/orders", { data: { source: "TAKEAWAY", items: [{ productId, quantity: 1 }] } })).status()).toBe(401);
  } finally { await db.$disconnect(); await isolated.dispose(); }
});

test("cada estación avanza sus productos sin completar otra área", async ({ request }) => {
  const initial = await data(request);
  const drink = initial.products.find((item) => item.id === drinkId)!;
  const independent = await command(request, "restaurant/products", { name: "Bebida independiente", categoryId: drink.category.id, price: 5, cost: 1, kitchenArea: "BAR" });
  const created = await order(request, { items: [{ productId, quantity: 1 }, { productId: independent.id, quantity: 1 }] });
  const opened = (await data(request)).orders.find((item) => item.id === created.id)!;
  const drinkLine = opened.items.find((item) => item.productId === independent.id)!;
  const plateLine = opened.items.find((item) => item.productId === productId)!;
  expect(drinkLine.preparationAreaKey).not.toBe(plateLine.preparationAreaKey);
  const bulk = await request.patch(`/api/operations/restaurant/kitchen/${opened.kitchenTicket!.id}/status`, { data: { status: "READY" } });
  expect(bulk.status()).toBe(409);
  await command(request, `restaurant/kitchen/${opened.kitchenTicket!.id}/status`, { status: "READY", itemIds: [drinkLine.id] }, "PATCH");
  const partial = (await data(request)).orders.find((item) => item.id === created.id)!;
  expect(partial.status).toBe("PREPARING");
  expect(partial.items.find((item) => item.id === plateLine.id)?.status).toBe("PENDING");
  expect(partial.items.find((item) => item.id === drinkLine.id)?.status).toBe("READY");
  const invalid = await request.patch(`/api/operations/restaurant/kitchen/${opened.kitchenTicket!.id}/status`, { data: { status: "READY", itemIds: ["foreign-line"] } });
  expect(invalid.status()).toBe(400);
});

test("reserva receta original y devolución total concilia caja e inventario sin duplicación", async ({ request }) => {
  const initial = await data(request);
  const ingredient = await command(request, "inventory/items", { sku: "REFUND-INPUT", name: "Insumo devolución", kind: "INPUT", unit: "UND", openingStock: 5, unitCost: 1 });
  const product = await command(request, "restaurant/products", { name: "Plato devolución", categoryId: initial.categories[0].id, price: 10, cost: 1 });
  await command(request, `inventory/recipes/${product.id}`, { yieldQuantity: 1, ingredients: [{ itemId: ingredient.id, quantity: 1 }] });
  const created = await order(request, { items: [{ productId: product.id, quantity: 2 }] });
  const stock = async () => { const response = await request.get("/api/data/tenant?section=inventory"); return (await response.json()).data.inventoryModule.items.find((row: { id: string }) => row.id === ingredient.id).stock; };
  expect(await stock()).toBe(3);
  await command(request, `inventory/recipes/${product.id}`, { yieldQuantity: 1, ingredients: [{ itemId: ingredient.id, quantity: 4 }] });
  const sale = await command(request, `restaurant/orders/${created.id}/checkout`, { paymentMethod: "CASH" });
  expect(await stock()).toBe(3);
  const beforeRefund = (await data(request)).cashSession!.expectedCents;
  const input = { reason: "Cliente devuelve productos recuperables", stockDisposition: "RESTOCK", paymentConfirmed: true };
  await command(request, `restaurant/sales/${sale.id}/refund`, input);
  await command(request, `restaurant/sales/${sale.id}/refund`, input);
  expect(await stock()).toBe(5);
  const result = await data(request);
  expect(result.cashSession!.expectedCents).toBe(beforeRefund - 2000);
  expect(result.sales.find((row) => row.id === sale.id)?.status).toBe("REFUNDED");
  const changed = await request.post(`/api/operations/restaurant/sales/${sale.id}/refund`, { data: { ...input, reason: "Otra solicitud distinta" } });
  expect(changed.status()).toBe(409);
});

test("cancelar sin preparación libera reserva; preparado registra merma", async ({ request }) => {
  const stock = async () => { const response = await request.get("/api/data/tenant?section=inventory"); return (await response.json()).data.inventoryModule.items.find((row: { id: string }) => row.id === itemId).stock; };
  const before = await stock();
  const first = await order(request);
  expect(await stock()).toBe(before - 1);
  await command(request, `restaurant/orders/${first.id}/status`, { status: "CANCELLED", reason: "Cliente cancela antes de preparar" }, "PATCH");
  expect(await stock()).toBe(before);
  const second = await order(request);
  const row = (await data(request)).orders.find((item) => item.id === second.id)!;
  await command(request, `restaurant/kitchen/${row.kitchenTicket!.id}/status`, { status: "PREPARING" }, "PATCH");
  await command(request, `restaurant/orders/${second.id}/status`, { status: "CANCELLED", reason: "Plato preparado no recuperable" }, "PATCH");
  expect(await stock()).toBe(before - 1);
});

test("cola manual exige envío explícito y conectores no disponibles no se activan", async ({ request }) => {
  const initial = await data(request);
  await command(request, "restaurant/configuration/kitchen", { ...initial.configuration.kitchen, autoQueue: false }, "PATCH");
  const created = await order(request);
  let current = await data(request);
  expect(current.orders.find((row) => row.id === created.id)?.kitchenTicket?.status).toBe("HELD");
  expect(current.kitchen.some((row) => row.id === created.id)).toBe(false);
  await command(request, `restaurant/orders/${created.id}/queue`, {});
  current = await data(request);
  expect(current.kitchen.some((row) => row.id === created.id)).toBe(true);
  await command(request, "restaurant/configuration/kitchen", initial.configuration.kitchen, "PATCH");
  const unavailable = await request.patch("/api/operations/restaurant/configuration/integrations", { data: { ...initial.configuration.integrations, deliveryEnabled: true } });
  expect(unavailable.status()).toBe(409);
});

test("historial recupera ventas antiguas, cierres y movimientos con paginación real", async ({ request }) => {
  const first = await request.get("/api/data/restaurant-history?kind=sales&page=1");
  expect(first.status()).toBe(200);
  const a = await first.json();
  expect(a.total).toBeGreaterThan(50); expect(a.rows).toHaveLength(25);
  const last = await request.get(`/api/data/restaurant-history?kind=sales&page=${Math.ceil(a.total / 25)}`);
  const b = await last.json();
  expect(b.rows.length).toBeGreaterThan(0);
  expect(a.rows.some((row: { id: string }) => row.id === b.rows[0].id)).toBe(false);
  const byCode = await request.get(`/api/data/restaurant-history?kind=sales&q=${encodeURIComponent(b.rows[0].code)}`);
  expect((await byCode.json()).rows).toHaveLength(1);
  const cash = await request.get("/api/data/restaurant-history?kind=cash");
  expect((await cash.json()).rows.some((row: { status: string; countedCents: number | null }) => row.status === "CLOSED" && row.countedCents !== null)).toBe(true);
  expect((await request.get("/api/data/restaurant-history?from=invalid")).status()).toBe(400);
});

test("ambiente fiscal y credenciales deben coincidir antes de cualquier envío", async ({ request }) => {
  const initial = await data(request);
  await command(request, "restaurant/sunat/credentials", { environment: "BETA", apiUrl: "https://api.nubefact.com/api/v1/qa-no-external-call", token: "qa-token-no-network-call-2026" });
  await command(request, "restaurant/configuration/integrations", { ...initial.configuration.integrations, sunatEnabled: true, sunatEnvironment: "PRODUCTION" }, "PATCH");
  const created = await order(request);
  const sale = await command(request, `restaurant/orders/${created.id}/checkout`, { paymentMethod: "CARD" });
  const emission = await request.post(`/api/operations/restaurant/sales/${sale.id}/electronic-document`, { data: { kind: "BOLETA" } });
  expect(emission.status()).toBe(409);
  expect((await emission.json()).error.code).toBe("SUNAT_ENVIRONMENT_MISMATCH");
  await command(request, "restaurant/configuration/integrations", initial.configuration.integrations, "PATCH");
});

test("el pago anticipado conserva las comandas pendientes hasta su entrega", async ({ request }) => {
  const created = await order(request);
  await command(request, `restaurant/orders/${created.id}/checkout`, { paymentMethod: "CARD" });
  const current = await data(request);
  const queued = current.kitchen.find((item) => item.id === created.id)!;
  expect(queued).toBeTruthy(); expect(queued.paid).toBe(true);
  await command(request, `restaurant/kitchen/${queued.kitchenTicket!.id}/status`, { status: "SERVED" }, "PATCH");
  expect((await data(request)).kitchen.some((item) => item.id === created.id)).toBe(false);
});

test("cuota mensual atómica: solo una solicitud ocupa la última plaza y su reintento funciona", async ({ request }) => {
  expect(process.env.DATABASE_URL).toBeTruthy();
  const db = new PrismaClient();
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: tenantId }, include: { plan: true } });
  const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
  const count = await db.restaurantOrder.count({ where: { tenantId, createdAt: { gte: start } } });
  try {
    await db.platformPlan.update({ where: { id: tenant.planId! }, data: { maxMonthlyOperations: count + 1 } });
    const payloads = [0, 1].map(() => ({ source: "TAKEAWAY", items: [{ productId, quantity: 1 }], idempotencyKey: crypto.randomUUID() }));
    const responses = await Promise.all(payloads.map((payload) => request.post("/api/operations/restaurant/orders", { data: payload })));
    expect(responses.map((response) => response.status()).sort()).toEqual([200, 409]);
    const winner = responses.findIndex((response) => response.status() === 200);
    const replay = await request.post("/api/operations/restaurant/orders", { data: payloads[winner] });
    expect(replay.status(), await replay.text()).toBe(200);
    expect((await replay.json()).id).toBe((await responses[winner].json()).id);
  } finally { await db.platformPlan.update({ where: { id: tenant.planId! }, data: { maxMonthlyOperations: tenant.plan!.maxMonthlyOperations } }); await db.$disconnect(); }
});

test("el descuento máximo configurado se aplica antes de reservar insumos", async ({ request }) => {
  const initial = await data(request);
  await command(request, "restaurant/promotions", { name: "Límite de descuento", code: "LIMIT10", kind: "PERCENT", value: 10, scope: "ORDER", automatic: false });
  try {
    await command(request, "restaurant/configuration/sales", { ...initial.configuration.sales, maxDiscountPct: 0 }, "PATCH");
    const rejected = await request.post("/api/operations/restaurant/orders", { data: { source: "TAKEAWAY", promotionCode: "LIMIT10", items: [{ productId, quantity: 1 }] } });
    expect(rejected.status(), await rejected.text()).toBe(409);
    await command(request, "restaurant/configuration/sales", { ...initial.configuration.sales, maxDiscountPct: 10 }, "PATCH");
    const created = await order(request, { promotionCode: "LIMIT10" });
    expect((await data(request)).orders.find((row) => row.id === created.id)!.discountCents).toBe(200);
  } finally { await command(request, "restaurant/configuration/sales", initial.configuration.sales, "PATCH"); }
});

test("la sesión solo ofrece la sede asignada y explica su desactivación", async ({ playwright }) => {
  expect(process.env.DATABASE_URL).toBeTruthy();
  const db = new PrismaClient();
  const member = await db.membership.findFirstOrThrow({ where: { tenantId, user: { email: `waiter@${slug}.local` } } });
  const branch = await db.branch.create({ data: { tenantId, name: "Sede de acceso restringido" } });
  const api = await playwright.request.newContext({ baseURL: "http://localhost:3100" });
  try {
    await db.membership.update({ where: { id: member.id }, data: { branchId: branch.id } });
    await login(api, `waiter@${slug}.local`);
    const session = await api.get("/api/auth/session");
    expect(session.status()).toBe(200);
    expect((await session.json()).branches.map((row: { id: string }) => row.id)).toEqual([branch.id]);
    await db.branch.update({ where: { id: branch.id }, data: { active: false } });
    const blocked = await api.post("/api/auth/login", { data: { email: `waiter@${slug}.local`, businessSlug: slug, password: changedPasswords.get(`waiter@${slug}.local`) ?? password } });
    expect(blocked.status(), await blocked.text()).toBe(403);
    expect((await blocked.json()).error.code).toBe("ASSIGNED_BRANCH_INACTIVE");
  } finally {
    await db.membership.update({ where: { id: member.id }, data: { branchId: member.branchId } });
    await api.dispose(); await db.$disconnect();
  }
});

test("el conteo físico conserva reservas y el formulario reutiliza la solicitud tras perder la respuesta", async ({ request, page }) => {
  const initial = await data(request);
  const ingredient = await command(request, "inventory/items", { sku: "COUNT-RESERVED", name: "Insumo reservado para conteo", kind: "INPUT", unit: "UND", openingStock: 10, unitCost: 1 });
  const product = await command(request, "restaurant/products", { name: "Plato para conteo", categoryId: initial.categories[0].id, price: 10, cost: 1 });
  await command(request, `inventory/recipes/${product.id}`, { yieldQuantity: 1, ingredients: [{ itemId: ingredient.id, quantity: 1 }] });
  const created = await order(request, { items: [{ productId: product.id, quantity: 1 }] });
  const stock = async () => { const response = await request.get("/api/data/tenant?section=inventory"); return (await response.json()).data.inventoryModule.items.find((row: { id: string }) => row.id === ingredient.id).stock; };
  expect(await stock()).toBe(9);
  await login(page.request); await page.goto(`/t/${slug}/inventory`);
  const keys: string[] = [];
  await page.route("**/api/operations/inventory/counts", async (route) => {
    keys.push(route.request().postDataJSON().idempotencyKey);
    if (keys.length === 1) { expect((await route.fetch()).status()).toBe(200); await route.abort("failed"); }
    else await route.continue();
  });
  await page.getByRole("button", { name: "Conteo físico", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Conteo físico", exact: true });
  await dialog.getByLabel("Artículo", { exact: true }).selectOption(ingredient.id);
  await dialog.getByLabel("Cantidad", { exact: true }).fill("10");
  await dialog.getByRole("button", { name: "Aplicar conteo" }).click();
  await expect(dialog.locator(".form-error")).toBeVisible();
  expect(await stock()).toBe(9);
  await command(request, "inventory/movements", { itemId: ingredient.id, type: "RESTOCK", quantity: 2 });
  await dialog.getByRole("button", { name: "Aplicar conteo" }).click();
  await expect(dialog).not.toBeVisible();
  expect(keys).toHaveLength(2); expect(keys[1]).toBe(keys[0]); expect(await stock()).toBe(11);
  const queued = (await data(request)).orders.find((row) => row.id === created.id)!;
  await command(request, `restaurant/kitchen/${queued.kitchenTicket!.id}/status`, { status: "PREPARING" }, "PATCH");
  await command(request, "inventory/counts", { lines: [{ itemId: ingredient.id, countedQuantity: 11 }] });
  expect(await stock()).toBe(11);
});

test("conciliación directa de ventas, pagos, caja, recetas y claves foráneas", async ({}, testInfo) => {
  expect(process.env.DATABASE_URL, "Ejecuta esta suite con scripts/run-e2e.mjs y su base aislada").toBeTruthy();
  const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL! } } });
  try {
    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { slug: true, setup: { select: { status: true, completedSteps: true } } } });
    expect(tenant.slug).toBe(slug);
    expect(tenant.setup!.status).toBe("READY");
    const [sales, orders, cashSessions, inventory] = await Promise.all([
      db.sale.findMany({ where: { tenantId }, include: { payments: true } }),
      db.restaurantOrder.findMany({ where: { tenantId }, include: { sale: true, items: true } }),
      db.cashSession.findMany({ where: { tenantId }, include: { movements: true, sales: { include: { payments: true } } } }),
      db.inventoryItem.findMany({ where: { tenantId }, include: { movements: true } }),
    ]);
    for (const sale of sales) expect(sale.payments.reduce((sum, payment) => sum + payment.amountCents, 0), sale.code).toBe(sale.totalCents);
    for (const order of orders) {
      if (order.status === "COMPLETED") expect(order.sale, order.code).not.toBeNull();
      if (order.status !== "CANCELLED") expect(order.items.filter((item) => item.status !== "CANCELLED").reduce((sum, item) => sum + item.totalCents, 0), order.code).toBe(order.subtotalCents);
    }
    for (const cash of cashSessions) {
      const payments = cash.sales.flatMap((sale) => sale.payments).filter((payment) => payment.method === "CASH").reduce((sum, payment) => sum + payment.amountCents, 0);
      const movements = cash.movements.reduce((sum, movement) => sum + (movement.type === "IN" ? movement.amountCents : -movement.amountCents), 0);
      expect(cash.expectedCents, cash.id).toBe(cash.openingCents + payments + movements);
    }
    for (const item of inventory) expect(item.stock, item.sku).toBeCloseTo(item.movements.reduce((sum, movement) => sum + (movement.direction === "IN" ? movement.quantity : -movement.quantity), 0), 6);
    if (process.env.DATABASE_URL!.startsWith("file:")) expect(await db.$queryRawUnsafe("PRAGMA foreign_key_check")).toEqual([]);
    const ledgerPath = testInfo.outputPath("restaurant-ledger.json");
    await writeFile(ledgerPath, JSON.stringify({ tenant: slug, setup: tenant.setup, sales: sales.length, orders: orders.length, cashSessions: cashSessions.map(({ status, openingCents, expectedCents, countedCents }) => ({ status, openingCents, expectedCents, countedCents })), inventory: inventory.map(({ sku, stock }) => ({ sku, stock })), netPaidSalesCents: sales.filter((sale) => sale.status === "PAID").reduce((sum, sale) => sum + sale.totalCents, 0), refundedSalesCents: sales.filter((sale) => sale.status === "REFUNDED").reduce((sum, sale) => sum + sale.totalCents, 0), totalSalesCents: sales.reduce((sum, sale) => sum + sale.totalCents, 0), balanced: true }, null, 2));
    await mkdir("outputs", { recursive: true });
    await copyFile(ledgerPath, "outputs/restaurant-completion-ledger.json");
    await testInfo.attach("restaurant-ledger.json", { contentType: "application/json", path: ledgerPath });
  } finally { await db.$disconnect(); }
});
