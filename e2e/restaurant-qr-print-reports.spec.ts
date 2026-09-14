import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import QRCode from "qrcode";

const db = new PrismaClient();
test.afterAll(async () => db.$disconnect());

async function login(page: Page) {
  const response = await page.request.post("/api/auth/login", { data: { email: "admin@brasa.local", password: "Nexo2026!", businessSlug: "brasa-norte" } });
  expect(response.ok()).toBe(true);
  const tenant = await db.tenant.findUniqueOrThrow({ where: { slug: "brasa-norte" } });
  const branch = await db.branch.findFirstOrThrow({ where: { tenantId: tenant.id, active: true } });
  return { tenant, branch };
}

test("administrator sees and opens reports with an existing essential module list", async ({ page }) => {
  const { tenant } = await login(page);
  try {
    await db.tenant.update({ where: { id: tenant.id }, data: { enabledModules: JSON.stringify(["dashboard", "floor", "orders", "kitchen", "menu", "checkout", "settings"]) } });
    await page.goto("/t/brasa-norte/floor");
    const link = page.locator(".desktop-sidebar").getByRole("link", { name: /Reportes/ });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/reports$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/reportes/i);
  } finally {
    await db.tenant.update({ where: { id: tenant.id }, data: { enabledModules: tenant.enabledModules } });
  }
});

test("assigning a printer activates routing and new orders appear in the manual floor queue", async ({ page }) => {
  const { tenant, branch } = await login(page);
  const area = await db.preparationArea.create({ data: { tenantId: tenant.id, branchId: branch.id, name: "Regresión Barra", dispatchMode: "KDS" } });
  const printer = await db.printDevice.create({ data: { tenantId: tenant.id, branchId: branch.id, name: "Regresión impresora", connectionType: "BROWSER", automatic: true } });
  const category = await db.category.findFirstOrThrow({ where: { tenantId: tenant.id, branchId: branch.id } });
  const product = await db.product.create({ data: { tenantId: tenant.id, branchId: branch.id, categoryId: category.id, preparationAreaId: area.id, name: "Bebida regresión", priceCents: 500 } });
  const assigned = await page.request.post("/api/operations/restaurant/area-printers", { data: { areaId: area.id, printerId: printer.id, copies: 1, active: true } });
  expect(assigned.ok()).toBe(true);
  expect((await db.preparationArea.findUniqueOrThrow({ where: { id: area.id } })).dispatchMode).toBe("PRINTER");
  expect((await page.request.patch("/api/operations/restaurant/print-settings", { data: { mode: "ADVANCED", automatic: true, defaultPrinterId: printer.id, fields: ["table", "orderCode"] } })).ok()).toBe(true);
  await page.addInitScript((id) => {
    localStorage.setItem("movendi-kitchen-print-enabled", "false");
    localStorage.setItem("movendi-kitchen-printer-id", id);
    window.print = () => { document.documentElement.dataset.printRequested = "true"; };
  }, printer.id);
  await page.goto("/t/brasa-norte/floor");
  await expect(page.getByRole("heading", { name: "Estación de impresión" })).toBeVisible();
  const orderResponse = await page.request.post("/api/operations/restaurant/orders", { data: { source: "TAKEAWAY", items: [{ productId: product.id, quantity: 1 }] } });
  expect(orderResponse.ok(), await orderResponse.text()).toBe(true);
  const job = await db.restaurantPrintJob.findFirstOrThrow({ where: { printerId: printer.id, type: "INITIAL" } });
  await page.getByRole("button", { name: "Imprimir ahora", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-print-requested", "true");
  await page.getByRole("button", { name: "Salió correctamente", exact: true }).click();
  await expect.poll(async () => (await db.restaurantPrintJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("PRINTED");
  // The next real order opens automatically after the operator opts in.
  await page.getByRole("checkbox", { name: "Abrir siguientes comandas" }).check();
  await page.evaluate(() => { delete document.documentElement.dataset.printRequested; });
  const second = await page.request.post("/api/operations/restaurant/orders", { data: { source: "TAKEAWAY", items: [{ productId: product.id, quantity: 2 }] } });
  expect(second.ok(), await second.text()).toBe(true);
  await expect(page.locator("html")).toHaveAttribute("data-print-requested", "true");
  await expect(page.getByRole("group", { name: "Confirmar impresión" })).toBeVisible();
  await page.getByRole("button", { name: "No salió / cancelé", exact: true }).click();
});

test("delivery transitions stay compact on mobile", async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/t/brasa-norte/settings");
  const editor = page.locator(".status-flow-editor").filter({ hasText: "Flujo de delivery" });
  const option = editor.locator(".config-transition-options label").first();
  await option.scrollIntoViewIfNeeded();
  const box = await option.boundingBox();
  expect(box!.height).toBeLessThan(65);
  expect(box!.height).toBeGreaterThanOrEqual(36);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: "test-results/delivery-transitions-mobile.png" });
});

test("simple mode exposes unassigned jobs even when other printers exist", async ({ page }) => {
  const { tenant, branch } = await login(page);
  expect((await page.request.patch("/api/operations/restaurant/print-settings", { data: { mode: "SIMPLE", automatic: false, defaultPrinterId: "", fields: [] } })).ok()).toBe(true);
  const product = await db.product.findFirstOrThrow({ where: { tenantId: tenant.id, branchId: branch.id, active: true, productType: "FOOD" } });
  await page.addInitScript(() => {
    localStorage.removeItem("movendi-kitchen-printer-id");
    localStorage.setItem("movendi-kitchen-print-enabled", "false");
  });
  await page.goto("/t/brasa-norte/orders");
  const orderResponse = await page.request.post("/api/operations/restaurant/orders", { data: { source: "TAKEAWAY", items: [{ productId: product.id, quantity: 1 }] } });
  expect(orderResponse.ok(), await orderResponse.text()).toBe(true);
  const order = await orderResponse.json() as { id: string };
  const job = await db.restaurantPrintJob.findFirstOrThrow({ where: { orderId: order.id, type: "INITIAL" } });
  expect(job.printerId).toBeNull();
  const station = page.locator(".kitchen-print-station");
  await expect(station.getByRole("combobox")).toHaveValue("");
  await expect(station.getByRole("button", { name: "Imprimir ahora" }).first()).toBeVisible();
});

test("camera can be switched and the replacement stream decodes a table QR", async ({ page }) => {
  const { tenant, branch } = await login(page);
  const table = await db.diningTable.findFirstOrThrow({ where: { tenantId: tenant.id, branchId: branch.id, active: true } });
  const qrResponse = await page.request.post(`/api/operations/restaurant/tables/${table.id}/qr`, { data: { renew: false } });
  expect(qrResponse.ok()).toBe(true);
  const qr = await qrResponse.json() as { qrValue: string };
  const dataUrl = await QRCode.toDataURL(qr.qrValue, { width: 400, margin: 4 });
  await page.addInitScript(({ qrImage }) => {
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {
      enumerateDevices: async () => ["one", "two"].map((id, index) => ({ deviceId: id, kind: "videoinput", groupId: "rear", label: `Camera ${index + 1}` })),
      getUserMedia: async (constraints: MediaStreamConstraints) => {
        const id = ((constraints.video as MediaTrackConstraints).deviceId as ConstrainDOMStringParameters | undefined)?.exact ?? "one";
        const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 480;
        const ctx = canvas.getContext("2d")!; ctx.fillStyle = "white"; ctx.fillRect(0, 0, 640, 480);
        const stream = canvas.captureStream(10);
        const track = stream.getVideoTracks()[0];
        Object.defineProperty(track, "getSettings", { value: () => ({ deviceId: id }) });
        document.documentElement.dataset.cameraOpened = String(id);
        track.addEventListener("ended", () => canvas.remove());
        if (id === "two") {
          const image = new Image(); image.src = qrImage; await image.decode();
          ctx.drawImage(image, 120, 40, 400, 400);
          (track as CanvasCaptureMediaStreamTrack).requestFrame();
        }
        return stream;
      },
    } });
  }, { qrImage: dataUrl });
  await page.goto("/t/brasa-norte/floor");
  await page.getByRole("button", { name: "Escanear mesa" }).click();
  const dialog = page.getByRole("dialog", { name: "Escanear QR de mesa" });
  await dialog.getByLabel("Cámara", { exact: true }).selectOption("two");
  await expect(page.locator("html")).toHaveAttribute("data-camera-opened", "two");
  await expect(dialog).not.toBeVisible();
});
