import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import type { RestaurantReportsData } from "../apps/frontend/src/modules/restaurant/types";

const db = new PrismaClient();
test.afterAll(async () => db.$disconnect());

async function fixture(page: Page) {
  const actor = await db.user.findFirstOrThrow({ where: { email: "admin@brasa.local", platformRole: null } });
  const base = await db.tenant.findUniqueOrThrow({ where: { slug: "brasa-norte" } });
  const tenant = await db.tenant.create({ data: { slug: `growth-${randomUUID()}`, name: "Restaurante de análisis", shortName: "Análisis", type: "RESTAURANT", timezone: "America/Lima", planId: base.planId, enabledModules: JSON.stringify(["dashboard", "floor", "orders", "settings"]) } });
  const branch = await db.branch.create({ data: { tenantId: tenant.id, name: "Principal" } });
  const role = await db.role.create({ data: { tenantId: tenant.id, key: "MANAGER", name: "Administrador", permissions: '["*"]' } });
  await db.membership.create({ data: { tenantId: tenant.id, branchId: branch.id, userId: actor.id, roleId: role.id } });
  expect((await page.request.post("/api/auth/login", { data: { email: actor.email, password: "Nexo2026!", businessSlug: tenant.slug } })).ok()).toBe(true);
  return { tenant, branch, role, actor };
}

test("administrator sees all eleven sections and can open previously hidden management pages", async ({ page }) => {
  const { tenant } = await fixture(page);
  await page.goto(`/t/${tenant.slug}/dashboard`);
  const sidebar = page.locator(".desktop-sidebar .sidebar__nav");
  await expect(sidebar.getByRole("link")).toHaveCount(11);
  for (const [label, section] of [["Clientes", "clients"], ["Inventario", "inventory"], ["Promociones", "promotions"], ["Reportes", "reports"]]) {
    await sidebar.getByRole("link", { name: new RegExp(label) }).click();
    await expect(page).toHaveURL(new RegExp(`/${section}$`));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const response = await page.request.get(`/api/data/tenant?section=${section}`);
    expect(response.ok(), await response.text()).toBe(true);
  }
});

test("printing permission works without kitchen access, while operational staff cannot open financial reports", async ({ page }) => {
  const { tenant, role } = await fixture(page);
  await db.role.update({ where: { id: role.id }, data: { permissions: '["settings:write","dashboard:read"]' } });
  expect((await page.request.get("/api/operations/restaurant/print-jobs")).status()).toBe(200);
  expect((await page.request.get("/api/data/tenant?section=reports")).status()).toBe(403);
  await page.goto(`/t/${tenant.slug}/settings`);
  await expect(page.getByRole("heading", { name: "Estación de impresión" })).toBeVisible();
  await db.role.update({ where: { id: role.id }, data: { permissions: '["dashboard:read","restaurant:orders:read","restaurant:orders:write"]' } });
  await page.goto(`/t/${tenant.slug}/dashboard`);
  await expect(page.locator(".desktop-sidebar").getByRole("link", { name: /Reportes|Inventario|Promociones/ })).toHaveCount(0);
  expect((await page.request.get("/api/operations/restaurant/print-jobs")).status()).toBe(403);
  expect((await page.request.get("/api/data/tenant?section=reports")).status()).toBe(403);
});

test("growth report reconciles sales, costs, delivery, customer history, refunds and branch scope", async ({ page }) => {
  const { tenant, branch, actor } = await fixture(page);
  const old = new Date(Date.now() - 40 * 86_400_000);
  const current = new Date(Date.now() - 2 * 86_400_000);
  const category = await db.category.create({ data: { tenantId: tenant.id, branchId: branch.id, name: "Carta" } });
  const products = await Promise.all([
    ["Pollo", 1000, 400], ["Bebida", 1000, 900], ["Sin costo", 500, 0], ["Sin movimiento", 800, 300],
  ].map(([name, price, cost]) => db.product.create({ data: { tenantId: tenant.id, branchId: branch.id, categoryId: category.id, name: String(name), priceCents: Number(price), costCents: Number(cost), createdAt: old } })));
  const returning = await db.customer.create({ data: { tenantId: tenant.id, branchId: branch.id, name: "Cliente que regresa" } });
  const acquired = await db.customer.create({ data: { tenantId: tenant.id, branchId: branch.id, name: "Cliente nuevo" } });
  let sequence = 0;
  async function sale(product: typeof products[number], quantity: number, customerId: string | null, source = "DINE_IN", discount = 0, delivery = 0, createdAt = current, status = "PAID") {
    sequence += 1;
    const subtotal = quantity * product.priceCents;
    const total = subtotal - discount + delivery;
    const order = await db.restaurantOrder.create({ data: { tenantId: tenant.id, branchId: branch.id, createdById: actor.id, customerId, source, code: `PED-${sequence}`, status: "COMPLETED", subtotalCents: subtotal, discountCents: discount, deliveryFeeCents: delivery, totalCents: total, createdAt, items: { create: { tenantId: tenant.id, productId: product.id, name: product.name, quantity, unitPriceCents: product.priceCents, unitCostCents: product.costCents, totalCents: subtotal, status: "SERVED" } } } });
    return db.sale.create({ data: { tenantId: tenant.id, branchId: branch.id, orderId: order.id, customerId, code: `VTA-${sequence}`, paymentMethod: "CASH", status, totalCents: total, subtotalCents: subtotal, discountCents: discount, createdAt } });
  }
  await sale(products[0], 1, returning.id, "DINE_IN", 0, 0, old);
  await sale(products[0], 2, returning.id, "DELIVERY", 200, 500);
  await sale(products[1], 1, acquired.id);
  await sale(products[2], 1, null, "TAKEAWAY");
  await sale(products[0], 1, returning.id);
  const refunded = await sale(products[1], 1, null, "DINE_IN", 0, 0, current, "REFUNDED");
  await db.saleRefund.create({ data: { tenantId: tenant.id, branchId: branch.id, saleId: refunded.id, actorId: actor.id, reason: "Prueba", stockDisposition: "RESTOCK", totalCents: 1000, cashCents: 1000, payments: "[]", createdAt: current } });
  await db.restaurantOrder.createMany({ data: [
    { tenantId: tenant.id, branchId: branch.id, createdById: actor.id, code: "PENDIENTE", status: "PLACED", totalCents: 700, createdAt: current },
    { tenantId: tenant.id, branchId: branch.id, createdById: actor.id, code: "ANULADO", status: "CANCELLED", totalCents: 900, createdAt: current },
  ] });
  // A second branch must not alter current customers, cancellations or totals.
  const otherBranch = await db.branch.create({ data: { tenantId: tenant.id, name: "Otra sede" } });
  await db.restaurantOrder.create({ data: { tenantId: tenant.id, branchId: otherBranch.id, createdById: actor.id, code: "OTRA-SEDE", status: "CANCELLED", totalCents: 999999, createdAt: current } });
  const configurationResponse = await page.request.get("/api/data/tenant?section=settings");
  const configuration = (await configurationResponse.json()).data.configuration;
  expect((await page.request.patch("/api/operations/restaurant/configuration/reports", { data: { ...configuration.reports, includeCancelledOrders: false } })).ok()).toBe(true);
  // Preserve the historical sold name even if the current catalog is renamed.
  await db.product.update({ where: { id: products[0].id }, data: { name: "Pollo nuevo nombre" } });
  const response = await page.request.get("/api/data/tenant?section=reports&period=7d");
  expect(response.ok(), await response.text()).toBe(true);
  const reports = (await response.json()).data.reports as RestaurantReportsData;
  expect(reports.metrics).toMatchObject({ salesCents: 4800, costCents: 2100, profitCents: 2700, attentions: 4, itemsSold: 5, averageTicketCents: 1200, cancelledOrders: 1, cancellationRatePct: 14.29, uniqueCustomers: 2, repeatCustomers: 1 });
  expect(reports.growth).toMatchObject({ discountsCents: 200, discountedOrders: 1, subtotalCents: 4500, deliveryFeesCents: 500, refundsCents: 1000, refundsCount: 1, pendingCents: 700, pendingOrders: 1, newCustomers: 1, returningCustomers: 1, repeatCustomerRatePct: 50, customerIdentificationPct: 75, anonymousOrders: 1, unitsPerOrder: 1.25, zeroCostUnits: 1, unsoldProductCount: 1 });
  expect(reports.growth.channels.reduce((sum, channel) => sum + channel.salesCents, 0)).toBe(4800);
  expect(reports.topProducts.reduce((sum, product) => sum + product.salesCents, 0)).toBe(4300);
  expect(reports.growth.profitableProducts.map((product) => product.name)).toEqual(["Pollo", "Bebida"]);
  expect(reports.growth.productsToReview.map((product) => product.name)).toEqual(["Bebida"]);
  expect(new Date(reports.endAt).getTime() - new Date(reports.startAt).getTime()).toBe(new Date(reports.growth.previousEndAt).getTime() - new Date(reports.growth.previousStartAt).getTime());
  await page.goto(`/t/${tenant.slug}/reports?period=7d`);
  await expect(page.getByRole("heading", { name: "Qué mejorar ahora" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Productos que más aportan" })).toBeVisible();
  await mkdir("outputs/restaurant-growth", { recursive: true });
  await page.screenshot({ path: "outputs/restaurant-growth/desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Clientes y frecuencia", exact: true }).click();
  await expect(page.getByText("Nuevos compradores", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Canales y control", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Qué canal impulsa las ventas" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.locator(".growth-report").screenshot({ path: "outputs/restaurant-growth/mobile.png" });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar CSV" }).click();
  const stream = await (await download).createReadStream();
  const chunks: Buffer[] = []; for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const csv = Buffer.concat(chunks).toString("utf8");
  expect(csv).toContain('"Ventas vigentes","48.00"');
  expect(csv).toContain('"Descuentos","2.00"');
  expect(csv).toContain("Clientes que regresaron");
});
