import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

let adminPassword = "Nexo2026!";
async function login(page: Page) {
  const response = await page.request.post("/api/auth/login", { data: { email: "admin@nova.local", businessSlug: "nova-studio", password: adminPassword, rememberSession: false } });
  expect(response.status(), await response.text()).toBe(200);
  if ((await response.json()).redirectTo.startsWith("/change-password")) { expect((await page.request.post("/api/auth/change-password", { data: { currentPassword: adminPassword, newPassword: "Nexo2026!-salon" } })).status()).toBe(200); adminPassword = "Nexo2026!-salon"; }
}
async function post(page: Page, path: string, data: unknown) { const response = await page.request.post(`/api/operations/${path}`, { data }); expect(response.status(), await response.text()).toBe(200); return response.json(); }

test("Barbería opera una compra, venta mixta, cliente, agenda, comisión, devolución y móvil", async ({ page }) => {
  test.setTimeout(240000); await login(page);
  const customer = await post(page, "barbershop/customers", { name: "Cliente Salón E2E", dni: "88990123", phone: "999887744", notes: "Degradado bajo, cabello sensible" });
  const supplier = await post(page, "inventory/suppliers", { name: "Proveedor Salón E2E", documentType: "RUC", documentNumber: "20889900112", active: true });
  const product = await post(page, "inventory/items", { sku: "SALON-CERA", name: "Cera Salón E2E", kind: "PRODUCT", unit: "UND", openingStock: 0, minimumStock: 3, unitCost: 5, trackStock: true });
  await post(page, "inventory/purchases", { supplierId: supplier.id, supplierName: "Proveedor Salón E2E", documentNumber: "F001-11", idempotencyKey: "salon-purchase-e2e", lines: [{ itemId: product.id, quantity: 10, unitCost: 5 }] });
  const supply = await post(page, "inventory/items", { sku: "SALON-CHAMPU", name: "Champú Salón E2E", kind: "INPUT", unit: "L", openingStock: 2, minimumStock: 0.5, unitCost: 10, trackStock: true });
  const offer = await post(page, "barbershop/products", { itemId: product.id, priceCents: 2000 });
  const service = await post(page, "barbershop/services", { name: "Corte Salón E2E", category: "Cabello", price: 30, durationMinutes: 30, staffIds: ["staff-mateo"], supplies: [{ itemId: supply.id, quantity: 0.1 }] });
  await page.goto("/t/nova-studio/checkout");
  await page.getByRole("button", { name: "Nueva venta", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Venta de servicios y productos" });
  await dialog.getByLabel("Buscar cliente").fill("88990123"); await dialog.getByLabel("Cliente", { exact: true }).selectOption(customer.id);
  await dialog.getByLabel("Agregar servicio").selectOption(service.id); await dialog.getByLabel("Realizado por").selectOption("staff-mateo");
  await dialog.getByLabel("Agregar producto").selectOption(offer.id); await dialog.getByLabel("Vendido por").selectOption("staff-mateo");
  await dialog.getByRole("button", { name: "Combinar otro medio" }).click();
  await dialog.getByLabel("Importe 1 (S/)", { exact: true }).fill("20"); await dialog.getByLabel("Importe 2 (S/)", { exact: true }).fill("30");
  const paid = page.waitForResponse((r) => r.url().endsWith("/barbershop/sales") && r.request().method() === "POST");
  await dialog.getByRole("button", { name: /Registrar cobro/ }).click(); expect((await paid).status()).toBe(200); await expect(dialog).not.toBeVisible();
  const row = page.getByRole("row").filter({ hasText: "Cliente Salón E2E" }); await expect(row).toContainText("50.00"); await expect(row).toContainText("Efectivo + Yape");
  await row.getByRole("button", { name: "Ver comprobante" }).click(); const receipt = page.getByRole("dialog", { name: "Comprobante de venta", exact: true }); await expect(receipt).toContainText("Corte Salón E2E"); await expect(receipt).toContainText("Cera Salón E2E");
  await mkdir("output/barbershop", { recursive: true }); await receipt.screenshot({ path: "output/barbershop/receipt.png" }); await page.keyboard.press("Escape");
  const inventory = await (await page.request.get("/api/data/tenant?section=inventory")).json();
  expect(inventory.data.inventoryModule.items.find((i: { id: string }) => i.id === product.id).stock).toBe(9);
  expect(inventory.data.inventoryModule.items.find((i: { id: string }) => i.id === supply.id).stock).toBe(1.9);
  await page.goto("/t/nova-studio/clients"); await page.getByPlaceholder("Buscar por nombre, teléfono o DNI").fill("999887744"); await page.getByRole("button", { name: "Historial", exact: true }).click(); await expect(page.getByRole("dialog")).toContainText("Cera Salón E2E"); await expect(page.getByRole("dialog")).toContainText("Degradado bajo"); await page.keyboard.press("Escape");
  await page.goto("/t/nova-studio/reports"); await expect(page.getByRole("heading", { name: "Producción por profesional" })).toBeVisible(); await expect(page.getByRole("row").filter({ hasText: "Corte Salón E2E" }).first()).toBeVisible();
  await page.screenshot({ path: "output/barbershop/reports-desktop.png", fullPage: true });
  const appointment = await post(page, "barbershop/appointments", { customerId: customer.id, staffId: "staff-mateo", serviceId: service.id, startsAt: "2035-01-08T11:00" });
  const conflict = await page.request.post("/api/operations/barbershop/appointments", { data: { customerId: customer.id, staffId: "staff-mateo", serviceId: service.id, startsAt: "2035-01-08T11:15" } }); expect(conflict.status()).toBe(409);
  await page.goto("/t/nova-studio/appointments"); await page.getByLabel("Filtrar por fecha").fill("2035-01-08"); const appointmentRow = page.getByRole("row").filter({ hasText: "Cliente Salón E2E" }); await expect(appointmentRow).toBeVisible();
  await appointmentRow.getByRole("button", { name: "Reprogramar", exact: true }).click(); const reschedule = page.getByRole("dialog", { name: "Reprogramar cita", exact: true }); await reschedule.getByLabel("Fecha y hora").fill("2035-01-08T12:00"); const changed = page.waitForResponse((r) => r.url().endsWith(`${appointment.id}/reschedule`)); await reschedule.getByRole("button", { name: "Actualizar cita" }).click(); expect((await changed).status()).toBe(200);
  for (const size of [{ width: 390, height: 844 }, { width: 768, height: 1024 }]) {
    await page.setViewportSize(size);
    for (const section of ["checkout", "services", "team", "appointments", "clients", "inventory", "reports"]) {
      await page.goto(`/t/nova-studio/${section}`); await expect(page.locator("h1")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), `${section} at ${size.width}`).toBe(true);
      await page.screenshot({ path: `output/barbershop/${section}-${size.width}.png`, fullPage: true });
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/t/nova-studio/checkout");
  await page.getByRole("row").filter({ hasText: "Cliente Salón E2E" }).getByRole("button", { name: "Ver comprobante" }).click();
  await page.getByRole("button", { name: "Registrar devolución", exact: true }).click();
  const refund = page.getByRole("dialog", { name: "Devolver venta completa", exact: true });
  await refund.getByLabel("Motivo", { exact: true }).fill("Prueba de devolución completa");
  await refund.getByLabel("Productos devueltos").selectOption("true");
  const refunded = page.waitForResponse((r) => r.url().endsWith("/refund") && r.request().method() === "POST");
  await refund.getByRole("button", { name: "Guardar", exact: true }).click(); expect((await refunded).status()).toBe(200);
  await expect(page.getByRole("row").filter({ hasText: "Cliente Salón E2E" })).toContainText("Devuelta");
  const afterRefund = await (await page.request.get("/api/data/tenant?section=inventory")).json();
  expect(afterRefund.data.inventoryModule.items.find((i: { id: string }) => i.id === product.id).stock).toBe(10);
  expect(afterRefund.data.inventoryModule.items.find((i: { id: string }) => i.id === supply.id).stock).toBe(1.9);
});

test("recepción no puede cobrar ni leer reportes; las secciones rechazan acceso directo", async ({ page }) => {
  await login(page);
  const role = await post(page, "core/roles", { name: "Recepción Salón E2E", permissions: "dashboard:read,barbershop:appointments:read,barbershop:appointments:write,customers:read,customers:write,services:read" });
  const core = await (await page.request.get("/api/data/tenant?section=settings")).json();
  await post(page, "core/users", { name: "Recepción E2E", email: "salon-reception@e2e.local", password: "SalonReception2026!", roleId: role.id, branchId: core.session.branchId });
  await page.request.post("/api/auth/logout");
  const response = await page.request.post("/api/auth/login", { data: { email: "salon-reception@e2e.local", businessSlug: "nova-studio", password: "SalonReception2026!" } }); expect(response.status()).toBe(200);
  if ((await response.json()).redirectTo.startsWith("/change-password")) await page.request.post("/api/auth/change-password", { data: { currentPassword: "SalonReception2026!", newPassword: "SalonReception2026!-next" } });
  expect((await page.request.get("/api/data/tenant?section=checkout")).status()).toBe(403);
  expect((await page.request.get("/api/barbershop/reports")).status()).toBe(403);
  expect((await page.request.post("/api/operations/barbershop/appointments/any/checkout", { data: { paymentMethod: "CASH" } })).status()).toBe(403);
  await page.goto("/t/nova-studio/appointments"); await expect(page.getByRole("button", { name: "Cobrar", exact: true })).toHaveCount(0);
});
