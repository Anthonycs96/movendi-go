import { expect, test, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import type { MinimarketData } from "@movendi/contracts";

const password = "Retail-local-2026!";
const changed = new Map<string, string>();
let slug: string, tenantId: string;
async function login(api: APIRequestContext, email = `admin@${slug}.local`, businessSlug = slug, secret = password) {
  const effective = changed.get(email) ?? secret;
  const response = await api.post("/api/auth/login", { data: { email, businessSlug, password: effective } });
  expect(response.status(), await response.text()).toBe(200);
  if ((await response.json()).redirectTo.startsWith("/change-password")) {
    const next = `${password}-changed`;
    const response = await api.post("/api/auth/change-password", { data: { currentPassword: effective, newPassword: next } });
    expect(response.status(), await response.text()).toBe(200); changed.set(email, next);
  }
}
async function command(api: APIRequestContext, path: string, data: unknown, method = "POST") {
  const response = await api.fetch(`/api/operations/${path}`, { method, data });
  expect(response.status(), `${path}: ${await response.text()}`).toBe(200);
  return response.json();
}
async function workspace(api: APIRequestContext, section: string) { const response = await api.get(`/api/data/tenant?section=${section}`); expect(response.status(), await response.text()).toBe(200); return (await response.json()).data as MinimarketData; }
async function ensureProduct(api: APIRequestContext) {
  if ((await workspace(api, "catalog")).products.length) return;
  const p = await command(api, "minimarket/products", { idempotencyKey: randomUUID(), name: "Producto de prueba", sku: "TEST", presentations: [{ name: "Unidad", factor: 1, priceCents: 500 }] });
  await command(api, "minimarket/purchases", { idempotencyKey: randomUUID(), supplierName: "Proveedor", lines: [{ productId: p.id, quantity: 10, unitCostCents: 200 }] });
}
test.beforeAll(async ({ browser }) => {
  slug = `retail-${Date.now().toString(36)}`;
  const page = await browser.newPage();
  await login(page.request, "superadmin@multisaas.local", "nova-studio", "Nexo2026!");
  await page.goto("/platform/businesses");
  await page.getByRole("button", { name: /Nuevo negocio|Nueva empresa/i }).click();
  await page.getByLabel("Nombre comercial").fill(`Minimarket ${slug}`);
  await page.getByLabel("Nombre corto").fill("Mi mercado");
  await page.getByLabel(/Identificador URL/).fill(slug);
  await page.getByRole("dialog").getByLabel("Rubro").selectOption("MINIMARKET");
  await page.getByLabel("Primera sede").fill("Principal");
  await page.getByLabel("Administrador", { exact: true }).fill("Administrador retail");
  await page.getByLabel("Correo del administrador").fill(`admin@${slug}.local`);
  await page.getByLabel(/Clave temporal/).fill(password);
  const created = page.waitForResponse((response) => response.url().endsWith("/api/operations/platform/tenants") && response.request().method() === "POST");
  await page.getByRole("button", { name: /Crear y continuar/i }).click();
  const response = await created; expect(response.status(), await response.text()).toBe(200); tenantId = (await response.json()).id;
  const setup = (payload: unknown) => command(page.request, `platform/onboarding/${tenantId}`, payload, "PATCH");
  await setup({ step: "BUSINESS", name: `Minimarket ${slug}`, shortName: "Mi mercado", branchName: "Principal", email: "", country: "PE", currency: "PEN", timezone: "America/Lima" });
  await setup({ step: "MODULES", enabledModules: ["dashboard", "pos", "catalog", "inventory", "purchases", "sales", "checkout", "clients", "reports", "settings"] });
  await setup({ step: "CATALOG", skip: true });
  await setup({ step: "TEAM", users: [{ name: "Cajero", email: `cashier@${slug}.local`, roleKey: "RETAIL_CASHIER", password }] });
  await setup({ step: "OPERATIONS", paymentMethods: ["CASH", "CARD", "YAPE"], hours: Array.from({ length: 7 }, (_, weekday) => ({ weekday, open: "08:00", close: "22:00", closed: false })) });
  await setup({ step: "REVIEW", ready: true });
  await page.close();
});

test("jornada completa en pantalla: catálogo, compra con lote, caja, cobro, ticket, devolución y cierre", async ({ page }, info) => {
  await login(page.request);
  await page.goto(`/t/${slug}/catalog`);
  const create = page.locator("form").filter({ has: page.getByRole("heading", { name: "Nuevo producto" }) });
  await create.getByLabel("Nombre", { exact: true }).fill("Leche entera"); await create.getByLabel("SKU", { exact: true }).fill("LECHE-01");
  await create.getByLabel("Controlar lotes y vencimientos").check(); await create.getByLabel("Código de barras").fill("7750000000010");
  await create.getByLabel("Precio de venta").fill("5");
  await create.getByRole("button", { name: "Crear producto" }).click();
  await expect(page.getByRole("status")).toContainText("guardados");
  const p = (await workspace(page.request, "catalog")).products.find((p) => p.sku === "LECHE-01")!;
  await page.goto(`/t/${slug}/purchases`);
  await page.getByLabel("Proveedor", { exact: true }).fill("Distribuidor local"); await page.getByRole("combobox", { name: "Producto", exact: true }).selectOption(p.id);
  await page.getByLabel(/Cantidad recibida/).fill("10"); await page.getByLabel("Costo por unidad base").fill("3"); await page.getByLabel("Código de lote").fill("LECHE-A"); await page.getByLabel("Vencimiento").fill("2090-01-01");
  await page.getByRole("button", { name: "Recibir compra" }).click(); await expect(page.getByRole("status")).toContainText("registrada");
  await page.goto(`/t/${slug}/checkout`); await page.getByLabel("Fondo inicial").fill("100"); await page.getByRole("button", { name: "Abrir caja", exact: true }).click(); await expect(page.getByRole("heading", { name: "Arqueo de caja" })).toBeVisible();
  await page.goto(`/t/${slug}/pos`); await page.getByRole("button", { name: /Leche entera.*Unidad/ }).click(); await page.getByLabel("Cantidad Leche entera · Unidad").fill("2"); await page.getByLabel(/Efectivo recibido/).fill("20");
  await page.screenshot({ path: info.outputPath("minimarket-pos-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "Cobrar venta" }).click(); await expect(page.getByRole("status")).toContainText("registrada"); await expect(page.getByText(/Vuelto: S\/\s*10/)).toBeVisible();
  await page.goto(`/t/${slug}/sales`); await page.getByRole("button", { name: "Ver ticket" }).first().click(); await expect(page.getByText("Ticket de venta", { exact: true })).toBeVisible();
  await page.getByLabel("Cantidad a devolver").fill("1"); await page.getByLabel("Importe a devolver por el primer método").fill("5"); await page.getByLabel(/Reponer mercadería/).check(); await page.getByLabel(/Motivo \(al menos/).fill("Envase devuelto intacto");
  await page.getByRole("button", { name: "Registrar devolución" }).click(); await expect(page.getByRole("status")).toContainText("registrada");
  const stock = await workspace(page.request, "inventory"); expect(stock.products.find((row) => row.id === p.id)?.stock).toBe(9); expect(stock.products.find((row) => row.id === p.id)?.lots[0].stock).toBe(9);
  await page.goto(`/t/${slug}/reports`); await expect(page.getByText("Ventas netas", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`/t/${slug}/pos`); await expect(page.getByRole("heading", { name: "Venta actual" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cobrar venta" })).toBeDisabled();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy(); await page.screenshot({ path: info.outputPath("minimarket-pos-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 800 }); await page.goto(`/t/${slug}/checkout`); await page.getByLabel("Efectivo contado").fill("105"); await page.getByRole("button", { name: "Cerrar turno" }).click(); await expect(page.getByRole("heading", { name: "Abrir turno" })).toBeVisible();
});

test("cajero: permisos, sede asignada y accesos indirectos protegidos", async ({ request, playwright }) => {
  await login(request);
  await ensureProduct(request);
  const branch = await command(request, "core/branches", { name: "Segunda sucursal" });
  const cashier = await playwright.request.newContext({ baseURL: "http://localhost:3100" });
  await login(cashier, `cashier@${slug}.local`);
  expect((await cashier.get("/api/data/tenant?section=pos")).status()).toBe(200);
  for (const section of ["reports", "catalog", "settings", "inventory"]) expect((await cashier.get(`/api/data/tenant?section=${section}`)).status()).toBe(403);
  expect((await cashier.post("/api/auth/branch", { data: { branchId: branch.id } })).status()).toBe(403);
  expect((await cashier.post("/api/operations/restaurant/cash", { data: {} })).status()).toBe(403);
  expect((await request.post("/api/operations/inventory/items", { data: {} })).status()).toBe(409);
  expect((await cashier.get("/api/notifications")).status()).toBe(200);
  const pos = await workspace(cashier, "pos"); expect(pos.products[0].unitCostCents).toBeNull(); expect(pos.summary).toBeNull();
  expect((await cashier.post("/api/operations/minimarket/fiscal/credentials", { data: {} })).status()).toBe(403);
  await cashier.dispose();
});

test("API: idempotencia y venta sin existencias no dejan efectos", async ({ request }) => {
  await login(request);
  await ensureProduct(request);
  const cash = await command(request, "minimarket/cash", { openingCents: 0, idempotencyKey: randomUUID() });
  const p = (await workspace(request, "pos")).products[0];
  const body = { idempotencyKey: randomUUID(), cashSessionId: cash.session.id, payments: [{ method: "CARD", amountCents: 500 }], lines: [{ presentationId: p.presentations[0].id, quantity: 1 }] };
  const first = await command(request, "minimarket/sales", body); const replay = await command(request, "minimarket/sales", body); expect(replay.id).toBe(first.id);
  const invalid = await request.post("/api/operations/minimarket/sales", { data: { ...body, payments: [{ method: "CARD", amountCents: 600 }] } }); expect(invalid.status()).toBe(409);
  const before = (await workspace(request, "inventory")).products[0].stock;
  const unavailable = await request.post("/api/operations/minimarket/sales", { data: { ...body, idempotencyKey: randomUUID(), lines: [{ presentationId: p.presentations[0].id, quantity: 999 }], payments: [{ method: "CARD", amountCents: 499500 }] } }); expect(unavailable.status()).toBe(409);
  expect((await workspace(request, "inventory")).products[0].stock).toBe(before);
});


test("fiscal en pantalla: configuración, clasificación, comprador y factura en cola sin cobro duplicado", async ({ page }, info) => {
  await login(page.request); await ensureProduct(page.request);
  await page.goto('/t/'+slug+'/settings');
  await page.getByLabel("Ruta HTTPS de NubeFact").fill("https://api.nubefact.com/api/v1/e2e-never-send");
  await page.getByLabel("Token", { exact: true }).fill("e2e-dummy-no-external-call-token");
  await page.getByRole("button", { name: "Guardar credenciales", exact: true }).click();
  await expect(page.getByText("Credenciales guardadas", { exact: false })).toBeVisible();
  await page.getByLabel("Habilitar boletas y facturas").check();
  await page.getByRole("button", { name: "Guardar configuración fiscal" }).click();
  await expect.poll(async () => (await workspace(page.request, "settings")).fiscal.enabled).toBe(true);
  const item = (await workspace(page.request, "catalog")).products[0];
  await page.goto('/t/'+slug+'/catalog');
  await page.getByRole("button", { name: 'Editar '+item.sku, exact: true }).click();
  const edit = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Editar '+item.sku, exact: true }) });
  await edit.getByLabel('Clasificación tributaria').selectOption('GRAVADA');
  await edit.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect.poll(async () => (await workspace(page.request, 'catalog')).products[0].taxCategory).toBe('GRAVADA');
  await page.goto('/t/'+slug+'/clients');
  await page.getByLabel('Nombre o razón social').fill('Cliente con RUC'); await page.getByLabel('DNI o RUC').fill('20123456789');
  const clientForm = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Nuevo cliente', exact: true }) });
  await clientForm.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect.poll(async () => (await workspace(page.request, 'clients')).customers.some((c) => c.dni === '20123456789')).toBe(true);
  const cash = await workspace(page.request, 'checkout');
  if (!cash.cash) await command(page.request, 'minimarket/cash', { idempotencyKey: randomUUID(), openingCents: 0 });
  await page.goto('/t/'+slug+'/pos');
  await page.getByRole('button', { name: new RegExp(item.name) }).first().click();
  await page.getByRole('combobox', { name: 'Comprobante', exact: true }).selectOption('FACTURA');
  await page.getByRole('combobox', { name: 'Cliente', exact: true }).selectOption({ label: 'Cliente con RUC · 20123456789' });
  await page.getByRole('button', { name: 'Cobrar venta', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('registrada');
  const sales = await workspace(page.request, 'sales'); const fiscal = sales.sales.find((sale) => sale.fiscalJobs.length);
  expect(fiscal).toBeTruthy(); expect(fiscal!.fiscalJobs[0].status).toBe('PENDING'); expect(fiscal!.fiscalJobs[0].kind).toBe('FACTURA');
  await page.goto('/t/'+slug+'/sales'); await page.getByRole('button', { name: 'Ver ticket' }).first().click();
  await expect(page.getByText('En cola · Pruebas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Consultar / reenviar' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('minimarket-fiscal-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({ path: info.outputPath('minimarket-fiscal-mobile.png'), fullPage: true });
});
