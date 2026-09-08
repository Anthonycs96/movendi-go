import { expect, test, type Page, type Locator } from "@playwright/test";
import { mkdir } from "node:fs/promises";

async function login(page: Page) {
  const response = await page.request.post("/api/auth/login", { data: { email: "superadmin@multisaas.local", password: "Nexo2026!", businessSlug: "brasa-norte" } });
  expect(response.ok()).toBe(true);
}
async function insideViewport(page: Page, element: Locator) {
  const rect = await element.boundingBox();
  expect(rect).not.toBeNull();
  const size = page.viewportSize()!;
  expect(rect!.x).toBeGreaterThanOrEqual(0);
  expect(rect!.y).toBeGreaterThanOrEqual(0);
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(size.width);
  expect(rect!.y + rect!.height).toBeLessThanOrEqual(size.height);
}

for (const width of [1366, 390]) test(`tema y alertas visibles y operables a ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  await login(page);
  await page.goto("/t/brasa-norte/dashboard");
  if (width === 390) await page.getByRole("button", { name: "Abrir navegación", exact: true }).click();
  else await page.locator(".desktop-sidebar").hover();
  const trigger = page.getByRole("button", { name: /^Tema:/ });
  await trigger.click();
  const menu = page.getByRole("menu", { name: "Tema de apariencia" });
  await expect(menu).toBeVisible();
  await insideViewport(page, menu);
  await page.getByRole("menuitemradio", { name: /Oscuro/ }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(trigger).toBeFocused();
  await trigger.press("ArrowDown");
  await page.keyboard.press("Home");
  await expect(page.getByRole("menuitemradio", { name: /Sistema/ })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(menu).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await mkdir("outputs/shell-review", { recursive: true });
  await page.screenshot({ path: `outputs/shell-review/theme-${info.project.name}-${width}.png` });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Alertas operativas/ }).click();
  const notifications = page.getByRole("region", { name: "Alertas operativas" });
  await expect(notifications).toBeVisible();
  await insideViewport(page, notifications);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme-mode", "light");
});

test("abre la empresa actual y otra empresa sin colapsar el selector ni reutilizar datos anteriores", async ({ page }) => {
  await login(page);
  await page.goto("/platform/dashboard");
  for (const slug of ["brasa-norte", "nova-studio", "brasa-norte"]) {
    await page.locator(".platform-sidebar.desktop-sidebar").hover();
    const selector = page.getByRole("combobox", { name: "Seleccionar negocio" });
    await selector.focus();
    await page.mouse.move(900, 200);
    await expect(selector).toBeVisible();
    await selector.selectOption(slug);
    await expect(page).toHaveURL(new RegExp(`/t/${slug}/dashboard$`));
    await expect(page.locator("h1")).toBeVisible();
    const context = await (await page.request.get("/api/auth/session")).json();
    expect(context.session.tenantSlug).toBe(slug);
    await page.locator(".desktop-sidebar").hover();
    await page.locator('.desktop-sidebar a[href="/platform/dashboard"]').click();
    await expect(page.getByRole("heading", { name: "Centro de control", exact: true })).toBeVisible();
  }
});

test("un cambio de empresa rechazado muestra el error y permite reintentar", async ({ page }) => {
  await login(page);
  await page.goto("/platform/dashboard");
  await page.locator(".platform-sidebar.desktop-sidebar").hover();
  await page.route("**/api/auth/tenant", (route) => route.fulfill({ status: 403, json: { error: { message: "Acceso revocado" } } }));
  const selector = page.getByRole("combobox", { name: "Seleccionar negocio" });
  await selector.selectOption("nova-studio");
  await expect(page.getByRole("alert").filter({ hasText: "No pudimos abrir" })).toBeVisible();
  await expect(selector).toBeEnabled();
  await page.unroute("**/api/auth/tenant");
  await selector.selectOption("brasa-norte");
  await expect(page).toHaveURL(/\/t\/brasa-norte\/dashboard$/);
});

test("el puntero no mueve la navegación y las consultas se limitan a su pantalla", async ({ page }) => {
  await login(page);
  await page.goto("/t/brasa-norte/dashboard");
  const before = await page.locator(".app-main").boundingBox();
  await page.locator(".desktop-sidebar").hover();
  await expect(page.locator(".app-shell")).not.toHaveClass(/app-shell--collapsed/);
  await expect.poll(() => page.locator(".app-main").evaluate((el) => getComputedStyle(el).paddingLeft)).toBe("320px");
  expect((await page.locator(".app-main").boundingBox())?.width).toBe(before?.width);
  await page.getByRole("button", { name: "Contraer navegación", exact: true }).click();
  const item = page.locator('.desktop-sidebar a[href="/t/brasa-norte/kitchen"]');
  await item.click();
  await expect(page).toHaveURL(/\/kitchen$/);
  await page.getByRole("button", { name: "Expandir navegación", exact: true }).click();
  const kitchen = await (await page.request.get("/api/data/tenant?section=kitchen")).json();
  expect(kitchen.data.kitchen.length).toBeGreaterThan(0);
  expect(kitchen.data.customers).toEqual([]);
  expect(kitchen.data.sales).toEqual([]);
  expect(kitchen.data.products).toEqual([]);
  const clients = await (await page.request.get("/api/data/tenant?section=clients")).json();
  expect(clients.data.customers.length).toBeGreaterThan(0);
  expect(clients.data.orders).toEqual([]);
});
