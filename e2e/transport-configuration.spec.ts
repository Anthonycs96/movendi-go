import { expect, type Page, test } from "@playwright/test";
import type { TransportConfiguration } from "@movendi/contracts";

const password = "Nexo2026!";

async function login(page: Page, email: string, businessSlug: string) {
  const response = await page.request.post("/api/auth/login", { data: { email, password, businessSlug, rememberSession: false } });
  expect(response.status(), await response.text()).toBe(200);
}

async function transportConfiguration(page: Page) {
  const response = await page.request.get("/api/data/tenant?section=settings");
  expect(response.status()).toBe(200);
  return (await response.json() as { data: { configuration: TransportConfiguration } }).data.configuration;
}

test.describe.serial("Configuración integral de Transporte", () => {
  test("la plantilla maestra se descarga y vuelve a validar sin perder su contexto", async ({ page }) => {
    await login(page, "superadmin@multisaas.local", "nova-studio");
    const platform = await page.request.get("/api/data/platform");
    expect(platform.status(), await platform.text()).toBe(200);
    const platformBody = await platform.json() as { data: { businesses: Array<{ id: string; slug: string }> } };
    const business = platformBody.data.businesses.find((item) => item.slug === "andes-cargo");
    expect(business).toBeDefined();

    const template = await page.request.get(`/api/platform/onboarding/${business!.id}/transport-template`);
    expect(template.status(), await template.text()).toBe(200);
    expect(template.headers()["content-type"]).toContain("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    const buffer = await template.body();
    expect(buffer.byteLength).toBeGreaterThan(1_000);

    const imported = await page.request.post(`/api/platform/onboarding/${business!.id}/transport-import`, {
      multipart: { file: { name: "movendi-transporte.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer } },
    });
    expect(imported.status(), await imported.text()).toBe(200);
    const result = await imported.json() as { valid: boolean; summary: Record<string, number>; masterData: { parties: unknown[]; vehicles: unknown[]; drivers: unknown[] } };
    expect(result.valid).toBe(true);
    expect(result.summary).toEqual(expect.objectContaining({ parties: expect.any(Number), vehicles: expect.any(Number), drivers: expect.any(Number) }));
    expect(result.masterData).toEqual(expect.objectContaining({ parties: expect.any(Array), vehicles: expect.any(Array), drivers: expect.any(Array) }));
  });

  test("el Super Admin completa las 13 etapas del nuevo negocio de Transporte", async ({ page }) => {
    await login(page, "superadmin@multisaas.local", "nova-studio");
    await page.goto("/platform/businesses");
    const row = page.locator("tbody tr").filter({ hasText: "Andes Cargo" });
    await row.getByRole("button", { name: /Configurar|Continuar|Revisar/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    for (const label of ["Empresa y sede", "Módulos", "Operación", "Clientes", "Flota", "Conductores", "Usuarios y roles", "Reglas operativas", "Gastos", "Mantenimiento", "Seguridad", "Integraciones", "Validación final"]) {
      await expect(dialog.getByRole("button", { name: new RegExp(`^(?:\\d+\\s+)?${label}\\b`, "i") })).toBeVisible();
    }

    const continueButton = dialog.getByRole("button", { name: "Guardar y continuar", exact: true });
    for (const heading of ["Módulos", "Operación", "Clientes", "Flota", "Conductores", "Usuarios y roles", "Reglas operativas", "Gastos", "Mantenimiento", "Seguridad", "Integraciones", "Validación final"]) {
      await continueButton.click();
      await expect(dialog.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    }
    await dialog.getByRole("button", { name: /Marcar listo para operar/i }).click();
    await expect(dialog.getByText("Negocio marcado como listo para operar.")).toBeVisible();

    const platform = await page.request.get("/api/data/platform");
    const body = await platform.json() as { data: { businesses: Array<{ slug: string; setup: { status: string; completedSteps: string[] } }> } };
    const business = body.data.businesses.find((item) => item.slug === "andes-cargo");
    expect(business?.setup.status).toBe("READY");
    expect(business?.setup.completedSteps).toEqual(expect.arrayContaining(["TRANSPORT_OPERATION", "TRANSPORT_FLEET", "TRANSPORT_DRIVERS", "TRANSPORT_FINANCE", "TRANSPORT_MAINTENANCE", "TRANSPORT_SAFETY", "TRANSPORT_INTEGRATIONS"]));
  });

  test("el Administrador gestiona parámetros centrales y de cada módulo", async ({ page }) => {
    await login(page, "admin@andes.local", "andes-cargo");
    await page.goto("/t/andes-cargo/settings");
    await expect(page.getByRole("heading", { name: "Configuración de Transporte" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Parámetros centrales y por módulo" })).toBeVisible();
    for (const title of ["General y numeración", "Operaciones y viajes", "Clientes y cuentas", "Flota y ensamblaje", "Conductores", "Gastos y rendiciones", "Mantenimiento", "Documentación", "Seguridad operativa", "Notificaciones", "Integraciones", "Combustible, neumáticos e inventario"]) {
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
    }

    const before = await transportConfiguration(page);
    const updatedGeneral = { ...before.general, operationPrefix: "CFG", tripPrefix: "TRP" };
    const saved = await page.request.patch("/api/operations/transport/configuration/general", { data: updatedGeneral });
    expect(saved.status(), await saved.text()).toBe(200);
    const after = await transportConfiguration(page);
    expect(after.general.operationPrefix).toBe("CFG");
    expect(after.general.tripPrefix).toBe("TRP");
    expect(after.version).toBeGreaterThan(before.version);

    const operation = await page.request.post("/api/operations/transport/operations", { data: { name: "Operación parametrizada E2E", customerId: "", plannedStartAt: "2035-03-01T08:00:00.000Z", plannedEndAt: "2035-03-02T18:00:00.000Z", description: "Valida numeración configurable", notes: "" } });
    expect(operation.status(), await operation.text()).toBe(200);
    expect((await operation.json() as { message: string }).message).toContain("CFG-");

    const invalidVehicle = await page.request.post("/api/operations/transport/vehicles", { data: { plate: "ZZZ-991", brand: "Marca QA", model: "Modelo QA", year: 2027, type: "TIPO_NO_CONFIGURADO", capacityKg: 10000, odometerKm: 0 } });
    expect(invalidVehicle.status()).toBe(400);
    expect((await invalidVehicle.json() as { error: { code: string } }).error.code).toBe("CONFIG_VALUE_NOT_ALLOWED");
  });

  test("los permisos impiden que Despacho cambie la configuración", async ({ page }) => {
    await login(page, "despacho@andes.local", "andes-cargo");
    const response = await page.request.patch("/api/operations/transport/configuration/general", { data: {} });
    expect(response.status()).toBe(403);
    expect((await response.json() as { error: { code: string } }).error.code).toBe("FORBIDDEN");
  });
});
