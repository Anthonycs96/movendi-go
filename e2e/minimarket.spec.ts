import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
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
async function openCheckout(page: Page) {
  await page.getByRole("button", { name: "Ir a cobrar", exact: true }).filter({ visible: true }).click();
  await expect(page.getByRole("dialog", { name: "Revisar y cobrar" })).toBeVisible();
}
async function enterCode(page: Page, code: string) {
  await page.getByRole("button", { name: "Ingresar código", exact: true }).click();
  await page.getByLabel("Código manual", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Usar código", exact: true }).click();
  await expect(page.getByRole("dialog").getByText(/agregado/)).toBeVisible();
  await page.getByRole("button", { name: /Revisar venta ·/ }).click();
}
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
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const state = window as unknown as { BarcodeDetector: unknown; registrationCode: string; registrationStream: MediaStream };
    state.registrationCode = "";
    state.BarcodeDetector = class {
      static async getSupportedFormats() { return ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"]; }
      async detect() { return state.registrationCode ? [{ rawValue: state.registrationCode }] : []; }
    };
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: async () => {
      const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 480;
      const ctx = canvas.getContext("2d")!; ctx.fillStyle = "white"; ctx.fillRect(0, 0, 640, 480);
      state.registrationStream = canvas.captureStream(5);
      setInterval(() => ctx.fillRect(0, 0, 1, 1), 100);
      return state.registrationStream;
    } });
  });
  await page.goto(`/t/${slug}/catalog`);
  await expect(page.getByLabel("Nombre", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Nuevo producto", exact: true })).toBeInViewport();
  await page.screenshot({ path: info.outputPath("catalog-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Nuevo producto", exact: true }).click();
  const create = page.getByRole("dialog", { name: "Nuevo producto", exact: true });
  await create.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(create.getByRole("heading", { name: "Identifica tu producto" })).toBeVisible();
  await create.getByLabel("Nombre", { exact: true }).fill("Leche entera"); await create.getByLabel("SKU", { exact: true }).fill("LECHE-01");
  await page.screenshot({ path: info.outputPath("product-step-one-mobile.png"), fullPage: true });
  await create.getByRole("button", { name: "Continuar", exact: true }).click();
  await create.getByRole("button", { name: "Atrás", exact: true }).click();
  await expect(create.getByLabel("Nombre", { exact: true })).toHaveValue("Leche entera");
  await create.getByRole("button", { name: "Continuar", exact: true }).click();
  await create.getByLabel("Precio de venta").fill("5");
  await create.getByText("Presentación y venta por peso", { exact: true }).click();
  await expect(create.getByLabel("Unidades base por presentación")).toHaveValue("1");
  await create.getByRole("button", { name: "Leer código con cámara", exact: true }).click();
  const reader = page.getByRole("dialog", { name: "Leer código de barras", exact: true });
  await expect(reader.getByLabel("Vista de la cámara para escanear")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(reader).toHaveCount(0);
  await expect(create).toBeVisible();
  await expect(create.getByLabel("Precio de venta")).toHaveValue("5");
  await create.getByRole("button", { name: "Leer código con cámara", exact: true }).click();
  await expect(reader.getByLabel("Vista de la cámara para escanear")).toBeVisible();
  await expect.poll(() => create.getByLabel("Unidades base por presentación").evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(60);
  await page.screenshot({ path: info.outputPath("product-scanner-mobile.png"), fullPage: true });
  await page.evaluate(() => { (window as unknown as { registrationCode: string }).registrationCode = "7750000000010"; });
  await expect(reader).toHaveCount(0);
  await expect(create.getByLabel("Código de barras")).toHaveValue("7750000000010");
  await expect.poll(() => page.evaluate(() => (window as unknown as { registrationStream: MediaStream }).registrationStream.getTracks().every((track) => track.readyState === "ended"))).toBeTruthy();
  await page.setViewportSize({ width: 320, height: 700 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await expect(create.getByRole("button", { name: "Continuar", exact: true })).toBeInViewport();
  await page.screenshot({ path: info.outputPath("product-price-small-mobile.png"), fullPage: true });
  await create.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(create.getByLabel("Alertar vencimiento con días de anticipación")).toBeDisabled();
  await create.getByLabel("Controlar lotes y vencimientos").check();
  await expect(create.getByLabel("Alertar vencimiento con días de anticipación")).toBeVisible();
  await create.getByLabel("Alertar vencimiento con días de anticipación").fill("-1");
  await create.getByLabel("Controlar lotes y vencimientos").uncheck();
  expect(await create.getByLabel("Alertar vencimiento con días de anticipación").evaluate((element) => (element as HTMLInputElement).checkValidity())).toBe(true);
  await create.getByLabel("Controlar lotes y vencimientos").check();
  await create.getByLabel("Alertar vencimiento con días de anticipación").fill("30");
  await create.getByRole("button", { name: "Crear producto" }).click();
  await expect(create).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("guardados");
  await page.setViewportSize({ width: 1280, height: 800 });
  const p = (await workspace(page.request, "catalog")).products.find((p) => p.sku === "LECHE-01")!;
  await page.goto(`/t/${slug}/purchases`);
  await page.getByRole("button", { name: "Nueva compra", exact: true }).click();
  await page.getByLabel("Proveedor", { exact: true }).fill("Distribuidor local"); await page.getByRole("combobox", { name: "Producto", exact: true }).selectOption(p.id);
  await page.getByLabel(/Cantidad recibida/).fill("10"); await page.getByLabel("Costo por unidad base").fill("3"); await page.getByLabel("Código de lote").fill("LECHE-A"); await page.getByLabel("Vencimiento", { exact: true }).fill("2090-01-01");
  await page.getByRole("button", { name: "Recibir compra" }).click(); await expect(page.getByRole("status")).toContainText("registrada");
  await page.goto(`/t/${slug}/checkout`); await page.getByRole("button", { name: "Abrir caja", exact: true }).click(); await page.getByLabel("Fondo inicial").fill("100"); await page.getByRole("button", { name: "Abrir caja", exact: true }).click(); await expect(page.getByRole("heading", { name: "Caja abierta", exact: true })).toBeVisible();
  await page.goto(`/t/${slug}/pos`); await page.getByRole("button", { name: /Leche entera.*Unidad/ }).click(); await page.getByLabel("Cantidad Leche entera · Unidad").fill("2"); await openCheckout(page); await page.getByLabel(/Efectivo recibido/).fill("20");
  await page.screenshot({ path: info.outputPath("minimarket-pos-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "Cobrar venta" }).click(); await expect(page.getByRole("status")).toContainText("registrada"); await expect(page.getByText(/Vuelto: S\/\s*10/)).toBeVisible();
  await page.goto(`/t/${slug}/sales`); await page.getByRole("button", { name: "Ver ticket" }).first().click(); await expect(page.getByText("Ticket de venta", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Registrar devolución", exact: true }).click();
  await page.getByLabel("Cantidad a devolver").fill("1"); await page.getByLabel("Importe a devolver por el primer método").fill("5"); await page.getByLabel(/Reponer mercadería/).check(); await page.getByLabel(/Motivo \(al menos/).fill("Envase devuelto intacto");
  await page.getByRole("button", { name: "Registrar devolución" }).click(); await expect(page.getByRole("status")).toContainText("registrada");
  const stock = await workspace(page.request, "inventory"); expect(stock.products.find((row) => row.id === p.id)?.stock).toBe(9); expect(stock.products.find((row) => row.id === p.id)?.lots[0].stock).toBe(9);
  await page.goto(`/t/${slug}/reports`); await expect(page.getByText("Ventas netas", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`/t/${slug}/pos`); await expect(page.getByRole("heading", { name: "Punto de venta", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ir a cobrar", exact: true }).filter({ visible: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy(); await page.screenshot({ path: info.outputPath("minimarket-pos-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: /Leche entera.*Unidad/ }).click();
  await expect(page.getByRole("button", { name: "Ir a cobrar", exact: true }).filter({ visible: true })).toBeInViewport();
  await openCheckout(page);
  await expect(page.getByRole("button", { name: "Cobrar venta", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Cobrar venta", exact: true })).toBeInViewport();
  await page.screenshot({ path: info.outputPath("minimarket-checkout-mobile.png"), fullPage: true });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ir a cobrar", exact: true }).filter({ visible: true })).toBeFocused();
  await page.setViewportSize({ width: 1280, height: 800 }); await page.goto(`/t/${slug}/checkout`); await page.getByRole("button", { name: "Cerrar turno", exact: true }).click(); await page.getByLabel("Efectivo contado").fill("105"); await page.getByRole("button", { name: "Cerrar turno" }).click(); await expect(page.getByRole("heading", { name: "Sin turno abierto", exact: true })).toBeVisible();
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
  await page.getByRole("button", { name: "Configurar conexión NubeFact", exact: true }).click();
  await page.getByLabel("Ruta HTTPS de NubeFact").fill("https://api.nubefact.com/api/v1/e2e-never-send");
  await page.getByLabel("Token", { exact: true }).fill("e2e-dummy-no-external-call-token");
  await page.getByRole("button", { name: "Guardar credenciales", exact: true }).click();
  await expect(page.getByText("Credenciales guardadas", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Configurar comprobantes", exact: true }).click();
  await page.getByLabel("Habilitar boletas y facturas").check();
  await page.getByRole("button", { name: "Guardar configuración fiscal" }).click();
  await expect.poll(async () => (await workspace(page.request, "settings")).fiscal.enabled).toBe(true);
  const item = (await workspace(page.request, "catalog")).products[0];
  await page.goto('/t/'+slug+'/catalog');
  await page.getByRole("button", { name: 'Editar '+item.sku, exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Editar '+item.sku, exact: true });
  await edit.getByLabel('Clasificación tributaria').selectOption('GRAVADA');
  await edit.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect.poll(async () => (await workspace(page.request, 'catalog')).products[0].taxCategory).toBe('GRAVADA');
  await page.goto('/t/'+slug+'/clients');
  await page.getByRole('button', { name: 'Nuevo cliente', exact: true }).click();
  await page.getByLabel('Nombre o razón social').fill('Cliente con RUC'); await page.getByLabel('DNI o RUC').fill('20123456789');
  const clientForm = page.getByRole('dialog', { name: 'Nuevo cliente', exact: true });
  await clientForm.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect.poll(async () => (await workspace(page.request, 'clients')).customers.some((c) => c.dni === '20123456789')).toBe(true);
  const cash = await workspace(page.request, 'checkout');
  if (!cash.cash) await command(page.request, 'minimarket/cash', { idempotencyKey: randomUUID(), openingCents: 0 });
  await page.goto('/t/'+slug+'/pos');
  await page.getByRole('button', { name: new RegExp(item.name) }).first().click();
  await openCheckout(page);
  await page.getByText('Cliente y comprobante', { exact: true }).click();
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

 test("móvil: cámara continua sin duplicados, presentación exacta, consulta y conteo", async ({ page }, info) => {
  await login(page.request);
  const barcode = "7751234567894";
  const created = await command(page.request, "minimarket/products", { idempotencyKey: randomUUID(), name: "Galleta cámara", sku: "SCAN-" + Date.now(), presentations: [{ name: "Unidad", barcode: "7751234567887", factor: 1, priceCents: 100 }, { name: "Pack seis", barcode, factor: 6, priceCents: 500 }] });
  await command(page.request, "minimarket/purchases", { idempotencyKey: randomUUID(), supplierName: "Proveedor cámara", lines: [{ productId: created.id, quantity: 30, unitCostCents: 50 }] });
  await page.addInitScript(() => {
    const state = window as unknown as { BarcodeDetector: unknown; scannerCode: string };
    state.scannerCode = "7751234567894";
    state.BarcodeDetector = class {
      static async getSupportedFormats() { return ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"]; }
      async detect() { return state.scannerCode ? [{ rawValue: state.scannerCode }] : []; }
    };
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: async () => { const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 480; const context = canvas.getContext("2d")!; context.fillStyle = "white"; context.fillRect(0, 0, 640, 480); const stream = canvas.captureStream(5); const draw = setInterval(() => context.fillRect(0, 0, 1, 1), 100); stream.getVideoTracks()[0].addEventListener("ended", () => clearInterval(draw)); return stream; } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/t/${slug}/pos`);
  await page.getByRole("button", { name: "Escanear con cámara", exact: true }).click();
  await expect(page.getByLabel("Cantidad Galleta cámara · Pack seis")).toHaveValue("1");
  // Observe continuous frames across the cooldown, then deliberately remove/reintroduce.
  await page.waitForTimeout(1800);
  await expect(page.getByLabel("Cantidad Galleta cámara · Pack seis")).toHaveValue("1");
  await page.evaluate(() => { (window as unknown as { scannerCode: string }).scannerCode = ""; });
  await page.waitForTimeout(800);
  await page.evaluate(() => { (window as unknown as { scannerCode: string }).scannerCode = "7751234567894"; });
  await expect(page.getByLabel("Cantidad Galleta cámara · Pack seis")).toHaveValue("2");
  await expect(page.getByRole("dialog", { name: "Escanear productos" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ir a cobrar", exact: true }).filter({ visible: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Revisar venta ·/ })).toBeInViewport();
  await page.evaluate(() => { (window as unknown as { capturedStream: MediaStream }).capturedStream = document.querySelector("video")!.srcObject as MediaStream; });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await expect(page.getByRole("button", { name: /Revisar venta ·/ })).toBeEnabled();
  await page.screenshot({ path: info.outputPath("mobile-camera-pos.png"), fullPage: true });
  await page.getByRole("button", { name: /Revisar venta ·/ }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { capturedStream: MediaStream }).capturedStream.getTracks().every((track) => track.readyState === "ended"))).toBeTruthy();
  await page.getByRole("combobox", { name: "Medio de pago", exact: true }).selectOption("YAPE");
  await page.getByRole("button", { name: "Cobrar venta", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Operación registrada");
  expect((await workspace(page.request, "inventory")).products.find((p) => p.id === created.id)?.stock).toBe(18);
  await page.goto(`/t/${slug}/inventory`);
  await page.getByRole("button", { name: "Consultar producto por código", exact: true }).click();
  await page.getByRole("region", { name: "Consulta rápida de producto" }).getByLabel("Código manual", { exact: true }).fill(barcode);
  await page.getByRole("region", { name: "Consulta rápida de producto" }).getByRole("button", { name: "Usar código", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Conteo: Galleta cámara", exact: true })).toBeVisible();
  await page.getByLabel("Cantidad física", { exact: true }).fill("16");
  await page.getByLabel("Motivo (al menos 5 caracteres)", { exact: true }).fill("Conteo físico desde móvil");
  await page.getByRole("button", { name: "Agregar al conteo", exact: true }).click();
  expect((await workspace(page.request, "inventory")).products.find((p) => p.id === created.id)?.stock).toBe(18);
  await page.getByRole("button", { name: "Confirmar y finalizar conteo", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("registrada");
  expect((await workspace(page.request, "inventory")).products.find((p) => p.id === created.id)?.stock).toBe(16);
});

test("fallback ZXing decodifica un EAN real sin BarcodeDetector", async ({ page }) => {
  await login(page.request);
  const barcode = "5901234123457";
  await command(page.request, "minimarket/products", { idempotencyKey: randomUUID(), name: "EAN con ZXing", sku: "ZX-" + Date.now(), presentations: [{ name: "Unidad", barcode, factor: 1, priceCents: 200 }] });
  await page.addInitScript(() => {
    Object.defineProperty(window, "BarcodeDetector", { value: undefined, configurable: true });
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: async () => {
      const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 480;
      const ctx = canvas.getContext("2d")!;
      const left = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
      const even = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
      const right = left.map((bits) => bits.replace(/[01]/g, (bit) => bit === "0" ? "1" : "0"));
      const value = "5901234123457", parity = "LGGLLG";
      const bits = "101" + [...value.slice(1, 7)].map((digit, index) => (parity[index] === "L" ? left : even)[Number(digit)]).join("") + "01010" + [...value.slice(7)].map((digit) => right[Number(digit)]).join("") + "101";
      const draw = () => { ctx.fillStyle = "white"; ctx.fillRect(0, 0, 640, 480); ctx.fillStyle = "black"; [...bits].forEach((bit, index) => { if (bit === "1") ctx.fillRect(130 + index * 4, 130, 4, 180); }); };
      draw(); setInterval(draw, 120); return canvas.captureStream(8);
    } });
  });
  await page.goto(`/t/${slug}/pos`);
  await page.getByRole("button", { name: "Escanear con cámara", exact: true }).click();
  await expect(page.getByLabel("Cantidad EAN con ZXing · Unidad")).toHaveValue("1");
  await page.getByRole("button", { name: "Detener cámara", exact: true }).click();
});

test("operación ampliada: transferencia recibida y proveedor con pago parcial desde pantalla", async ({ page }) => {
  await login(page.request);
  const coreResponse = await page.request.get('/api/data/tenant?section=inventory');
  const current = (await coreResponse.json()).data as MinimarketData;
  const primary = current.scope.branchId;
  const branch = await command(page.request, "core/branches", { name: "Destino transferencia" });
  const sku = 'TRANSFER-' + Date.now();
  const product = await command(page.request, "minimarket/products", { idempotencyKey: randomUUID(), name: "Producto transferido", sku, presentations: [{ name: "Unidad", factor: 1, priceCents: 400 }] });
  await command(page.request, "minimarket/purchases", { idempotencyKey: randomUUID(), supplierName: "Origen", lines: [{ productId: product.id, quantity: 10, unitCostCents: 200 }] });
  expect((await page.request.post('/api/auth/branch', { data: { branchId: branch.id } })).status()).toBe(200);
  await command(page.request, "minimarket/products", { idempotencyKey: randomUUID(), name: "Producto transferido", sku, presentations: [{ name: "Unidad", factor: 1, priceCents: 400 }] });
  expect((await page.request.post('/api/auth/branch', { data: { branchId: primary } })).status()).toBe(200);
  const source = (await workspace(page.request, 'catalog')).products.find((p) => p.id === product.id)!;
  await command(page.request, 'minimarket/transfers', { idempotencyKey: randomUUID(), destinationBranchId: branch.id, lines: [{ presentationId: source.presentations[0].id, quantity: 3 }] });
  await page.goto('/t/' + slug + '/inventory');
  await page.getByRole('tab', { name: 'Transferencias', exact: true }).click();
  await page.getByRole('button', { name: 'Revisar transferencia', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar despacho', exact: true }).click();
  await expect(page.getByText('Despachada · En tránsito', { exact: false })).toBeVisible();
  expect((await page.request.post('/api/auth/branch', { data: { branchId: branch.id } })).status()).toBe(200);
  await page.reload();
  await page.getByRole('tab', { name: 'Transferencias', exact: true }).click();
  await page.getByRole('button', { name: 'Revisar transferencia', exact: true }).click();
  await page.getByLabel('Cantidad y lote revisados', { exact: true }).check();
  await page.getByRole('button', { name: 'Confirmar recepción completa', exact: true }).click();
  await expect.poll(async () => (await workspace(page.request, 'inventory')).products[0]?.stock).toBe(3);
  await page.request.post('/api/auth/branch', { data: { branchId: primary } });
  await page.goto('/t/' + slug + '/purchases');
  await page.getByRole('tab', { name: 'Proveedores y deudas', exact: true }).click();
  await page.getByText('Nuevo proveedor', { exact: true }).click();
  await page.getByLabel('Documento del proveedor registrado', { exact: true }).fill('20123456789');
  await page.getByLabel('Razón social / nombre del proveedor', { exact: true }).fill('Proveedor de crédito');
  await page.getByRole('button', { name: 'Guardar proveedor', exact: true }).click();
  await expect.poll(async () => (await workspace(page.request, 'purchases')).suppliers.length).toBe(1);
  await page.getByRole('tab', { name: 'Recepciones', exact: true }).click();
  await page.getByRole('button', { name: 'Nueva compra', exact: true }).click();
  await page.getByRole('combobox', { name: 'Proveedor registrado', exact: true }).selectOption({ label: 'Proveedor de crédito · 20123456789' });
  await page.getByLabel('Compra al crédito', { exact: true }).check();
  await page.getByLabel('Vencimiento de la compra al crédito', { exact: true }).fill('2090-01-01');
  await page.getByRole('combobox', { name: 'Producto', exact: true }).selectOption(product.id);
  await page.getByLabel(/Cantidad recibida/).fill('5'); await page.getByLabel('Costo por unidad base', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Recibir compra', exact: true }).click();
  await page.getByRole('tab', { name: 'Proveedores y deudas', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cuentas por pagar', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Registrar pago al proveedor', exact: true }).click();
  await page.getByLabel('Importe del pago al proveedor', { exact: true }).fill('4');
  await page.getByRole('combobox', { name: 'Medio de pago al proveedor', exact: true }).selectOption('YAPE');
  await page.getByRole('button', { name: 'Registrar pago al proveedor', exact: true }).click();
  await expect.poll(async () => (await workspace(page.request, 'purchases')).payables[0]?.paidCents).toBe(400);
});


test("carrito persistente, promoción y recuperación tras perder respuesta sin duplicar venta", async ({ page, context }) => {
  await login(page.request);
  const code = 'RECOVERY-' + Date.now();
  const p = await command(page.request, 'minimarket/products', { idempotencyKey: randomUUID(), name: 'Producto recuperable', sku: code, presentations: [{ name: 'Unidad', barcode: code, factor: 1, priceCents: 500 }] });
  await command(page.request, 'minimarket/purchases', { idempotencyKey: randomUUID(), supplierName: 'Prueba', lines: [{ productId: p.id, quantity: 10, unitCostCents: 200 }] });
  const product = (await workspace(page.request, 'catalog')).products.find((r) => r.id === p.id)!;
  await command(page.request, 'minimarket/promotions', { idempotencyKey: randomUUID(), name: 'Precio recuperable', kind: 'SPECIAL_PRICE', value: 400, retailProductId: p.id, retailPresentationId: product.presentations[0].id });
  if (!(await workspace(page.request, 'pos')).cash) await command(page.request, 'minimarket/cash', { idempotencyKey: randomUUID(), registerName: 'Recuperación', openingCents: 0 });
  const before = (await workspace(page.request, 'sales')).totalRows;
  await page.goto('/t/' + slug + '/pos');
  await enterCode(page, code);
  await expect(page.getByText(/Precio recuperable: −/)).toBeVisible();
  await page.reload(); await expect(page.getByLabel('Cantidad Producto recuperable · Unidad')).toHaveValue('1'); await openCheckout(page);
  await context.setOffline(true); await expect(page.getByText('Sin conexión', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cobrar venta', exact: true })).toBeDisabled();
  await context.setOffline(false); await expect(page.getByText('Conectado', { exact: true })).toBeVisible();
  await page.route('**/api/operations/minimarket/sales', async (route) => { const response = await route.fetch(); expect(response.status()).toBe(200); await route.abort('failed'); }, { times: 1 });
  await page.getByRole('button', { name: 'Cobrar venta', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Recuperar operación pendiente', exact: true })).toBeEnabled();
  expect((await workspace(page.request, 'sales')).totalRows).toBe(before + 1);
  const secondTab = await context.newPage(); await secondTab.goto('/t/' + slug + '/pos');
  await expect(secondTab.getByRole('button', { name: 'Recuperar operación pendiente', exact: true })).toBeVisible();
  await page.reload(); await page.getByRole('button', { name: 'Recuperar operación pendiente', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Operación registrada');
  await expect(page.getByLabel('Cantidad Producto recuperable · Unidad')).toHaveCount(0);
  expect((await workspace(page.request, 'sales')).totalRows).toBe(before + 1);
  expect((await workspace(page.request, 'catalog')).products.find((r) => r.id === p.id)?.stock).toBe(9);
  await expect(secondTab.getByLabel('Cantidad Producto recuperable · Unidad')).toHaveCount(0); await secondTab.close();
  await enterCode(page, code);
  await page.getByRole('button', { name: 'Cobrar venta', exact: true }).click(); await expect(page.getByLabel('Cantidad Producto recuperable · Unidad')).toHaveCount(0);
  expect((await workspace(page.request, 'sales')).totalRows).toBe(before + 2);
  const wrongContext = await page.request.post('/api/operations/minimarket/cash', { headers: { 'X-Retail-Context': 'otro:ambito:actor' }, data: { idempotencyKey: randomUUID(), openingCents: 0 } }); expect(wrongContext.status()).toBe(409);
  const report = await workspace(page.request, 'reports'); expect(report.report?.byPayment.length).toBeGreaterThan(0);
});

test("importación CSV con vista previa confirma producto y stock juntos", async ({ page }) => {
  await login(page.request); const template = await page.request.get('/api/minimarket/import?format=csv'); expect(template.status()).toBe(200);
  const csv = (await template.text()).replace('EJEMPLO-01', 'IMPORT-' + Date.now()).replace('Producto de ejemplo', 'Importado en pantalla');
  await page.goto('/t/' + slug + '/catalog'); await page.getByRole('tab', { name: 'Importar', exact: true }).click(); await page.getByText('Importar productos desde Excel o CSV', { exact: true }).click();
  await page.getByLabel('Archivo de productos').setInputFiles({ name: 'productos.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.getByRole('heading', { name: 'Vista previa: 1 filas válidas' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar importación completa', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('productos importados');
  expect((await workspace(page.request, 'catalog')).products.some((p) => p.name === 'Importado en pantalla')).toBeTruthy();
});

test("categorías y corrección de códigos desde el catálogo móvil", async ({ page }, info) => {
  await login(page.request);
  await ensureProduct(page.request);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/t/${slug}/catalog`);
  await page.getByRole("tab", { name: "Categorías", exact: true }).click();
  await page.getByRole("button", { name: "Nueva categoría", exact: true }).click();
  await page.getByLabel("Nombre de la categoría", { exact: true }).fill("Snacks E2E");
  await page.getByRole("button", { name: "Crear categoría", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Snacks E2E", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Productos", exact: true }).click();
  await page.getByRole("button", { name: "Nuevo producto", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Nuevo producto", exact: true });
  await dialog.getByLabel("Nombre", { exact: true }).fill("Snack editable");
  await dialog.getByLabel("SKU", { exact: true }).fill("SNACK-EDIT");
  await dialog.getByRole("combobox", { name: "Categoría", exact: true }).selectOption("Snacks E2E");
  await dialog.getByRole("button", { name: "Continuar", exact: true }).click();
  await dialog.getByLabel("Precio de venta", { exact: true }).fill("3.5");
  await dialog.getByRole("button", { name: "Continuar", exact: true }).click();
  await dialog.getByRole("button", { name: "Crear producto", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("combobox", { name: "Filtrar por categoría", exact: true }).selectOption("Snacks E2E");
  const catalog = page.getByRole("region", { name: "Productos y presentaciones" });
  await expect(catalog.getByRole("article")).toHaveCount(1);
  await page.getByRole("button", { name: "Editar SNACK-EDIT", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Editar SNACK-EDIT", exact: true });
  await edit.getByRole("tab", { name: "Presentaciones", exact: true }).click();
  await edit.getByText("Unidad · S/ 3.50", { exact: true }).click();
  await edit.getByLabel("Nombre de presentación", { exact: true }).fill("Bolsa");
  await edit.getByRole("textbox", { name: "Código de barras", exact: true }).fill("SNACK-CORREGIDO");
  await edit.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect.poll(async () => (await workspace(page.request, "catalog")).products.find((p) => p.sku === "SNACK-EDIT")?.presentations[0].barcode).toBe("SNACK-CORREGIDO");
  await edit.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.getByRole("button", { name: "Limpiar filtros", exact: true }).click();
  await page.getByRole("tab", { name: "Categorías", exact: true }).click();
  await page.getByRole("button", { name: "Editar Snacks E2E", exact: true }).click();
  await page.getByLabel("Nombre de la categoría", { exact: true }).fill("Aperitivos E2E");
  await page.getByRole("button", { name: "Guardar categoría", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Aperitivos E2E", exact: true })).toBeVisible();
  expect((await workspace(page.request, "catalog")).products.find((p) => p.sku === "SNACK-EDIT")?.category).toBe("Aperitivos E2E");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("categorias-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Nueva categoría", exact: true }).click();
  await page.getByLabel("Nombre de la categoría", { exact: true }).fill("Categoría vacía");
  await page.getByRole("button", { name: "Crear categoría", exact: true }).click();
  await page.getByRole("button", { name: "Eliminar Categoría vacía", exact: true }).click();
  const deleted = page.waitForResponse((response) => response.url().includes("/api/operations/minimarket/categories/") && response.request().method() === "DELETE");
  await page.getByRole("button", { name: "Confirmar eliminación", exact: true }).click();
  expect((await deleted).status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Categoría vacía", exact: true })).toHaveCount(0);
  await login(page.request, `cashier@${slug}.local`);
  const denied = await page.request.post("/api/operations/minimarket/categories", { data: { idempotencyKey: randomUUID(), name: "Sin permiso" } });
  expect(denied.status()).toBe(403);
});

test("la selección de caja carga el turno elegido y conserva el aislamiento del cajero", async ({ page, browser }) => {
  await login(page.request);
  if (!(await workspace(page.request, "checkout")).cash) await command(page.request, "minimarket/cash", { idempotencyKey: randomUUID(), openingCents: 0 });
  const context = await browser.newContext();
  try {
    const cashier = await context.newPage();
    await login(cashier.request, `cashier@${slug}.local`);
    const cash = await command(cashier.request, "minimarket/cash", { idempotencyKey: randomUUID(), registerName: "Caja de selección", openingCents: 777 });
    await page.goto(`/t/${slug}/checkout`);
    await page.locator("details").filter({ hasText: "Caja de esta operación" }).locator("summary").click();
    await page.getByRole("combobox", { name: "Caja de esta operación", exact: true }).selectOption(cash.session.id);
    await expect(page.getByText("Fondo: S/ 7.77", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`cash=${cash.session.id}`));
    const manager = await workspace(page.request, "checkout");
    expect(manager.cash?.id).not.toBe(cash.session.id);
    const forbidden = await cashier.request.get(`/api/data/tenant?section=checkout&cash=${manager.cash!.id}`);
    expect((await forbidden.json()).data.cash).toBeNull();
  } finally { await context.close(); }
});

test("abrir un negocio sin membresía como superadministrador y mostrar errores específicos", async ({ page, browser }) => {
  await login(page.request, "superadmin@multisaas.local", "nova-studio", "Nexo2026!");
  const email = `global-${slug}@test.local`;
  const globalUser = await command(page.request, "platform/users", { name: "Administrador global", email, password, platformRole: "SUPER_ADMIN" });
  const supportEmail = `support-${slug}@test.local`;
  await command(page.request, "platform/users", { name: "Soporte limitado", email: supportEmail, password, platformRole: "SUPPORT" });
  const context = await browser.newContext();
  const globalPage = await context.newPage();
  try {
    await login(globalPage.request, supportEmail, "nova-studio");
    expect((await globalPage.request.post("/api/auth/tenant", { data: { tenantSlug: slug } })).status()).toBe(403);
    await login(globalPage.request, email, "nova-studio");
    await globalPage.goto("/platform/businesses");
    await globalPage.getByPlaceholder("Buscar por nombre, slug o correo…").fill(slug);
    await globalPage.getByRole("button", { name: "Ver", exact: true }).click();
    await globalPage.getByRole("button", { name: "Abrir negocio", exact: false }).click();
    await expect(globalPage).toHaveURL(`/t/${slug}/dashboard`);
    const session = await globalPage.request.get("/api/auth/session");
    expect((await session.json()).session.tenantSlug).toBe(slug);
    await command(page.request, `platform/users/${globalUser.id}`, { platformRole: "ANALYST", active: true }, "PATCH");
    expect((await globalPage.request.get("/api/auth/session")).status()).toBe(401);
    expect((await globalPage.request.post("/api/auth/login", { data: { email, password: changed.get(email) ?? password, businessSlug: slug } })).status()).toBe(401);
    await login(globalPage.request, `admin@${slug}.local`);
    expect((await globalPage.request.post("/api/auth/tenant", { data: { tenantSlug: "nova-studio" } })).status()).toBe(403);
    await command(page.request, `platform/businesses/${tenantId}`, { status: "SUSPENDED" }, "PATCH");
    await page.goto("/platform/businesses");
    await page.getByPlaceholder("Buscar por nombre, slug o correo…").fill(slug);
    await page.getByRole("button", { name: "Ver", exact: true }).click();
    await page.getByRole("button", { name: "Abrir negocio", exact: false }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText("suspendido o cancelado");
  } finally {
    await command(page.request, `platform/businesses/${tenantId}`, { status: "ACTIVE" }, "PATCH");
    await context.close();
  }
});
