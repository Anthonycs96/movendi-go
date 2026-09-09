import { expect, test, type BrowserContext, type Page, type TestInfo } from "@playwright/test";

const originalBase = process.env.ORIGINAL_BASE_URL ?? "http://127.0.0.1:3000";
const v2Base = process.env.V2_BASE_URL ?? "http://localhost:3100";

type Snapshot = {
  app: "original" | "v2";
  vertical: "barbershop" | "restaurant";
  route: string;
  url: string;
  status: number | null;
  title: string;
  headings: string[];
  navigation: Array<{ text: string; href: string }>;
  documentWidth: number;
  viewportWidth: number;
};

async function settle(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator("body")).toBeVisible();
  await expect(page.getByText("Cargando informacion...", { exact: true }).first()).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText("Sincronizando", { exact: true }).first()).toBeHidden({ timeout: 30_000 });
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  await page.evaluate(() => document.fonts.ready);
}

async function capture(page: Page, testInfo: TestInfo, name: string, app: Snapshot["app"], vertical: Snapshot["vertical"], route: string, status: number | null): Promise<Snapshot> {
  await settle(page);
  if (route === "/login") {
    await expect(page.locator('input[name="email"]:visible').first()).toBeVisible({ timeout: 30_000 });
    if (app === "original") await expect(page.getByText("Gestion operativa empresarial", { exact: true })).toBeHidden({ timeout: 30_000 });
  }
  const snapshot = await page.evaluate(({ app, vertical, route, status }) => ({
    app,
    vertical,
    route,
    url: window.location.href,
    status,
    title: document.title,
    headings: Array.from(document.querySelectorAll("h1, h2")).map((element) => element.textContent?.trim() ?? "").filter(Boolean).slice(0, 12),
    navigation: Array.from(document.querySelectorAll("aside a, nav a")).map((element) => ({ text: element.textContent?.replace(/\s+/g, " ").trim() ?? "", href: (element as HTMLAnchorElement).href })).filter((item) => item.text).slice(0, 30),
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }), { app, vertical, route, status });
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true, caret: "initial" });
  return snapshot;
}

async function openAndCapture(page: Page, base: string, route: string, testInfo: TestInfo, name: string, app: Snapshot["app"], vertical: Snapshot["vertical"]) {
  const response = await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch(async (error: Error) => {
    if (!error.message.includes("ERR_ABORTED")) throw error;
    await page.waitForLoadState("domcontentloaded").catch(() => undefined);
    return null;
  });
  return capture(page, testInfo, name, app, vertical, route, response?.status() ?? null);
}

async function loginOriginal(context: BrowserContext, email: string, slug: string) {
  const page = await context.newPage();
  await page.goto(`${originalBase}/login?email=${encodeURIComponent(email)}&slug=${slug}&password=Admin123%21`);
  await expect(page.locator('input[name="email"]:visible').first()).toHaveValue(email);
  await expect(page.locator('input[name="businessSlug"]:visible, input[name="slug"]:visible').first()).toHaveValue(slug);
  await page.getByRole("button", { name: "Entrar al sistema" }).click();
  await page.waitForURL((url) => url.pathname !== "/login", { timeout: 30_000 });
  return page;
}

async function loginV2(context: BrowserContext, email: string, slug: string) {
  const page = await context.newPage();
  await page.goto(`${v2Base}/login`);
  await page.getByLabel(/Correo electrónico/i).fill(email);
  await page.getByLabel(/^Contraseña$/i).fill("Nexo2026!");
  await page.getByRole("button", { name: "Entrar al sistema" }).click();
  await page.waitForURL((url) => url.pathname.includes(`/t/${slug}/`), { timeout: 30_000 });
  return page;
}

test("comparación viva del original y V2", async ({ browser }, testInfo) => {
  test.setTimeout(300_000);
  const originalAvailable = await fetch(`${originalBase}/login`).then((response) => response.ok).catch(() => false);
  test.skip(!originalAvailable, "El proyecto original no está ejecutándose; la regresión propia de V2 continúa siendo independiente.");
  const originalIssues: string[] = [];
  const v2Issues: string[] = [];
  const snapshots: Snapshot[] = [];
  const contexts: BrowserContext[] = [];

  async function trackedContext(app: Snapshot["app"]) {
    const issues = app === "original" ? originalIssues : v2Issues;
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "es-PE" });
    contexts.push(context);
    context.on("page", (page) => {
      page.on("pageerror", (error) => issues.push(`pageerror ${page.url()}: ${error.message}`));
      page.on("console", (message) => { if (message.type() === "error") issues.push(`console ${page.url()}: ${message.text()}`); });
      page.on("response", (response) => { if (response.status() >= 400) issues.push(`${response.status()} ${response.url()}`); });
    });
    return context;
  }

  const originalBarberContext = await trackedContext("original");
  const originalLogin = await originalBarberContext.newPage();
  const originalLoginResponse = await originalLogin.goto(`${originalBase}/login`);
  snapshots.push(await capture(originalLogin, testInfo, "original-login", "original", "barbershop", "/login", originalLoginResponse?.status() ?? null));
  await originalLogin.close();
  const originalBarber = await loginOriginal(originalBarberContext, "qa-barbershop@multi-business.local", "qa-barbershop");
  for (const [route, name] of [["/beauty", "original-barber-dashboard"], ["/appointments", "original-barber-appointments"], ["/customers", "original-barber-customers"], ["/barbers", "original-barber-team"], ["/catalog", "original-barber-services"], ["/payments", "original-barber-payments"], ["/settings", "original-barber-settings"]] as const) {
    snapshots.push(await openAndCapture(originalBarber, originalBase, route, testInfo, name, "original", "barbershop"));
  }

  const v2BarberContext = await trackedContext("v2");
  const v2Login = await v2BarberContext.newPage();
  const v2LoginResponse = await v2Login.goto(`${v2Base}/login`);
  snapshots.push(await capture(v2Login, testInfo, "v2-login", "v2", "barbershop", "/login", v2LoginResponse?.status() ?? null));
  await v2Login.close();
  const v2Barber = await loginV2(v2BarberContext, "admin@nova.local", "nova-studio");
  for (const [route, name] of [["/t/nova-studio/dashboard", "v2-barber-dashboard"], ["/t/nova-studio/appointments", "v2-barber-appointments"], ["/t/nova-studio/clients", "v2-barber-customers"], ["/t/nova-studio/team", "v2-barber-team"], ["/t/nova-studio/services", "v2-barber-services"], ["/t/nova-studio/checkout", "v2-barber-payments"], ["/t/nova-studio/settings", "v2-barber-settings"]] as const) {
    snapshots.push(await openAndCapture(v2Barber, v2Base, route, testInfo, name, "v2", "barbershop"));
  }

  const originalRestaurantContext = await trackedContext("original");
  const originalRestaurant = await loginOriginal(originalRestaurantContext, "qa-restaurant@multi-business.local", "qa-restaurant");
  for (const [route, name] of [["/", "original-restaurant-dashboard"], ["/restaurant", "original-restaurant-floor"], ["/catalog", "original-restaurant-menu"], ["/customers", "original-restaurant-customers"], ["/orders", "original-restaurant-orders"], ["/payments", "original-restaurant-payments"], ["/settings", "original-restaurant-settings"]] as const) {
    snapshots.push(await openAndCapture(originalRestaurant, originalBase, route, testInfo, name, "original", "restaurant"));
  }

  const v2RestaurantContext = await trackedContext("v2");
  const v2Restaurant = await loginV2(v2RestaurantContext, "admin@brasa.local", "brasa-norte");
  for (const [route, name] of [["/t/brasa-norte/dashboard", "v2-restaurant-dashboard"], ["/t/brasa-norte/floor", "v2-restaurant-floor"], ["/t/brasa-norte/menu", "v2-restaurant-menu"], ["/t/brasa-norte/clients", "v2-restaurant-customers"], ["/t/brasa-norte/orders", "v2-restaurant-orders"], ["/t/brasa-norte/checkout", "v2-restaurant-payments"], ["/t/brasa-norte/settings", "v2-restaurant-settings"]] as const) {
    snapshots.push(await openAndCapture(v2Restaurant, v2Base, route, testInfo, name, "v2", "restaurant"));
  }

  await v2Barber.setViewportSize({ width: 390, height: 844 });
  snapshots.push(await openAndCapture(v2Barber, v2Base, "/t/nova-studio/dashboard", testInfo, "v2-barber-mobile", "v2", "barbershop"));
  await originalBarber.setViewportSize({ width: 390, height: 844 });
  snapshots.push(await openAndCapture(originalBarber, originalBase, "/beauty", testInfo, "original-barber-mobile", "original", "barbershop"));

  await testInfo.attach("comparison.json", { body: Buffer.from(JSON.stringify({ snapshots, originalIssues, v2Issues }, null, 2)), contentType: "application/json" });
  for (const context of contexts) await context.close();

  expect(snapshots).toHaveLength(32);
  expect(snapshots.every((item) => item.status === null || item.status < 500)).toBe(true);
  expect(snapshots.filter((item) => item.app === "v2").every((item) => item.documentWidth <= item.viewportWidth)).toBe(true);
  expect(v2Issues).toEqual([]);
});
