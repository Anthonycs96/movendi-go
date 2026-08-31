import { expect, type Page, test } from "@playwright/test";
import type { TransportData } from "@movendi/contracts";

const password = "Nexo2026!";
const slug = "andes-cargo";

type ApiResult = { status: number; json: { ok?: boolean; id?: string; error?: { code: string }; data?: TransportData; [key: string]: unknown } };
let customerId = "";
let originId = "";
let routeId = "";
let vehicleId = "";
let restDriverId = "";
let workDriverId = "";
let tripId = "";
let overlapTripId = "";
let incidentId = "";
let expenseId = "";
let settlementId = "";

async function login(page: Page, email = "admin@andes.local", businessSlug = slug) {
  await page.goto("/login");
  const passwordInput = page.getByLabel(/^Contraseña$/i);
  await page.waitForFunction(() => { const button = document.querySelector<HTMLButtonElement>('button[aria-label="Mostrar contraseña"]'); return Boolean(button && button.onclick !== null); });
  await page.getByRole("button", { name: "Mostrar contraseña" }).click();
  await expect(passwordInput).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Ocultar contraseña" }).click();
  await expect(passwordInput).toHaveAttribute("type", "password");
  await page.getByLabel(/Correo electrónico/i).fill(email);
  const platformAccess = email === "superadmin@multisaas.local";
  if (platformAccess) {
    await expect(page.getByLabel("Tipo de acceso")).toHaveValue(/Super Admin/i);
  } else {
    const businessPicker = page.getByRole("button", { name: "Negocio" });
    await expect(businessPicker).toBeVisible();
    if (await businessPicker.getAttribute("aria-expanded") === "false") {
      await businessPicker.click();
      const option = page.getByRole("option").filter({ hasText: businessSlug === slug ? "Andes Cargo" : businessSlug });
      if (await option.count()) await option.click();
    }
  }
  await passwordInput.fill(password);
  await page.getByRole("button", { name: "Entrar al sistema" }).click();
  await expect(page).toHaveURL(platformAccess ? /\/platform\/dashboard$/ : new RegExp(`/t/${businessSlug}/dashboard$`));
}

async function api(page: Page, url: string, method = "GET", body?: unknown): Promise<ApiResult> {
  return page.evaluate(async ({ url, method, body }) => {
    const response = await fetch(url, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, json: await response.json() };
  }, { url, method, body });
}

function ok(result: ApiResult) { expect(result.status, JSON.stringify(result.json)).toBeLessThan(300); expect(result.json.ok).toBe(true); }
function fails(result: ApiResult, status: number, code: string) { expect(result.status, JSON.stringify(result.json)).toBe(status); expect(result.json.error?.code).toBe(code); }
function entityId(result: ApiResult) { expect(result.json.id).toBeTruthy(); return result.json.id!; }
function transportData(result: ApiResult) { expect(result.json.data).toBeTruthy(); return result.json.data!; }

test.describe.serial("30 escenarios reales de Transporte V2", () => {
  test("[01/30] seguridad: anónimo no puede consultar Transporte", async ({ request }) => {
    const response = await request.post("/api/operations/transport/trips", { data: {} });
    expect(response.status()).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHORIZED");

    const invalidLogin = { email: "intruso-throttle@andes.local", password: "incorrecta", businessSlug: slug, rememberSession: false };
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const denied = await request.post("/api/auth/login", { data: invalidLogin });
      expect(denied.status()).toBe(401);
    }
    const blocked = await request.post("/api/auth/login", { data: invalidLogin });
    expect(blocked.status()).toBe(429);
    expect(blocked.headers()["retry-after"]).toBeTruthy();
    expect((await blocked.json()).error.code).toBe("LOGIN_RATE_LIMITED");
  });

  test("[02/30] acceso: administrador inicia sesión en Andes Cargo", async ({ page }) => {
    await login(page);
    await expect(page.getByRole("heading", { name: "Centro de control operativo" })).toBeVisible();
  });

  test("[03/30] panel: muestra métricas y datos realistas", async ({ page }) => {
    await login(page);
    await expect(page.getByText("Viajes activos")).toBeVisible();
    await expect(page.getByText("VJ-2026-00001")).toBeVisible();
    await expect(page.getByText(/incidentes requieren atención/i)).toBeVisible();

    const fleetResponse = await page.request.get("/api/data/tenant?section=fleet");
    expect(fleetResponse.status()).toBe(200);
    expect(fleetResponse.headers()["x-workspace-scope"]).toBe("transport:fleet");
    expect(fleetResponse.headers()["server-timing"]).toMatch(/^workspace;dur=/);
    const fleetWorkspace = await fleetResponse.json();
    expect(fleetWorkspace.data.vehicles.length).toBeGreaterThan(0);
    expect(fleetWorkspace.data.trailers.length).toBeGreaterThan(0);
    expect(fleetWorkspace.data.trips).toEqual([]);
    expect(fleetWorkspace.data.expenses).toEqual([]);
    expect(fleetWorkspace.core.users).toEqual([]);

    const settingsResponse = await page.request.get("/api/data/tenant?section=settings");
    const settingsWorkspace = await settingsResponse.json();
    expect(settingsWorkspace.data.parties.length).toBeGreaterThan(0);
    expect(settingsWorkspace.data.vehicles).toEqual([]);
    expect(settingsWorkspace.core.users.length).toBeGreaterThan(0);
  });

  test("[04/30] navegación: las 11 áreas cargan sin error", async ({ page }) => {
    await login(page);
    const views = [["dashboard", "Centro de control operativo"], ["operations", "Operaciones, viajes y trazabilidad"], ["fleet", "Flota operativa"], ["drivers", "Conductores, jornadas y descansos"], ["documents", "Documentos y vigencias"], ["finance", "Gastos, pagos y liquidaciones"], ["fuel", "Control de combustible"], ["maintenance", "Mantenimiento e inventario"], ["tires", "Gestión de neumáticos"], ["reports", "Rentabilidad y desempeño"], ["settings", "Configuración de Transporte"]] as const;
    for (const label of ["Centro operativo", "Operaciones", "Flota", "Conductores", "Documentos", "Finanzas", "Combustible", "Mantenimiento", "Neumáticos", "Reportes", "Configuración"]) {
      await expect(page.getByRole("link", { name: new RegExp(label, "i") }).first()).toBeVisible();
    }
    for (const [route, heading] of views) {
      const response = await page.goto(`/t/${slug}/${route}`);
      expect(response?.status()).toBeLessThan(400);
      await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
    }
  });

  test("[05/30] RBAC: despachador no ve finanzas ni configuración", async ({ page }) => {
    await login(page, "despacho@andes.local");
    await expect(page.getByRole("link", { name: /Finanzas/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Configuración/ })).toHaveCount(0);
  });

  test("[06/30] RBAC: despachador no registra pagos", async ({ page }) => {
    await login(page, "despacho@andes.local");
    fails(await api(page, "/api/operations/transport/payments", "POST", { direction: "IN" }), 403, "FORBIDDEN");
  });

  test("[07/30] RBAC: finanzas no modifica operaciones", async ({ page }) => {
    await login(page, "finanzas@andes.local");
    fails(await api(page, "/api/operations/transport/trips", "POST", {}), 403, "FORBIDDEN");
  });

  test("[08/30] aislamiento vertical: Transporte no escribe en Restaurante", async ({ page }) => {
    await login(page);
    fails(await api(page, "/api/operations/restaurant/customers", "POST", { name: "Intruso" }), 403, "MODULE_ACCESS_DENIED");
  });

  test("[09/30] Super Admin: catálogo y negocio Transporte están disponibles", async ({ page }) => {
    await login(page, "superadmin@multisaas.local");
    await page.goto("/platform/catalog");
    await expect(page.getByRole("heading", { name: "Rubros y módulos" })).toBeVisible();
    await expect(page.getByText("Transporte y logística", { exact: true })).toBeVisible();
  });

  test("[10/30] maestros: crea cliente con RUC realista", async ({ page }) => {
    await login(page);
    const result = await api(page, "/api/operations/transport/parties", "POST", { kind: "CUSTOMER", documentType: "RUC", documentNo: "20612345991", legalName: "Comercializadora Pacífico Norte S.A.C.", tradeName: "Pacífico Norte", contactName: "Ana Cárdenas", phone: "989700100", email: "logistica@pacificonorte.test", address: "Av. Industrial 450, Lima" });
    ok(result); customerId = entityId(result);
  });

  test("[11/30] maestros: rechaza cliente duplicado", async ({ page }) => {
    await login(page);
    fails(await api(page, "/api/operations/transport/parties", "POST", { kind: "CUSTOMER", documentType: "RUC", documentNo: "20612345991", legalName: "Duplicado S.A.C." }), 409, "DUPLICATE_RECORD");
  });

  test("[12/30] maestros: crea nueva ubicación", async ({ page }) => {
    await login(page);
    const result = await api(page, "/api/operations/transport/locations", "POST", { code: "LURIN-QA", name: "Planta Industrial Lurín", address: "Panamericana Sur km 32", district: "Lurín", province: "Lima", department: "Lima", latitude: -12.29, longitude: -76.87 });
    ok(result); originId = entityId(result);
  });

  test("[13/30] rutas: rechaza origen igual a destino", async ({ page }) => {
    await login(page);
    fails(await api(page, "/api/operations/transport/routes", "POST", { code: "BAD-QA", name: "Ruta inválida", originId, destinationId: originId, distanceKm: 10, estimatedMinutes: 30, tollEstimate: 0, baseFreight: 100 }), 400, "SAME_LOCATION");
  });

  test("[14/30] rutas: crea ruta Lurín–Huachipa", async ({ page }) => {
    await login(page);
    const workspace = transportData(await api(page, "/api/data/tenant"));
    const destinationId = workspace.locations.find((item) => item.code === "HUACHIPA")!.id;
    const result = await api(page, "/api/operations/transport/routes", "POST", { code: "LUR-HUA-QA", name: "Lurín - Huachipa QA", originId, destinationId, distanceKm: 58.5, estimatedMinutes: 180, tollEstimate: 12.5, baseFreight: 1150 });
    ok(result); routeId = entityId(result);
  });

  test("[15/30] flota: registra vehículo con vigencias futuras", async ({ page }) => {
    await login(page);
    const result = await api(page, "/api/operations/transport/vehicles", "POST", { plate: "QAZ-901", brand: "Mercedes-Benz", model: "Actros 2651", year: 2025, type: "TRACTO", capacityKg: 32000, odometerKm: 12500, technicalDueAt: "2035-06-30", soatDueAt: "2035-12-31", gpsDeviceId: "GPS-QA-901" });
    ok(result); vehicleId = entityId(result);
  });

  test("[16/30] flota: impide retroceder odómetro", async ({ page }) => {
    await login(page);
    fails(await api(page, `/api/operations/transport/vehicles/${vehicleId}`, "PATCH", { plate: "QAZ-901", brand: "Mercedes-Benz", model: "Actros 2651", year: 2025, type: "TRACTO", capacityKg: 32000, odometerKm: 12000, technicalDueAt: "2035-06-30", soatDueAt: "2035-12-31", gpsDeviceId: "GPS-QA-901", active: true, status: "AVAILABLE" }), 409, "ODOMETER_ROLLBACK");
  });

  test("[17/30] jornadas: crea conductor cuyo ciclo marca descanso", async ({ page }) => {
    await login(page);
    const result = await api(page, "/api/operations/transport/drivers", "POST", { documentNo: "47881120", firstName: "Renato", lastName: "Cruz Valle", phone: "987701201", licenseNo: "C47881120", licenseClass: "AIIIB", licenseDueAt: "2035-12-31", hireDate: "2028-01-10", workRegimeName: "1x1 QA", workDays: 1, restDays: 1, workCycleAnchor: "2030-02-09" });
    ok(result); restDriverId = entityId(result);
  });

  test("[18/30] viajes: rechaza programación en el pasado", async ({ page }) => {
    await login(page);
    fails(await api(page, "/api/operations/transport/trips", "POST", { customerId, routeId, serviceType: "Carga completa", cargoDescription: "Mercadería QA", cargoWeightKg: 15000, scheduledStartAt: "2020-02-10T08:00:00", scheduledEndAt: "2020-02-10T12:00:00", priority: "NORMAL", freight: 1800, budget: 900 }), 400, "DATE_IN_PAST");
  });

  test("[19/30] viajes: crea servicio válido", async ({ page }) => {
    await login(page);
    const result = await api(page, "/api/operations/transport/trips", "POST", { customerId, routeId, serviceType: "Carga completa", cargoDescription: "Equipos de refrigeración", cargoWeightKg: 14500, scheduledStartAt: "2030-02-10T08:00:00", scheduledEndAt: "2030-02-10T12:00:00", priority: "HIGH", referenceNo: "QA-OC-1001", notes: "Manipulación cuidadosa", freight: 1850, budget: 920 });
    ok(result); tripId = entityId(result);
  });

  test("[20/30] asignación: bloquea conductor en descanso programado", async ({ page }) => {
    await login(page);
    fails(await api(page, `/api/operations/transport/trips/${tripId}/assign`, "POST", { vehicleId, driverId: restDriverId }), 409, "DRIVER_SCHEDULED_REST");
  });

  test("[21/30] asignación: conductor hábil queda asignado", async ({ page }) => {
    await login(page);
    const driver = await api(page, "/api/operations/transport/drivers", "POST", { documentNo: "47881121", firstName: "Lucía", lastName: "Torres Vega", phone: "987701202", licenseNo: "T47881121", licenseClass: "AIIIB", licenseDueAt: "2035-12-31", hireDate: "2028-02-10", workRegimeName: "6x1 QA", workDays: 6, restDays: 1, workCycleAnchor: "2030-02-10" });
    ok(driver); workDriverId = entityId(driver);
    ok(await api(page, `/api/operations/transport/trips/${tripId}/assign`, "POST", { vehicleId, driverId: workDriverId, reason: "Plan de despacho QA" }));
  });

  test("[22/30] asignación: detecta solapamiento por intervalo", async ({ page }) => {
    await login(page);
    const created = await api(page, "/api/operations/transport/trips", "POST", { customerId, routeId, serviceType: "Distribución", cargoDescription: "Segundo servicio superpuesto", cargoWeightKg: 8000, scheduledStartAt: "2030-02-10T10:00:00", scheduledEndAt: "2030-02-10T14:00:00", priority: "NORMAL", freight: 900, budget: 400 });
    ok(created); overlapTripId = entityId(created);
    fails(await api(page, `/api/operations/transport/trips/${overlapTripId}/assign`, "POST", { vehicleId, driverId: workDriverId }), 409, "RESOURCE_CONFLICT");
  });

  test("[23/30] estados: rechaza salto DRAFT a DELIVERED", async ({ page }) => {
    await login(page);
    fails(await api(page, `/api/operations/transport/trips/${overlapTripId}/status`, "PATCH", { status: "DELIVERED" }), 409, "INVALID_STATUS_TRANSITION");
  });

  test("[24/30] trazabilidad: registra posición GPS", async ({ page }) => {
    await login(page);
    ok(await api(page, `/api/operations/transport/trips/${tripId}/tracking`, "POST", { type: "POSITION", recordedAt: "2030-02-10T09:15:00", latitude: -12.15, longitude: -76.95, odometerKm: 12532.4, description: "Cruce Villa", source: "GPS" }));
  });

  test("[25/30] incidentes: reporta y resuelve una avería", async ({ page }) => {
    await login(page);
    const created = await api(page, `/api/operations/transport/trips/${tripId}/incidents`, "POST", { type: "BREAKDOWN", severity: "HIGH", occurredAt: "2030-02-10T09:30:00", description: "Pérdida de presión detectada en rueda posterior" });
    ok(created); incidentId = entityId(created);
    ok(await api(page, `/api/operations/transport/incidents/${incidentId}/resolve`, "PATCH", { resolution: "Se reemplazó la rueda con el repuesto de emergencia" }));
  });

  test("[26/30] gastos: crea, aprueba y conserva trazabilidad", async ({ page }) => {
    await login(page);
    const created = await api(page, "/api/operations/transport/expenses", "POST", { tripId, category: "TOLL", description: "Peaje ruta QA", amount: 18.5, occurredAt: "2030-02-10T08:40:00", receiptNo: "PEAJE-QA-001" });
    ok(created); expenseId = entityId(created);
    ok(await api(page, `/api/operations/transport/expenses/${expenseId}/status`, "PATCH", { status: "APPROVED" }));
  });

  test("[27/30] liquidación: calcula pero impide cerrar antes de entrega", async ({ page }) => {
    await login(page);
    const calculated = await api(page, `/api/operations/transport/settlements/${tripId}/calculate`, "POST");
    ok(calculated); settlementId = entityId(calculated);
    fails(await api(page, `/api/operations/transport/settlements/${settlementId}/close`, "POST"), 409, "TRIP_NOT_DELIVERED");
  });

  test("[28/30] cierre real: inicia, entrega, recalcula y persiste liquidación", async ({ page }) => {
    await login(page);
    ok(await api(page, `/api/operations/transport/trips/${tripId}/status`, "PATCH", { status: "IN_TRANSIT" }));
    ok(await api(page, `/api/operations/transport/trips/${tripId}/status`, "PATCH", { status: "DELIVERED" }));
    ok(await api(page, `/api/operations/transport/settlements/${tripId}/calculate`, "POST"));
    ok(await api(page, `/api/operations/transport/settlements/${settlementId}/close`, "POST"));
    const workspace = transportData(await api(page, "/api/data/tenant"));
    expect(workspace.settlements.find((item) => item.id === settlementId)?.status).toBe("CLOSED");
  });

  test("[29/30] combustible y mantenimiento: valida odómetro y completa OT", async ({ page }) => {
    await login(page);
    fails(await api(page, "/api/operations/transport/fuel", "POST", { vehicleId, loadedAt: "2030-02-10T07:00:00", station: "Primax QA", liters: 50, price: 16, odometerKm: 12000 }), 409, "ODOMETER_ROLLBACK");
    ok(await api(page, "/api/operations/transport/fuel", "POST", { vehicleId, loadedAt: "2030-02-10T07:00:00", station: "Primax QA", liters: 50, price: 16, odometerKm: 12550, invoiceNo: "F-QA-001" }));
    const order = await api(page, "/api/operations/transport/maintenance", "POST", { vehicleId, type: "PREVENTIVE", title: "Cambio de aceite 15 mil km", description: "Mantenimiento QA", priority: "NORMAL", scheduledAt: "2030-02-11T08:00:00", odometerKm: 12550, estimated: 680 });
    ok(order);
    const orderId = entityId(order);
    ok(await api(page, `/api/operations/transport/maintenance/${orderId}/status`, "PATCH", { status: "IN_PROGRESS", actual: 0 }));
    ok(await api(page, `/api/operations/transport/maintenance/${orderId}/status`, "PATCH", { status: "COMPLETED", actual: 645, completedAt: "2030-02-11T12:00:00" }));
  });

  test("[30/30] inventario, neumáticos, aislamiento y responsive", async ({ page }) => {
    await login(page);
    const targetVehicleId = vehicleId || "vehicle-b";
    const item = await api(page, "/api/operations/transport/inventory", "POST", { sku: "QA-FLT-001", name: "Filtro combustible QA", unit: "UND", minimumStock: 2, unitCost: 120 });
    ok(item);
    const itemId = entityId(item);
    fails(await api(page, `/api/operations/transport/inventory/${itemId}/movements`, "POST", { type: "OUT", quantity: 1 }), 409, "INSUFFICIENT_STOCK");
    ok(await api(page, `/api/operations/transport/inventory/${itemId}/movements`, "POST", { type: "IN", quantity: 4, reference: "OC-QA-1" }));
    const tire = await api(page, "/api/operations/transport/tires", "POST", { serialNo: "QA-TIRE-0001", brand: "Goodyear", model: "KMax", size: "295/80R22.5", purchaseAt: "2030-01-15", purchase: 2200, initialTreadMm: 18 });
    ok(tire);
    const tireId = entityId(tire);
    fails(await api(page, `/api/operations/transport/tires/${tireId}/events`, "POST", { type: "INSTALL", vehicleId: "vehicle-a", position: "DEL-IZQ", treadMm: 18, odometerKm: 184500, cost: 0, occurredAt: "2030-02-12T08:00:00" }), 409, "TIRE_POSITION_OCCUPIED");
    ok(await api(page, `/api/operations/transport/tires/${tireId}/events`, "POST", { type: "INSTALL", vehicleId: targetVehicleId, position: "POS-EXT-DER", treadMm: 18, odometerKm: 12550, cost: 0, occurredAt: "2030-02-12T08:00:00" }));
    const core = transportData(await api(page, "/api/data/tenant"));
    expect(core.parties.some((item) => item.legalName.includes("Nova"))).toBe(false);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/t/${slug}/dashboard`);
    await expect(page.getByRole("heading", { name: "Centro de control operativo" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});
