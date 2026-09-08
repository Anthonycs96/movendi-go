import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

// All business writes in this suite are made by the application's own UI.
const slug = `ui-${Date.now().toString(36)}`;
const temporaryPassword = "Frontend-2026!Audit";
const finalPassword = "Frontend-2026!Changed";
const rotated = new Set<string>();
const product = "Plato desde interfaz";
const ingredient = "Insumo desde interfaz";
const runtimeErrors: string[] = [];

async function login(page: Page, role = "admin") {
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 500) runtimeErrors.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  await page.goto("/login");
  const platform = role === "superadmin";
  await page.getByLabel(/Correo electrónico/i).fill(platform ? "superadmin@multisaas.local" : `${role}@${slug}.local`);
  if (!platform) await page.getByLabel(/^Negocio$/i).fill(slug);
  await page.getByLabel(/^Contraseña$/i).fill(platform ? "Nexo2026!" : rotated.has(role) ? finalPassword : temporaryPassword);
  await page.getByRole("button", { name: "Entrar al sistema" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
  if (page.url().includes("/change-password")) {
    await page.getByLabel("Contraseña temporal").fill(temporaryPassword);
    await page.getByLabel(/^Nueva contraseña$/).fill(finalPassword);
    await page.getByLabel(/^Confirmar nueva contraseña$/).fill(finalPassword);
    await page.getByRole("button", { name: "Guardar y continuar" }).click();
    rotated.add(role);
  }
  await expect(page).toHaveURL(platform ? /\/platform\/dashboard$/ : new RegExp(`/t/${slug}/`));
}

async function navigate(page: Page, section: string) {
  const link = page.locator(`.sidebar a[href="/t/${slug}/${section}"]:visible`);
  if (!await link.isVisible()) await page.getByRole("button", { name: "Abrir navegación", exact: true }).click();
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/t/${slug}/${section}$`));
  await expect(page.locator("h1")).toBeVisible();
}

async function capture(page: Page, info: TestInfo, name: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `${name}: no horizontal page overflow`).toBe(true);
  await mkdir("outputs/restaurant-completion-ui", { recursive: true });
  const path = resolve("outputs/restaurant-completion-ui", `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await info.attach(name, { path, contentType: "image/png" });
}

async function openCash(page: Page, amount: string) {
  await navigate(page, "checkout");
  await page.getByRole("button", { name: "Abrir caja", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Abrir caja" });
  await dialog.getByLabel("Monto inicial (S/)").fill(amount);
  await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("Caja abierta", { exact: true })).toBeVisible();
}

test.use({ actionTimeout: 15_000 });

test.describe.serial("Restaurante operable exclusivamente desde frontend", () => {
  test.beforeEach(() => { runtimeErrors.length = 0; });
  test.afterEach(() => { expect(runtimeErrors, "Sin errores JavaScript ni respuestas 5xx").toEqual([]); });
  test("alta nueva y 13 etapas, carta, mesas y tres usuarios sin llamadas API manuales", async ({ page }, info) => {
    test.setTimeout(180_000);
    await login(page, "superadmin");
    await page.getByRole("link", { name: /Empresas|Negocios/ }).first().click();
    await page.getByRole("button", { name: /Nuevo negocio|Nueva empresa/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nombre comercial").fill("Restaurante operado desde frontend");
    await dialog.getByLabel("Nombre corto").fill("Prueba interfaz");
    await dialog.getByLabel(/Identificador URL/).fill(slug);
    await dialog.getByLabel("Rubro").selectOption("RESTAURANT");
    await dialog.getByLabel("Primera sede").fill("Salón principal");
    await dialog.getByLabel("Administrador", { exact: true }).fill("Administración interfaz");
    await dialog.getByLabel("Correo del administrador").fill(`admin@${slug}.local`);
    await dialog.getByLabel(/Clave temporal/).fill(temporaryPassword);
    await dialog.getByRole("button", { name: /Crear y continuar/ }).click();
    const next = dialog.getByRole("button", { name: "Guardar y continuar", exact: true });
    await next.click();
    await expect(dialog.getByRole("heading", { name: "Módulos", exact: true })).toBeVisible();
    for (const label of ["Inventario", "Clientes", "Promociones", "Reportes"]) {
      const checkbox = dialog.getByRole("checkbox", { name: label, exact: true });
      if (!await checkbox.isChecked()) await dialog.locator(".setup-module-grid label").filter({ hasText: new RegExp(`^${label}$`) }).click();
      await expect(checkbox).toBeChecked();
    }
    for (const heading of ["Operación", "Áreas y horarios", "Carta"]) {
      await next.click();
      await expect(dialog.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    }
    await dialog.getByRole("checkbox", { name: /Completar esta información después/ }).uncheck();
    const categories = dialog.getByRole("region", { name: "2. Categorías" });
    if (await categories.getByLabel("Categoría", { exact: true }).count() === 0) await categories.getByRole("button", { name: "Agregar categoría" }).click();
    await categories.getByLabel("Categoría", { exact: true }).first().fill("Platos UI");
    await categories.getByLabel("Área operativa").first().selectOption({ index: 1 });
    const products = dialog.getByRole("region", { name: "3. Productos y precios" });
    if (await products.getByLabel("Producto", { exact: true }).count() === 0) await products.getByRole("button", { name: "Agregar producto" }).click();
    await products.getByLabel("Producto", { exact: true }).first().fill(product);
    await products.getByLabel("Categoría").first().selectOption({ label: "Platos UI" });
    await products.getByLabel("Precio").first().fill("20");
    await products.getByLabel("Costo").first().fill("8");
    await next.click();
    await expect(dialog.getByRole("heading", { name: "Usuarios y roles", exact: true })).toBeVisible();
    for (const [index, role] of ["WAITER", "KITCHEN", "CASHIER"].entries()) {
      if (index) await dialog.getByRole("button", { name: "Agregar usuario", exact: true }).click();
      await dialog.locator(".setup-data-row").nth(index).getByLabel("Nombre", { exact: true }).fill(`Usuario ${role}`);
      await dialog.getByLabel("Correo", { exact: true }).nth(index).fill(`${role.toLowerCase()}@${slug}.local`);
      await dialog.getByLabel("Función del usuario").nth(index).selectOption(role);
      await dialog.getByLabel("Contraseña temporal (opcional)").nth(index).fill(temporaryPassword);
    }
    await next.click();
    await dialog.getByRole("checkbox", { name: /El negocio no usará mesas/ }).uncheck();
    const zones = dialog.getByRole("region", { name: "Zonas y mesas" });
    if (await zones.getByLabel("Zona", { exact: true }).count() === 0) await zones.getByRole("button", { name: "Agregar zona" }).click();
    await zones.getByLabel("Zona", { exact: true }).first().fill("Salón UI");
    await zones.getByLabel("Prefijo").first().fill("Mesa UI");
    await zones.getByLabel("Cantidad").first().fill("3");
    await zones.getByLabel("Asientos").first().fill("4");
    for (const heading of ["Cocina", "Caja y promociones", "Reglas por módulo", "Impresión"]) {
      await next.click();
      await expect(dialog.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    }
    await dialog.getByRole("checkbox", { name: /Configurar impresión más adelante/ }).check();
    for (const heading of ["Integraciones", "Validación final"]) {
      await next.click();
      await expect(dialog.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    }
    await dialog.getByRole("button", { name: /Marcar listo para operar/ }).click();
    await expect(dialog.getByText("Negocio marcado como listo para operar.")).toBeVisible();
    await capture(page, info, "01-alta-finalizada");
  });

  test("administrador crea insumo, receta y compra desde formularios", async ({ page }, info) => {
    await login(page);
    await navigate(page, "inventory");
    await page.getByRole("button", { name: "Nuevo artículo", exact: true }).click();
    let dialog = page.getByRole("dialog", { name: "Nuevo artículo" });
    await dialog.getByLabel("Código / SKU").fill("UI-INSUMO");
    await dialog.getByLabel("Nombre", { exact: true }).fill(ingredient);
    await dialog.getByLabel("Unidad de medida").fill("KG");
    await dialog.getByLabel("Stock inicial").fill("100");
    await dialog.getByLabel("Costo unitario", { exact: true }).fill("8");
    await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: ingredient })).toContainText("100 KG");
    await page.getByRole("button", { name: "Configurar receta", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Receta o composición" });
    await dialog.getByLabel("Producto vendido").selectOption({ label: product });
    await dialog.getByLabel("Artículo", { exact: true }).selectOption({ label: `UI-INSUMO · ${ingredient} · 100 KG` });
    await dialog.getByLabel("Cantidad", { exact: true }).fill("1");
    await dialog.getByRole("button", { name: "Guardar receta" }).click();
    await expect(dialog).not.toBeVisible();
    await page.getByRole("button", { name: "Registrar compra", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Nueva compra" });
    await dialog.getByLabel("Proveedor", { exact: true }).fill("Proveedor UI");
    await dialog.getByLabel("Artículo", { exact: true }).selectOption({ label: `UI-INSUMO · ${ingredient} · 100 KG` });
    await dialog.getByLabel("Cantidad", { exact: true }).fill("10");
    await dialog.getByLabel("Costo unitario", { exact: true }).fill("8");
    await dialog.getByRole("button", { name: "Registrar compra", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: ingredient })).toContainText("110 KG");
    await capture(page, info, "02-inventario-configurado");
  });

  test("mesero toma pedido, cocina lo prepara y cajero cobra y cierra caja", async ({ page, browser }, info) => {
    test.setTimeout(150_000);
    await login(page, "waiter");
    await navigate(page, "clients");
    await expect(page.getByRole("button", { name: "Nuevo cliente", exact: true })).toHaveCount(0);
    await navigate(page, "menu");
    await expect(page.getByRole("button", { name: /Nuevo producto|^Categoría$|Editar/ })).toHaveCount(0);
    await navigate(page, "floor");
    await page.locator(".floor-table").filter({ hasText: "Mesa UI 1" }).locator(".floor-table__select").click();
    const catalog = page.getByRole("region", { name: "Productos disponibles" });
    await catalog.getByLabel(`Agregar ${product}`).click();
    await catalog.getByLabel(`Agregar ${product}`).click();
    await page.getByPlaceholder("Ej. sin cebolla, término medio").fill("Sin sal, pedido UI");
    await page.getByRole("button", { name: /^Enviar a cocina/ }).click();
    await expect(page.getByText("Pedido guardado y enviado a cocina.")).toBeVisible();
    await page.locator(".floor-table").filter({ hasText: "Mesa UI 1" }).locator(".floor-table__select").click();
    await expect(page.getByText("El cobro de este pedido lo realiza caja.")).toBeVisible();
    await expect(page.getByRole("button", { name: /Cobrar|Nuevo cliente/ })).toHaveCount(0);
    await navigate(page, "orders");
    await expect(page.getByRole("button", { name: "Cobrar", exact: true })).toHaveCount(0);
    await capture(page, info, "03-pedido-mesero");

    const kitchen = await browser.newPage();
    const cashier = await browser.newPage();
    try {
      await login(kitchen, "kitchen");
      await expect(kitchen.getByRole("link", { name: "Nuevo pedido" })).toHaveCount(0);
      await navigate(kitchen, "kitchen");
      const ticket = kitchen.locator(".kitchen-ticket").filter({ hasText: "Mesa UI 1" });
      await expect(ticket).toContainText("Sin sal, pedido UI");
      await ticket.getByRole("button", { name: "Iniciar preparación" }).click();
      await ticket.getByRole("button", { name: "Marcar listo" }).click();
      await expect(ticket.getByRole("button", { name: "Entregado", exact: true })).toBeVisible();
      await capture(kitchen, info, "04-cocina-lista");
      await ticket.getByRole("button", { name: "Entregado", exact: true }).click();
      await expect(ticket).not.toBeVisible();

      await login(cashier, "cashier");
      await expect(cashier.getByRole("link", { name: "Nuevo pedido" })).toHaveCount(0);
      await openCash(cashier, "100");
      await expect(cashier.getByRole("button", { name: "Retiro", exact: true })).toHaveCount(0);
      await navigate(cashier, "orders");
      const row = cashier.getByRole("row").filter({ hasText: "Mesa UI 1" });
      await row.getByRole("button", { name: "Cobrar", exact: true }).click();
      const dialog = cashier.getByRole("dialog", { name: /Cobrar PED-/ });
      await expect(dialog).toContainText("40.00");
      await dialog.getByLabel("Medio de pago").selectOption("CASH");
      await dialog.getByRole("button", { name: "Confirmar cobro" }).click();
      await expect(row).toContainText("Pagado");
      await navigate(cashier, "checkout");
      await expect(cashier.locator(".stat-card").filter({ hasText: "Caja esperada" })).toContainText("140.00");
      await cashier.getByRole("button", { name: "Cerrar caja", exact: true }).click();
      await cashier.getByRole("dialog", { name: "Cerrar caja" }).getByRole("button", { name: "Confirmar cierre" }).click();
      await expect(cashier.getByRole("button", { name: "Abrir caja", exact: true })).toBeVisible();
      await expect(cashier.getByText(/Caja cerrada\. Diferencia: S\/ 0\.00/)).toBeVisible();
      await capture(cashier, info, "05-caja-cerrada");
    } finally { await kitchen.close(); await cashier.close(); }
    await navigate(page, "floor");
    await page.locator(".floor-table").filter({ hasText: "Mesa UI 1" }).getByRole("button", { name: "Marcar limpia" }).click();
    await expect(page.locator(".floor-table").filter({ hasText: "Mesa UI 1" })).toContainText("Libre");
  });

  test("móvil: formulario recuperable, navegación y pedido con carrito", async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
    await navigate(page, "clients");
    await page.getByRole("button", { name: "Nuevo cliente", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Nuevo cliente" });
    await dialog.getByLabel("Nombre", { exact: true }).fill("A");
    await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(dialog.locator(".form-error")).toBeVisible();
    await expect(dialog.getByLabel("Nombre", { exact: true })).toHaveValue("A");
    await expect(dialog.getByLabel("Nombre", { exact: true })).toHaveAttribute("aria-invalid", "true");
    await expect(dialog.getByLabel("Nombre", { exact: true })).toBeFocused();
    await capture(page, info, "06-error-formulario-movil");
    await dialog.getByLabel("Nombre", { exact: true }).fill("Cliente desde móvil");
    await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Nuevo cliente", exact: true })).toBeFocused();
    await page.getByRole("button", { name: "Nuevo cliente", exact: true }).click();
    await dialog.press("Escape");
    await expect(dialog).not.toBeVisible();
    await navigate(page, "floor");
    await page.locator(".floor-table").filter({ hasText: "Mesa UI 2" }).locator(".floor-table__select").click();
    await page.getByRole("region", { name: "Productos disponibles" }).getByLabel(`Agregar ${product}`).click();
    await page.locator(".mobile-order-trigger").click();
    const cart = page.locator(".current-order--modal");
    await expect(cart).toContainText("20.00");
    await capture(page, info, "07-carrito-movil");
    await cart.getByRole("button", { name: /^Enviar a cocina/ }).click();
    await expect(page.getByText("Pedido guardado y enviado a cocina.")).toBeVisible();
    await navigate(page, "orders");
    const row = page.getByRole("row").filter({ hasText: "Mesa UI 2" });
    await expect(row).toContainText("20.00");
    await capture(page, info, "08-pedido-movil-registrado");
  });

  test("reportes, exportación y consumo de stock visibles desde frontend", async ({ page }, info) => {
    await login(page);
    await navigate(page, "inventory");
    await expect(page.getByRole("row").filter({ hasText: ingredient })).toContainText("107 KG");
    await navigate(page, "reports");
    await expect(page.locator(".stat-card").filter({ hasText: "Ventas totales" })).toContainText("40.00");
    await expect(page.locator(".report-panel").filter({ hasText: "Productos más vendidos" })).toContainText(product);
    await expect(page.locator(".report-trend__column")).toHaveCount(30);
    const today = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "short" }).format(new Date()).replace(".", "");
    await expect(page.locator(".report-trend__column").last()).toHaveAttribute("title", `${today}: S/ 40.00 · 1 ventas`);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exportar CSV" }).click();
    await expect((await download).suggestedFilename()).toMatch(/reporte-restaurante/);
    await capture(page, info, "09-reportes-desktop");
    await page.getByRole("link", { name: "7 días", exact: true }).click();
    await expect(page).toHaveURL(/period=7d$/);
    await expect(page.locator(".report-trend__column")).toHaveCount(7);
    await page.setViewportSize({ width: 768, height: 1024 });
    await capture(page, info, "10-reportes-tablet");
    await openCash(page, "100");
    await page.getByRole("button", { name: "Retiro", exact: true }).click();
    const withdrawal = page.getByRole("dialog", { name: "Retiro de efectivo" });
    await withdrawal.getByLabel("Monto (S/)").fill("10");
    await withdrawal.getByLabel("Motivo").fill("Retiro autorizado desde interfaz");
    await withdrawal.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(withdrawal).not.toBeVisible();
    await expect(page.locator(".stat-card").filter({ hasText: "Caja esperada" })).toContainText("90.00");
    await page.getByRole("button", { name: "Cerrar caja", exact: true }).click();
    await page.getByRole("dialog", { name: "Cerrar caja" }).getByRole("button", { name: "Confirmar cierre" }).click();
    await expect(page.getByText(/Caja cerrada\. Diferencia: S\/ 0\.00/)).toBeVisible();
  });
  test("devolución total e historial de cierres desde la interfaz", async ({ page }, info) => {
    await login(page);
    await openCash(page, "100");
    await page.getByRole("button", { name: "Devolver venta", exact: true }).first().click();
    const dialog = page.getByRole("dialog", { name: "Devolución total", exact: true });
    await dialog.getByLabel("Motivo", { exact: true }).fill("Devolución total solicitada por el cliente");
    await dialog.getByLabel("Destino de los insumos", { exact: true }).selectOption("WASTE");
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "Registrar devolución total" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText("Devuelta · S/ 40.00").first()).toBeVisible();
    await expect(page.locator(".stat-card").filter({ hasText: "Caja esperada" })).toContainText("60.00");
    const history = page.locator(".restaurant-history");
    await history.getByLabel("Consultar", { exact: true }).selectOption("cash");
    await expect(history.getByRole("heading", { name: "Historial de cajas y cierres" })).toBeVisible();
    await expect(history.getByText("Contado: S/ 90.00")).toBeVisible();
    await capture(page, info, "11-devolucion-e-historial");
    await history.getByRole("button", { name: "Ver movimientos", exact: true }).first().click();
    await expect(history.getByText(/Devolución .*cliente/).first()).toBeVisible();
    await navigate(page, "inventory");
    await expect(page.getByRole("row").filter({ hasText: ingredient })).toContainText("107 KG");
    await navigate(page, "reports");
    await expect(page.locator(".stat-card").filter({ hasText: "Ventas totales" })).toContainText("0.00");
  });

});
