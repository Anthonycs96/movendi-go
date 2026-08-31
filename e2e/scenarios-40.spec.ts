import { expect, type Page, test } from "@playwright/test";

const password = "Nexo2026!";

async function login(page: Page, email: string, businessSlug: string) {
  await page.goto("/login");
  await page.getByLabel(/Correo electrónico/i).fill(email);
  await page.getByLabel(/^Negocio$/i).fill(businessSlug);
  await page.getByLabel(/^Contraseña$/i).fill(password);
  await page.getByRole("button", { name: "Entrar al sistema" }).click();
  await expect(page).toHaveURL(new RegExp(`/t/${businessSlug}/dashboard$`));
}

async function attemptLogin(page: Page, email: string, businessSlug: string, attemptedPassword: string) {
  await page.goto("/login");
  await page.getByLabel(/Correo electrónico/i).fill(email);
  await page.getByLabel(/^Negocio$/i).fill(businessSlug);
  await page.getByLabel(/^Contraseña$/i).fill(attemptedPassword);
  await page.getByRole("button", { name: "Entrar al sistema" }).click();
}

async function api(page: Page, url: string, method = "GET", body?: unknown) {
  return page.evaluate(async ({ url, method, body }) => {
    const response = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, json: await response.json() };
  }, { url, method, body });
}

function expectApiError(result: Awaited<ReturnType<typeof api>>, status: number, code: string) {
  expect(result.status).toBe(status);
  expect(result.json.error.code).toBe(code);
}

async function expectBusinessView(page: Page, email: string, slug: string, route: string, heading: string) {
  await login(page, email, slug);
  const response = await page.goto(`/t/${slug}/${route}`);
  expect(response?.status()).toBeLessThan(400);
  await expect(page.locator("main h1").first()).toHaveText(heading);
  await expect(page.getByRole("heading", { name: "Esta vista no está disponible" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

test.describe("matriz de 40 escenarios y variantes", () => {
  test("[01/40] acceso: presenta la identidad y no expone credenciales demo", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("MOVENDI GO", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tu operación completa, en un solo lugar." })).toBeVisible();
    await expect(page.getByText("Accesos de demostración")).toHaveCount(0);
  });

  test("[02/40] acceso: administrador de Barbería inicia sesión", async ({ page }) => {
    await login(page, "admin@nova.local", "nova-studio");
    await expect(page.getByRole("heading", { name: "Beauty" })).toBeVisible();
  });

  test("[03/40] acceso: administrador de Restaurante inicia sesión", async ({ page }) => {
    await login(page, "admin@brasa.local", "brasa-norte");
    await expect(page.getByRole("heading", { name: "Restaurante" })).toBeVisible();
  });

  test("[04/40] acceso: rechaza una contraseña incorrecta", async ({ page }) => {
    await attemptLogin(page, "admin@nova.local", "nova-studio", "ClaveIncorrecta2026!");
    await expect(page.locator(".auth-error")).toContainText("Credenciales o negocio incorrectos");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("[05/40] acceso: rechaza un identificador de negocio inexistente", async ({ page }) => {
    await attemptLogin(page, "admin@nova.local", "negocio-inexistente", password);
    await expect(page.locator(".auth-error")).toContainText("Credenciales o negocio incorrectos");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("[06/40] seguridad: un anónimo no consulta clientes del núcleo", async ({ request }) => {
    const response = await request.get("/api/operations/core/customers/customer-ana");
    expect(response.status()).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHORIZED");
  });

  test("[07/40] seguridad: un anónimo no escribe en Barbería", async ({ request }) => {
    const response = await request.post("/api/operations/barbershop/customers", { data: { name: "Anónimo" } });
    expect(response.status()).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHORIZED");
  });

  test("[08/40] seguridad: un anónimo no escribe en Restaurante", async ({ request }) => {
    const response = await request.post("/api/operations/restaurant/customers", { data: { name: "Anónimo" } });
    expect(response.status()).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHORIZED");
  });

  const barberViews = [
    { number: "09", route: "dashboard", heading: "Beauty" },
    { number: "10", route: "appointments", heading: "Reservas" },
    { number: "11", route: "clients", heading: "Clientes" },
    { number: "12", route: "team", heading: "Barberos y horarios" },
    { number: "13", route: "services", heading: "Servicios" },
    { number: "14", route: "checkout", heading: "Caja y ventas" },
    { number: "15", route: "settings", heading: "Configuración" },
  ];

  for (const view of barberViews) {
    test(`[${view.number}/40] Barbería: carga ${view.route} sin error ni desbordamiento`, async ({ page }) => {
      await expectBusinessView(page, "admin@nova.local", "nova-studio", view.route, view.heading);
    });
  }

  test("[16/40] Barbería: el rol Barbero respeta RBAC y no entra a configuración", async ({ page }) => {
    await login(page, "barbero@nova.local", "nova-studio");
    await expect(page.getByRole("link", { name: /Configuración/ })).toHaveCount(0);
    await page.goto("/t/nova-studio/settings");
    await expect(page.getByRole("heading", { name: "Esta vista no está disponible" })).toBeVisible();
  });

  test("[17/40] Barbería: crea un cliente con datos válidos", async ({ page }) => {
    await login(page, "admin@nova.local", "nova-studio");
    const result = await api(page, "/api/operations/barbershop/customers", "POST", {
      name: "Cliente escenario 17",
      phone: `95${Date.now().toString().slice(-7)}`,
      email: "escenario17@example.test",
    });
    expect(result.status).toBe(200);
    expect(result.json.ok).toBe(true);
  });

  test("[18/40] Barbería: rechaza un cliente con nombre demasiado corto", async ({ page }) => {
    await login(page, "admin@nova.local", "nova-studio");
    expectApiError(await api(page, "/api/operations/barbershop/customers", "POST", { name: "A" }), 400, "VALIDATION_ERROR");
  });

  test("[19/40] Barbería: rechaza un teléfono de cliente duplicado", async ({ page }) => {
    await login(page, "admin@nova.local", "nova-studio");
    expectApiError(await api(page, "/api/operations/barbershop/customers", "POST", { name: "Cliente duplicado", phone: "999111222" }), 409, "DUPLICATE_RECORD");
  });

  test("[20/40] Barbería: rechaza una comisión profesional mayor a 100", async ({ page }) => {
    await login(page, "admin@nova.local", "nova-studio");
    expectApiError(await api(page, "/api/operations/barbershop/staff", "POST", { name: "Comisión inválida", commissionPct: 101 }), 400, "VALIDATION_ERROR");
  });

  test("[21/40] Barbería: rechaza un servicio con duración inferior al mínimo", async ({ page }) => {
    await login(page, "admin@nova.local", "nova-studio");
    expectApiError(await api(page, "/api/operations/barbershop/services", "POST", { name: "Servicio corto", durationMinutes: 5, price: 20 }), 400, "VALIDATION_ERROR");
  });

  test("[22/40] Barbería: rechaza una cita programada en el pasado", async ({ page }) => {
    await login(page, "admin@nova.local", "nova-studio");
    expectApiError(await api(page, "/api/operations/barbershop/appointments", "POST", {
      customerId: "customer-ana", staffId: "staff-mateo", serviceId: "service-cut", startsAt: "2020-01-08T14:00",
    }), 400, "APPOINTMENT_IN_PAST");
  });

  test("[23/40] Barbería: rechaza una cita fuera del horario del profesional", async ({ page }) => {
    await login(page, "admin@nova.local", "nova-studio");
    expectApiError(await api(page, "/api/operations/barbershop/appointments", "POST", {
      customerId: "customer-ana", staffId: "staff-mateo", serviceId: "service-cut", startsAt: "2030-01-20T14:00",
    }), 409, "OUTSIDE_STAFF_SCHEDULE");
  });

  test("[24/40] Barbería: detecta una colisión entre dos citas", async ({ page }) => {
    await login(page, "admin@nova.local", "nova-studio");
    const first = await api(page, "/api/operations/barbershop/appointments", "POST", {
      customerId: "customer-ana", staffId: "staff-mateo", serviceId: "service-cut", startsAt: "2030-02-05T16:00",
    });
    expect(first.status).toBe(200);
    expectApiError(await api(page, "/api/operations/barbershop/appointments", "POST", {
      customerId: "customer-marco", staffId: "staff-mateo", serviceId: "service-cut", startsAt: "2030-02-05T16:20",
    }), 409, "SCHEDULE_CONFLICT");
  });

  const restaurantViews = [
    { number: "25", route: "dashboard", heading: "Restaurante" },
    { number: "26", route: "floor", heading: "Salón y pedidos" },
    { number: "27", route: "orders", heading: "Pedidos" },
    { number: "28", route: "kitchen", heading: "Cocina" },
    { number: "29", route: "clients", heading: "Clientes" },
    { number: "30", route: "menu", heading: "Carta y productos" },
    { number: "31", route: "checkout", heading: "Caja y ventas" },
    { number: "32", route: "settings", heading: "Salones y configuración general" },
  ];

  for (const view of restaurantViews) {
    test(`[${view.number}/40] Restaurante: carga ${view.route} sin error ni desbordamiento`, async ({ page }) => {
      await expectBusinessView(page, "admin@brasa.local", "brasa-norte", view.route, view.heading);
    });
  }

  test("[33/40] Restaurante: el rol Cocina respeta RBAC y conserva acceso operativo", async ({ page }) => {
    await login(page, "cocina@brasa.local", "brasa-norte");
    await expect(page.getByRole("link", { name: /Configuración/ })).toHaveCount(0);
    await page.goto("/t/brasa-norte/kitchen");
    await expect(page.getByRole("heading", { name: "Cocina" })).toBeVisible();
    await page.goto("/t/brasa-norte/settings");
    await expect(page.getByRole("heading", { name: "Esta vista no está disponible" })).toBeVisible();
  });

  test("[34/40] Restaurante: crea un cliente con datos válidos", async ({ page }) => {
    await login(page, "admin@brasa.local", "brasa-norte");
    const result = await api(page, "/api/operations/restaurant/customers", "POST", {
      name: "Comensal escenario 34",
      phone: `94${Date.now().toString().slice(-7)}`,
      notes: "Sin restricciones",
    });
    expect(result.status).toBe(200);
    expect(result.json.ok).toBe(true);
  });

  test("[35/40] Restaurante: rechaza un correo de cliente inválido", async ({ page }) => {
    await login(page, "admin@brasa.local", "brasa-norte");
    expectApiError(await api(page, "/api/operations/restaurant/customers", "POST", { name: "Correo inválido", email: "correo-sin-dominio" }), 400, "VALIDATION_ERROR");
  });

  test("[36/40] Restaurante: conserva un producto con precio igual a cero", async ({ page }) => {
    await login(page, "admin@brasa.local", "brasa-norte");
    const result = await api(page, "/api/operations/restaurant/products", "POST", {
      name: "Producto sin precio", categoryId: "category-entradas", price: 0, cost: 0,
    });
    expect(result.status).toBe(200);
    expect(result.json.ok).toBe(true);
  });

  test("[37/40] Restaurante: rechaza una mesa que excede la capacidad máxima", async ({ page }) => {
    await login(page, "admin@brasa.local", "brasa-norte");
    expectApiError(await api(page, "/api/operations/restaurant/tables", "POST", {
      name: "Mesa gigante", seats: 51, areaId: "area-main",
    }), 400, "VALIDATION_ERROR");
  });

  test("[38/40] Restaurante: abre y cancela un pedido restaurando la mesa", async ({ page }) => {
    await login(page, "admin@brasa.local", "brasa-norte");
    const created = await api(page, "/api/operations/restaurant/orders", "POST", {
      tableId: "table-2",
      items: [{ productId: "product-lomo", quantity: 2 }],
      notes: "Escenario 38",
    });
    expect(created.status).toBe(200);
    const cancelled = await api(page, `/api/operations/restaurant/orders/${created.json.id}/status`, "PATCH", { status: "CANCELLED" });
    expect(cancelled.status).toBe(200);
    await page.goto("/t/brasa-norte/floor");
    await expect(page.locator(".floor-table").filter({ hasText: "Mesa 2" })).toContainText("Libre");
  });

  test("[39/40] aislamiento: bloquea datos y vistas entre ambas empresas", async ({ page }) => {
    await login(page, "admin@nova.local", "nova-studio");
    expectApiError(await api(page, "/api/operations/core/customers/customer-brasa-rosa"), 404, "NOT_FOUND");
    expectApiError(await api(page, "/api/operations/restaurant/categories", "POST", { name: "No permitido" }), 403, "MODULE_ACCESS_DENIED");
    await page.goto("/t/brasa-norte/dashboard");
    await expect(page.getByRole("heading", { name: "Esta vista no está disponible" })).toBeVisible();

    await page.evaluate(async () => { await fetch("/api/auth/logout", { method: "POST" }); });
    await login(page, "admin@brasa.local", "brasa-norte");
    expectApiError(await api(page, "/api/operations/core/customers/customer-ana"), 404, "NOT_FOUND");
    expectApiError(await api(page, "/api/operations/barbershop/customers", "POST", { name: "No permitido" }), 403, "MODULE_ACCESS_DENIED");
    await page.goto("/t/nova-studio/dashboard");
    await expect(page.getByRole("heading", { name: "Esta vista no está disponible" })).toBeVisible();
  });

  test("[40/40] presentación: ambas verticales responden en móvil, tablet y escritorio", async ({ page }) => {
    test.setTimeout(120_000);
    const issues: string[] = [];
    page.on("pageerror", (error) => issues.push(`pageerror: ${error.message}`));
    page.on("console", (message) => { if (message.type() === "error") issues.push(`console: ${message.text()}`); });
    page.on("response", (response) => { if (response.status() >= 500) issues.push(`${response.status()} ${response.url()}`); });

    const viewports = [
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1440, height: 1000 },
    ];

    await login(page, "admin@nova.local", "nova-studio");
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (const route of ["dashboard", "appointments", "checkout"]) {
        const response = await page.goto(`/t/nova-studio/${route}`);
        expect(response?.status()).toBeLessThan(400);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      }
    }

    await page.evaluate(async () => { await fetch("/api/auth/logout", { method: "POST" }); });
    await login(page, "admin@brasa.local", "brasa-norte");
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (const route of ["dashboard", "floor", "kitchen", "checkout"]) {
        const response = await page.goto(`/t/brasa-norte/${route}`);
        expect(response?.status()).toBeLessThan(400);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      }
    }

    expect(issues).toEqual([]);
  });
});
