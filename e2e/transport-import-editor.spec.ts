import { expect, test } from "@playwright/test";

test("permite revisar y editar la carga de flota antes de guardarla", async ({ page }) => {
  const login = await page.request.post("/api/auth/login", { data: { email: "superadmin@multisaas.local", password: "Nexo2026!", businessSlug: "nova-studio", rememberSession: false } });
  expect(login.status(), await login.text()).toBe(200);

  await page.route("**/api/operations/platform/onboarding/*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ message: "Paso guardado" }) });
  });
  await page.route("**/api/platform/onboarding/*/transport-import", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        valid: true,
        issues: [],
        summary: { users: 0, parties: 0, locations: 0, routes: 0, vehicles: 30, trailers: 1, drivers: 0 },
        masterData: {
          users: [], parties: [], locations: [], routes: [], drivers: [],
          vehicles: Array.from({ length: 30 }, (_, index) => ({ plate: `TRK${String(index + 1).padStart(3, "0")}`, brand: "SCANIA", model: "P450", year: 2022, type: "TRACTOR", capacityKg: null, odometerKm: 120000, status: "AVAILABLE", technicalDueAt: "", soatDueAt: "", gpsDeviceId: `GPS-${index + 1}` })),
          trailers: [{ plate: "CAR001", brand: "", model: "", type: "PARIHUELERO", capacityKg: null, status: "AVAILABLE" }],
        },
      }),
    });
  });

  await page.goto("/platform/businesses");
  await page.waitForLoadState("networkidle");
  const row = page.locator("tbody tr").filter({ hasText: "Andes Cargo" });
  const configureButton = row.getByRole("button", { name: /Configurar|Continuar|Revisar/i });
  await expect(configureButton).toBeEnabled();
  await configureButton.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const saveAndContinue = dialog.getByRole("button", { name: "Guardar y continuar", exact: true });
  for (const nextStep of ["Módulos", "Operación", "Clientes", "Flota"]) {
    await saveAndContinue.click();
    await expect(dialog.getByRole("heading", { name: nextStep, exact: true })).toBeVisible();
  }
  await expect(dialog.getByRole("heading", { name: "Flota", exact: true })).toBeVisible();

  const uploadSection = dialog.getByRole("region", { name: "Carga de flota con Excel" });
  await uploadSection.locator('input[type="file"]').setInputFiles({ name: "flota.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from("test") });
  const summary = dialog.getByRole("region", { name: "Datos de Transporte preparados con Excel" });
  await expect(summary.getByText("30 vehículos", { exact: true })).toBeVisible();
  await expect(summary.getByText("1 carretas", { exact: true })).toBeVisible();

  await dialog.getByRole("button", { name: "Ver y editar datos" }).click();
  const editor = dialog.getByRole("region", { name: "Vista editable de los datos preparados" });
  await expect(editor).toBeVisible();
  await expect(editor.getByRole("tab", { name: /Vehículos y tractos/ })).toHaveAttribute("aria-selected", "true");
  await expect(editor.getByLabel("Filas por página")).toHaveValue("ALL");
  await expect(editor.getByLabel(/^Placa, fila/)).toHaveCount(30);
  await expect(editor.getByText("Mostrando 1–30 de 30", { exact: true })).toBeVisible();
  await editor.getByLabel("Filas por página").selectOption("25");
  await expect(editor.getByLabel(/^Placa, fila/)).toHaveCount(25);
  await editor.getByLabel("Filas por página").selectOption("ALL");
  await expect(editor.getByLabel("Placa, fila 1", { exact: true })).toHaveValue("TRK001");
  await editor.getByLabel("Marca, fila 1", { exact: true }).fill("SCANIA EDITADA");
  await expect(editor.getByLabel("Marca, fila 1", { exact: true })).toHaveValue("SCANIA EDITADA");

  await editor.getByRole("tab", { name: /Carretas y remolques/ }).click();
  await expect(editor.getByLabel("Placa, fila 1", { exact: true })).toHaveValue("CAR001");
});
