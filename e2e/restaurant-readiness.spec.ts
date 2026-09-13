import { test, expect, type APIRequestContext } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { hash } from "bcryptjs";
import { mkdir, writeFile } from "node:fs/promises";
const db = new PrismaClient();
test.describe.configure({ mode: "serial" });
async function login(api: APIRequestContext, email = "superadmin@multisaas.local", businessSlug = "brasa-norte") {
  const response = await api.post("/api/auth/login", { data: { email, businessSlug, password: "Nexo2026!" } });
  expect(response.status(), await response.text()).toBe(200);
}
async function command(api: APIRequestContext, path: string, data: object, method = "POST") {
  const response = await api.fetch(`/api/operations/${path}`, { method, data });
  expect(response.status(), `${path}: ${await response.text()}`).toBe(200); return response.json();
}
async function context(api: APIRequestContext) {
  const response = await api.get("/api/data/tenant?section=floor"); expect(response.ok()).toBe(true);
  const { data } = await response.json();
  const tenant = await db.tenant.findUniqueOrThrow({ where: { slug: "brasa-norte" } });
  const branch = await db.branch.findFirstOrThrow({ where: { tenantId: tenant.id, active: true } });
  const actor = await db.user.findFirstOrThrow({ where: { email: "superadmin@multisaas.local" } });
  return { data, tenantId: tenant.id, branchId: branch.id, actorId: actor.id };
}
test.afterAll(async () => { await db.$disconnect(); });

test("public discovery and forged browser origins are rejected", async ({ request, page }) => {
  expect((await request.post("/api/auth/lookup-email", { data: { email: "admin@brasa.local" } })).status()).toBe(401);
  expect((await request.post("/api/auth/login", { headers: { origin: "https://untrusted.example" }, data: { email: "admin@brasa.local", password: "Nexo2026!" } })).status()).toBe(403);
  await page.goto("/login"); await page.getByLabel("Correo electrónico").fill("admin@brasa.local");
  await expect(page.getByLabel("Negocio")).toHaveCount(0);
  await page.getByLabel("Contraseña", { exact: true }).fill("Nexo2026!"); await page.getByRole("button", { name: "Entrar al sistema" }).click();
  await expect(page).toHaveURL(/brasa-norte/);
});

test("account limit survives changes of IP headers and business", async ({ request }) => {
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await request.post("/api/auth/login", { headers: { "x-forwarded-for": `198.51.100.${attempt}` }, data: { email: "nonexistent-readiness@example.test", password: "wrong", businessSlug: `business-${attempt}` } });
    expect(response.status()).toBe(attempt < 5 ? 401 : 429);
  }
});

test("password-first selection handles multiple businesses and separate identities", async ({ request, page }) => {
  const restaurant = await db.membership.findFirstOrThrow({ where: { user: { email: "admin@brasa.local" } } });
  const barber = await db.membership.findFirstOrThrow({ where: { user: { email: "admin@nova.local" } } });
  const email = "readiness-multiple@example.test", password = "Multiple-business-2026!";
  const different = await db.user.create({ data: { email, name: "Otra identidad", passwordHash: await hash("Different-password-2026!", 10) } });
  const person = await db.user.create({ data: { email, name: "Responsable dos empresas", passwordHash: await hash(password, 10) } });
  for (const [user, membership] of [[different, restaurant], [person, barber]] as const) await db.membership.create({ data: { userId: user.id, tenantId: membership.tenantId, branchId: membership.branchId, roleId: membership.roleId } });
  const single = await request.post("/api/auth/login", { data: { email, password } });
  expect(single.status(), await single.text()).toBe(200); expect((await single.json()).redirectTo).toContain("nova-studio");
  await db.membership.create({ data: { userId: person.id, tenantId: restaurant.tenantId, branchId: restaurant.branchId, roleId: restaurant.roleId } });
  await page.goto("/login"); await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password); await page.getByRole("button", { name: "Entrar al sistema" }).click();
  await page.getByLabel("Negocio").selectOption("brasa-norte");
  await page.getByRole("button", { name: "Entrar a la empresa" }).click(); await expect(page).toHaveURL(/brasa-norte/);
});

test("kitchen preserves different notes and updates from another device", async ({ page, request }) => {
  await login(page.request); await login(request); const { data } = await context(request);
  const product = data.products.find((item: { active: boolean; productType: string }) => item.active && item.productType === "FOOD");
  await command(request, "restaurant/orders", { source: "TAKEAWAY", items: [{ productId: product.id, quantity: 2, notes: "Sin sal" }] });
  await page.goto("/t/brasa-norte/kitchen"); await page.getByRole("button", { name: "Por producción", exact: true }).click();
  const production = page.getByRole("region", { name: "Producción pendiente" });
  await expect(production).toContainText("Sin sal");
  await page.getByLabel("Área de preparación", { exact: true }).focus();
  await command(request, "restaurant/orders", { source: "TAKEAWAY", items: [{ productId: product.id, quantity: 3, notes: "Extra picante" }] });
  await expect(production).toContainText("Extra picante", { timeout: 12000 });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await mkdir("outputs/restaurant-readiness", { recursive: true }); await page.screenshot({ path: "outputs/restaurant-readiness/kitchen-mobile.png", fullPage: true });
});

test("printing requires confirmation and rejects expired agent leases", async ({ request }) => {
  await login(request); const current = await context(request);
  const printer = await command(request, "restaurant/print-devices", { name: "Readiness browser", connectionType: "BROWSER", paperWidthMm: 80 });
  const job = await db.restaurantPrintJob.create({ data: { tenantId: current.tenantId, branchId: current.branchId, createdById: current.actorId, printerId: printer.id, type: "TEST", payload: '{"items":[]}' } });
  await command(request, `restaurant/print-jobs/${job.id}/claim`, { stationId: "readiness-station" });
  expect((await request.patch(`/api/operations/restaurant/print-jobs/${job.id}/status`, { data: { stationId: "readiness-station", attempt: 1, status: "PRINTED" } })).status()).toBe(400);
  await command(request, `restaurant/print-jobs/${job.id}/status`, { stationId: "readiness-station", attempt: 1, status: "FAILED", error: "Operador canceló" }, "PATCH");
  expect((await db.restaurantPrintJob.findUniqueOrThrow({ where: { id: job.id } })).printedAt).toBeNull();
  const token = "readiness-local-agent-token-1234567890";
  const device = await db.printDevice.create({ data: { tenantId: current.tenantId, branchId: current.branchId, name: "Readiness agent", connectionType: "LOCAL_AGENT", tokenHash: createHash("sha256").update(token).digest("hex") } });
  const expired = await db.restaurantPrintJob.create({ data: { tenantId: current.tenantId, branchId: current.branchId, createdById: current.actorId, printerId: device.id, type: "TEST", payload: "{}", status: "PROCESSING", stationId: `agent:${device.id}`, leaseExpiresAt: new Date(0) } });
  expect((await request.patch(`/api/print-agent/jobs/${expired.id}/status`, { headers: { Authorization: `Bearer ${token}` }, data: { status: "SENT", attempt: 1 } })).status()).toBe(409);
});

test("concurrent redemptions cannot spend the same points; refund restores balance", async ({ request }) => {
  await login(request); const { data, tenantId } = await context(request);
  await command(request, "restaurant/configuration/customers", { ...data.configuration.customers, loyaltyEnabled: true, pointsPerCurrencyUnit: 0, redemptionEnabled: true, pointValueCents: 1, maxRedemptionPct: 50 }, "PATCH");
  await command(request, "restaurant/configuration/sales", { ...data.configuration.sales, requireOpenCash: false, maxDiscountPct: 50 }, "PATCH");
  const customer = await db.customer.create({ data: { tenantId, name: "Canje concurrente", loyaltyPoints: 100 } });
  const product = data.products.find((item: { active: boolean; priceCents: number; productType: string }) => item.active && item.priceCents >= 500 && item.productType === "FOOD");
  const orders = [];
  for (let i = 0; i < 2; i++) orders.push(await command(request, "restaurant/orders", { source: "TAKEAWAY", customerId: customer.id, items: [{ productId: product.id, quantity: 1 }] }));
  const responses = await Promise.all(orders.map((order) => request.post(`/api/operations/restaurant/orders/${order.id}/checkout`, { data: { paymentMethod: "CASH", redeemPoints: 80 } })));
  expect(responses.filter((response) => response.ok())).toHaveLength(1);
  expect((await db.customer.findUniqueOrThrow({ where: { id: customer.id } })).loyaltyPoints).toBe(20);
  const sale = await db.sale.findFirstOrThrow({ where: { customerId: customer.id } });
  expect(sale.loyaltyPointsRedeemed).toBe(80); expect(sale.loyaltyDiscountCents).toBe(80);
  await command(request, `restaurant/sales/${sale.id}/refund`, { reason: "Devolución de prueba del canje", stockDisposition: "WASTE", paymentConfirmed: true });
  expect((await db.customer.findUniqueOrThrow({ where: { id: customer.id } })).loyaltyPoints).toBe(100);
});

test("cashier can redeem points and inspect the movement from the frontend", async ({ page }) => {
  await login(page.request); const current = await context(page.request);
  const customer = await db.customer.create({ data: { tenantId: current.tenantId, name: "Canje desde caja", loyaltyPoints: 100 } });
  const product = current.data.products.find((item: { active: boolean; priceCents: number }) => item.active && item.priceCents >= 500);
  const created = await command(page.request, "restaurant/orders", { source: "TAKEAWAY", customerId: customer.id, items: [{ productId: product.id, quantity: 1 }] });
  const order = await db.restaurantOrder.findUniqueOrThrow({ where: { id: created.id } });
  await page.goto("/t/brasa-norte/checkout");
  await page.locator("#cash-pending-orders").getByRole("row").filter({ hasText: order.code }).getByRole("button", { name: "Cobrar", exact: true }).click();
  const dialog = page.getByRole("dialog"); await dialog.getByLabel("Puntos a canjear").fill("50");
  await dialog.getByLabel("Efectivo recibido (S/)").fill(((order.totalCents - 50) / 100).toFixed(2));
  await dialog.getByRole("button", { name: "Confirmar cobro" }).click(); await expect(dialog).not.toBeVisible();
  expect((await db.sale.findUniqueOrThrow({ where: { orderId: order.id } })).loyaltyPointsRedeemed).toBe(50);
  await page.goto("/t/brasa-norte/clients"); await page.getByRole("row").filter({ hasText: customer.name }).getByRole("button", { name: "Ver ficha" }).click();
  await expect(page.getByRole("dialog")).toContainText("50 canjeados");
});

test("recipe cost snapshot survives changes in ingredient costs", async ({ request }) => {
  await login(request); const current = await context(request);
  const category = current.data.categories.find((item: { active: boolean }) => item.active);
  const product = await db.product.create({ data: { tenantId: current.tenantId, branchId: current.branchId, categoryId: category.id, name: "Costo receta congelado", priceCents: 2000, costCents: 999 } });
  const item = await db.inventoryItem.create({ data: { tenantId: current.tenantId, branchId: current.branchId, sku: "readiness-cost", name: "Insumo costo", unit: "KG", stock: 100, unitCostCents: 200 } });
  await db.productRecipe.create({ data: { productId: product.id, yieldQuantity: 1, ingredients: { create: [{ itemId: item.id, quantity: 2, wastePercent: 10 }] } } });
  const order = await command(request, "restaurant/orders", { source: "TAKEAWAY", items: [{ productId: product.id, quantity: 1 }] });
  expect((await db.orderItem.findFirstOrThrow({ where: { orderId: order.id } })).unitCostCents).toBe(440);
  await db.inventoryItem.update({ where: { id: item.id }, data: { unitCostCents: 400 } });
  expect((await db.orderItem.findFirstOrThrow({ where: { orderId: order.id } })).unitCostCents).toBe(440);
});

test("menu review is transactional and idempotent through the frontend", async ({ request, page }) => {
  await login(request); const current = await context(request);
  const area = current.data.preparationAreas.find((item: { active: boolean }) => item.active) ?? await db.preparationArea.create({ data: { tenantId: current.tenantId, branchId: current.branchId, name: "Importación cocina" } });
  const row = { key: "0-0", page: 1, name: "Plato importado revisado", category: "Importación revisada", description: "Texto revisado", price: 15, kind: "PRODUCT", warning: "", active: false, selected: true, cost: 0 };
  const pdf = await PDFDocument.create(); pdf.addPage(); const pdfBytes = Buffer.from(await pdf.save());
  const job = await db.restaurantMenuImport.create({ data: { tenantId: current.tenantId, branchId: current.branchId, actorId: current.actorId, filename: "fixture.pdf", sourceHash: createHash("sha256").update(pdfBytes).digest("hex"), pageCount: 1, nextPage: 1, status: "REVIEW", rows: JSON.stringify([row]) } });
  expect((await request.post(`/api/restaurant/menu-source?id=${job.id}&index=0&total=1`, { data: pdfBytes })).status()).toBe(200);
  expect((await request.patch(`/api/restaurant/menu-source?id=${job.id}`)).status()).toBe(200);
  const payload = { id: job.id, confirmed: true, areaId: area.id, taxCategory: "GRAVADA", rows: [row] };
  expect((await request.patch("/api/restaurant/menu-import", { data: { ...payload, rows: [row, row] } })).status()).toBe(400);
  expect(await db.product.count({ where: { tenantId: current.tenantId, name: row.name } })).toBe(0);
  await login(page.request); await page.goto("/t/brasa-norte/menu"); await page.getByRole("button", { name: "Importar carta PDF" }).click();
  await page.getByLabel("Borradores guardados").selectOption(job.id);
  await expect(page.getByLabel("Nombre 1", { exact: true })).toHaveValue(row.name);
  await page.getByLabel("Área de preparación para productos nuevos").selectOption(area.id);
  await page.getByLabel("Afectación tributaria de productos nuevos").selectOption("GRAVADA");
  await page.getByRole("checkbox", { name: /Revisé los precios/ }).check();
  await page.getByRole("button", { name: "Importar 1 productos revisados" }).click();
  await expect(page.getByRole("dialog")).toContainText("1 productos importados");
  expect((await request.patch("/api/restaurant/menu-import", { data: payload })).status()).toBe(200);
  expect(await db.product.count({ where: { tenantId: current.tenantId, name: row.name } })).toBe(1);
  await login(request, "superadmin@multisaas.local", "nova-studio");
  expect((await request.get("/api/restaurant/menu-import")).status()).toBe(403);
});

test("measures bounded concurrent reads without claiming production capacity", async ({ request }) => {
  await login(request); const latencies: number[] = [];
  await Promise.all(Array.from({ length: 10 }, async () => { for (let i = 0; i < 3; i++) { const start = performance.now(); const response = await request.get("/api/data/restaurant-revision"); expect(response.ok()).toBe(true); latencies.push(performance.now() - start); } }));
  latencies.sort((a,b) => a-b);
  await mkdir("outputs/restaurant-readiness", { recursive: true });
  await writeFile("outputs/restaurant-readiness/latency.json", JSON.stringify({ scenario: "30 revision reads, concurrency 10, local production build", samples: latencies.length, p50Ms: latencies[14], p95Ms: latencies[28], maxMs: latencies[29] }, null, 2));
});
