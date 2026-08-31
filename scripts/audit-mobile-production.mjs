import { chromium, webkit } from "playwright";
import { tmpdir } from "node:os";
import { join } from "node:path";

const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
if (!email || !password) throw new Error("Faltan BOOTSTRAP_ADMIN_EMAIL/BOOTSTRAP_ADMIN_PASSWORD.");

const browserType = process.env.PW_ENGINE === "webkit" ? webkit : chromium;
const browser = await browserType.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await context.newPage();
await page.goto("https://web.movendi-go.com/login", { waitUntil: "networkidle" });
await page.getByLabel("Correo electrónico").fill(email);
await page.getByRole("textbox", { name: "Contraseña", exact: true }).fill(password);
await page.getByRole("button", { name: "Entrar al sistema" }).click();
await page.waitForURL(/\/platform\//);
const switched = await page.request.post("https://web.movendi-go.com/api/auth/tenant", { data: { tenantSlug: "restaurantes-demo" } });
if (!switched.ok()) throw new Error(`No se pudo cambiar al restaurante: ${switched.status()}`);
await page.goto("https://web.movendi-go.com/t/restaurantes-demo/floor", { waitUntil: "networkidle" });

await page.getByRole("button", { name: /Mesa 1/ }).click();
await page.getByRole("button", { name: "Abrir carta y agregar productos" }).click();
const trigger = page.locator(".mobile-expansion-actions");
await trigger.waitFor({ state: "visible" });
const triggerBox = await trigger.boundingBox();
const viewportAudit = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
const dialog = page.locator(".pos-order-dialog");
const dialogBox = await dialog.boundingBox();
const send = trigger.locator(".button");
const sendBox = await send.boundingBox();
const buttonAudit = await send.evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight }));
const screenshot = join(tmpdir(), "movendi-iphone-13-mini.png");
await page.screenshot({ path: screenshot, fullPage: true });
console.log(JSON.stringify({ engine: process.env.PW_ENGINE ?? "chromium", viewportAudit, triggerBox, dialogBox, sendBox, buttonAudit, screenshot }));
await browser.close();
