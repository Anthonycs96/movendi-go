import { expect, type Page, test } from "@playwright/test";
import type { TransportData } from "@movendi/contracts";

const slug = "andes-cargo";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/Correo electrónico/i).fill("admin@andes.local");
  const businessPicker = page.getByRole("button", { name: "Negocio" });
  if (await businessPicker.getAttribute("aria-expanded") === "false") {
    await businessPicker.click();
    const option = page.getByRole("option").filter({ hasText: "Andes Cargo" });
    if (await option.count()) await option.click();
  }
  await page.getByLabel(/^Contraseña$/i).fill("Nexo2026!");
  await page.getByRole("button", { name: "Entrar al sistema" }).click();
  await expect(page).toHaveURL(new RegExp(`/t/${slug}/dashboard$`));
}

test.describe.serial("Operaciones logísticas e historial de mantenimiento", () => {
  test("registra una operación sin unidades ni conductores", async ({ page }) => {
    await login(page);
    const start = new Date(Date.now() + 5 * 86_400_000);
    const end = new Date(Date.now() + 8 * 86_400_000);
    const response = await page.request.post("/api/operations/transport/operations", { data: { name: "Plan pendiente de asignación", plannedStartAt: start.toISOString(), plannedEndAt: end.toISOString(), description: "Las unidades se asignarán conforme se presenten." } });
    expect(response.status()).toBe(200);
    const created = await response.json() as { id: string };
    expect(created.id).toBeTruthy();

    const workspace = await page.request.get("/api/data/tenant?section=operations&q=VJ-2026-00002&pageSize=10");
    const data = (await workspace.json() as { data: TransportData }).data;
    expect(data.operations.some((item) => item.id === created.id && item.tripCount === 0 && item.status === "PLANNED")).toBe(true);
  });

  test("asocia después un viaje pendiente a la operación", async ({ page }) => {
    await login(page);
    const workspace = await page.request.get("/api/data/tenant?section=operations&q=VJ-2026-00002&pageSize=10");
    const data = (await workspace.json() as { data: TransportData }).data;
    const operation = data.operations.find((item) => item.name === "Plan pendiente de asignación");
    const trip = data.trips.find((item) => item.code === "VJ-2026-00002");
    expect(operation).toBeTruthy();
    expect(trip).toBeTruthy();
    const response = await page.request.patch(`/api/operations/transport/trips/${trip!.id}/operation`, { data: { operationId: operation!.id } });
    expect(response.status()).toBe(200);

    const refreshed = await page.request.get("/api/data/tenant?section=operations&q=VJ-2026-00002&pageSize=10");
    const refreshedData = (await refreshed.json() as { data: TransportData }).data;
    expect(refreshedData.trips[0].operation?.id).toBe(operation!.id);
  });

  test("muestra el avance de operaciones en la interfaz", async ({ page }) => {
    await login(page);
    await page.goto(`/t/${slug}/operations`);
    await expect(page.getByRole("heading", { name: "Operaciones, viajes y trazabilidad" })).toBeVisible();
    await page.getByRole("tab", { name: /^Operaciones Agrupación logística/ }).click();
    await expect(page.getByRole("heading", { name: "Operaciones logísticas" })).toBeVisible();
    await expect(page.getByText("OP-2026-00001 · Plan de distribución costa sur").first()).toBeVisible();
    await expect(page.getByText(/pendientes.*activos.*entregados/i).first()).toBeVisible();
    await page.getByRole("tab", { name: /^Historial Trazabilidad de ensambles/ }).click();
    await expect(page.getByRole("heading", { name: "Historial de ensambles y movimientos" })).toBeVisible();
  });

  test("resume mantenimiento por placa y tipo", async ({ page }) => {
    await login(page);
    const workspace = await page.request.get("/api/data/tenant?section=maintenance&pageSize=25");
    const data = (await workspace.json() as { data: TransportData }).data;
    expect(data.maintenanceSummary.find((item) => item.plate === "BXT-841")).toMatchObject({ preventive: 1, completed: 1 });
    expect(data.maintenanceSummary.find((item) => item.plate === "D9K-226")).toMatchObject({ inspections: 1, completed: 1 });
    expect(data.maintenanceSummary.find((item) => item.plate === "A7P-315")).toMatchObject({ corrective: 1, open: 1 });
    await page.goto(`/t/${slug}/maintenance`);
    const history = page.locator(".table-card").filter({ has: page.getByRole("heading", { name: "Mantenimientos por unidad" }) });
    await expect(history).toBeVisible();
    await expect(history.getByText("BXT-841", { exact: true })).toBeVisible();
  });

  test("ensambla tracto, carreta, piloto y segundo piloto sin duplicidades", async ({ page }) => {
    await login(page);
    const workspace = await page.request.get("/api/data/tenant?section=operations&pageSize=200");
    const base = (await workspace.json() as { data: TransportData }).data;
    const customerId = base.parties.find((item) => item.kind === "CUSTOMER" && item.active)!.id;
    const routeId = base.routes.find((item) => item.active)!.id;
    const startsAt = new Date(Date.now() + 12 * 86_400_000);
    startsAt.setUTCHours(8, 0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 8 * 3_600_000);
    const anchor = startsAt.toISOString();
    const dueAt = new Date(startsAt.getTime() + 365 * 86_400_000).toISOString();

    const create = async (path: string, data: object) => {
      const response = await page.request.post(`/api/operations/transport/${path}`, { data });
      const payload = await response.json() as { id: string };
      expect(response.status(), JSON.stringify(payload)).toBe(200);
      return payload;
    };
    const vehicleA = await create("vehicles", { plate: "ENS-101", brand: "Volvo", model: "FH", year: 2025, type: "TRACTO", capacityKg: 32000, odometerKm: 1000, technicalDueAt: dueAt, soatDueAt: dueAt });
    const vehicleB = await create("vehicles", { plate: "ENS-102", brand: "Scania", model: "R450", year: 2025, type: "TRACTO", capacityKg: 32000, odometerKm: 1000, technicalDueAt: dueAt, soatDueAt: dueAt });
    const trailer = await create("trailers", { plate: "CAR-101", brand: "Randon", model: "SR", type: "PLATAFORMA", capacityKg: 30000 });
    const driver = async (documentNo: string, firstName: string) => create("drivers", { documentNo, firstName, lastName: "Prueba Ensamble", licenseNo: `LIC-${documentNo}`, licenseClass: "AIIIB", licenseDueAt: dueAt, workRegimeName: "30x1", workDays: 30, restDays: 1, workCycleAnchor: anchor });
    const pilot = await driver("70100101", "Piloto");
    const secondPilot = await driver("70100102", "Segundo");
    const reliefPilot = await driver("70100103", "Relevo");
    const trip = async (cargoDescription: string) => create("trips", { customerId, routeId, serviceType: "Carga completa", cargoDescription, scheduledStartAt: startsAt.toISOString(), scheduledEndAt: endsAt.toISOString(), priority: "NORMAL", freight: 1500, budget: 800 });
    const primaryTrip = await trip("Ensamble principal QA");
    const overlapTrip = await trip("Ensamble superpuesto QA");

    const preset = await create("resource-presets", { vehicleId: vehicleA.id, trailerIds: [trailer.id], driverIds: [pilot.id, secondPilot.id] });
    const assigned = await page.request.post(`/api/operations/transport/trips/${primaryTrip.id}/assign`, { data: { presetId: preset.id, reason: "Doble tripulación QA" } });
    expect(assigned.status()).toBe(200);
    const refreshed = await page.request.get("/api/data/tenant?section=operations&q=Ensamble principal QA&pageSize=20");
    const data = (await refreshed.json() as { data: TransportData }).data;
    expect(data.trips.find((item) => item.id === primaryTrip.id)?.assignments[0]).toMatchObject({
      status: "ACTIVE",
      vehicle: { id: vehicleA.id, plate: "ENS-101" },
      trailer: { id: trailer.id, plate: "CAR-101" },
      driver: { id: pilot.id },
      secondDriver: { id: secondPilot.id },
    });

    const duplicateDriver = await page.request.post("/api/operations/transport/resource-presets", { data: { vehicleId: vehicleB.id, driverIds: [pilot.id, pilot.id] } });
    expect(duplicateDriver.status()).toBe(400);
    for (const resources of [
      { vehicleId: vehicleB.id, driverIds: [secondPilot.id, reliefPilot.id] },
      { vehicleId: vehicleA.id, driverIds: [reliefPilot.id] },
      { vehicleId: vehicleB.id, trailerIds: [trailer.id], driverIds: [reliefPilot.id] },
    ]) {
      const conflictingPreset = await create("resource-presets", resources);
      const conflict = await page.request.post(`/api/operations/transport/trips/${overlapTrip.id}/assign`, { data: { presetId: conflictingPreset.id } });
      expect(conflict.status()).toBe(409);
      expect((await conflict.json()).error.code).toBe("RESOURCE_CONFLICT");
    }
  });
});
