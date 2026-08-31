import { expect, type Page, test } from "@playwright/test";

const password = "Nexo2026!";

async function login(page: Page, email: string, businessSlug: string) {
  await page.goto("/login");
  await page.getByLabel(/Correo electrónico/i).fill(email);
  await page.getByLabel(/^Negocio$/i).fill(businessSlug);
  await page.getByLabel(/^Contraseña$/i).fill(password);
  await page.getByRole("button", { name: "Entrar al sistema" }).click();
  await page.waitForURL((url) => url.pathname === "/change-password" || url.pathname.endsWith("/dashboard"));
  if (new URL(page.url()).pathname === "/change-password") {
    const personalPassword = "Nexo2027!";
    await page.getByLabel("Contraseña temporal").fill(password);
    await page.getByLabel("Nueva contraseña", { exact: true }).fill(personalPassword);
    await page.getByLabel("Confirmar nueva contraseña").fill(personalPassword);
    await page.getByRole("button", { name: "Guardar y continuar" }).click();
  }
  await expect(page).toHaveURL(email === "superadmin@multisaas.local" ? /\/platform\/dashboard$/ : new RegExp(`/t/${businessSlug}/dashboard$`));
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

test.describe.serial("validación final ampliada", () => {
  test("identidad original, errores HTTP y reglas negativas de agenda", async ({ page, request }) => {
    await page.goto("/login");
    await expect(page.getByText("MOVENDI GO", { exact: true })).toBeVisible();
    await expect(page.getByRole("img", { name: "Movendi Go" })).toBeVisible();

    const anonymous = await request.get("/api/operations/core/customers/customer-ana");
    expect(anonymous.status()).toBe(401);
    expect((await anonymous.json()).error.code).toBe("UNAUTHORIZED");

    await login(page, "admin@nova.local", "nova-studio");

    const invalid = await api(page, "/api/operations/barbershop/customers", "POST", { name: "A" });
    expect(invalid.status).toBe(400);
    expect(invalid.json.error.code).toBe("VALIDATION_ERROR");

    const duplicate = await api(page, "/api/operations/barbershop/customers", "POST", { name: "Duplicado", phone: "999111222" });
    expect(duplicate.status).toBe(409);
    expect(duplicate.json.error.code).toBe("DUPLICATE_RECORD");

    const sunday = await api(page, "/api/operations/barbershop/appointments", "POST", {
      customerId: "customer-ana", staffId: "staff-mateo", serviceId: "service-cut", startsAt: "2030-01-20T14:00",
    });
    expect(sunday.status).toBe(409);
    expect(sunday.json.error.code).toBe("OUTSIDE_STAFF_SCHEDULE");

    const past = await api(page, "/api/operations/barbershop/appointments", "POST", {
      customerId: "customer-ana", staffId: "staff-mateo", serviceId: "service-cut", startsAt: "2020-01-08T14:00",
    });
    expect(past.status).toBe(400);
    expect(past.json.error.code).toBe("APPOINTMENT_IN_PAST");

    const firstAppointment = await api(page, "/api/operations/barbershop/appointments", "POST", {
      customerId: "customer-ana", staffId: "staff-mateo", serviceId: "service-cut", startsAt: "2030-02-05T16:00",
    });
    expect(firstAppointment.status).toBe(200);
    const collision = await api(page, "/api/operations/barbershop/appointments", "POST", {
      customerId: "customer-marco", staffId: "staff-mateo", serviceId: "service-cut", startsAt: "2030-02-05T16:20",
    });
    expect(collision.status).toBe(409);
    expect(collision.json.error.code).toBe("SCHEDULE_CONFLICT");

    const wrongVertical = await api(page, "/api/operations/restaurant/categories", "POST", { name: "No permitido" });
    expect(wrongVertical.status).toBe(403);
    expect(wrongVertical.json.error.code).toBe("MODULE_ACCESS_DENIED");

    const missing = await api(page, "/api/operations/barbershop/unknown", "POST", {});
    expect(missing.status).toBe(404);
  });

  test("barbería: CRUD lógico de profesionales y servicios", async ({ page }) => {
    await login(page, "admin@nova.local", "nova-studio");

    await page.goto("/t/nova-studio/team");
    await page.getByRole("button", { name: "Nuevo barbero" }).click();
    const newStaff = page.getByRole("dialog", { name: "Nuevo barbero" });
    await newStaff.getByLabel("Nombre").fill("Profesional CRUD E2E");
    await newStaff.getByLabel("Celular").fill("977700001");
    await newStaff.getByLabel("Especialidad").fill("Color");
    await newStaff.getByLabel("Comisión (%)").fill("35");
    await newStaff.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Barbero creado correctamente.")).toBeVisible();

    let staffCard = page.locator(".profile-card").filter({ hasText: "Profesional CRUD E2E" });
    await staffCard.getByRole("button", { name: "Horario" }).click();
    const schedule = page.getByRole("dialog", { name: "Horario de Profesional CRUD E2E" });
    await schedule.getByLabel("Día").selectOption("2");
    await schedule.getByLabel("Inicio").fill("10:00");
    await schedule.getByLabel("Fin").fill("17:00");
    await schedule.getByRole("button", { name: "Actualizar" }).click();
    await expect(page.getByText("Horario actualizado.")).toBeVisible();

    staffCard = page.locator(".profile-card").filter({ hasText: "Profesional CRUD E2E" });
    await staffCard.getByRole("button", { name: "Editar perfil" }).click();
    const editStaff = page.getByRole("dialog", { name: "Editar Profesional CRUD E2E" });
    await editStaff.getByLabel("Especialidad").fill("Color avanzado");
    await editStaff.getByLabel("Estado").selectOption("false");
    await editStaff.getByRole("button", { name: "Actualizar" }).click();
    await expect(staffCard).toContainText("Inactivo");

    await page.goto("/t/nova-studio/services");
    await page.getByRole("button", { name: "Nuevo servicio" }).click();
    const newService = page.getByRole("dialog", { name: "Nuevo servicio" });
    await newService.getByLabel("Nombre").fill("Servicio CRUD E2E");
    await newService.getByLabel("Categoría").fill("Pruebas");
    await newService.getByLabel("Duración (min)").fill("30");
    await newService.getByLabel("Precio (S/)").fill("25.50");
    await newService.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Servicio creado correctamente.")).toBeVisible();
    const serviceRow = page.getByRole("row").filter({ hasText: "Servicio CRUD E2E" });
    await serviceRow.getByRole("button", { name: "Editar" }).click();
    const editService = page.getByRole("dialog", { name: "Editar Servicio CRUD E2E" });
    await editService.getByLabel("Precio (S/)").fill("29.90");
    await editService.getByLabel("Estado").selectOption("false");
    await editService.getByRole("button", { name: "Actualizar" }).click();
    await expect(serviceRow).toContainText("Inactivo");
  });

  test("restaurante: CRUD lógico de cliente, carta, ambiente y mesa", async ({ page }) => {
    await login(page, "admin@brasa.local", "brasa-norte");

    await page.goto("/t/brasa-norte/clients");
    await page.getByRole("button", { name: "Nuevo cliente" }).click();
    const newCustomer = page.getByRole("dialog", { name: "Nuevo cliente" });
    await newCustomer.getByLabel("Nombre").fill("Cliente Restaurante CRUD");
    await newCustomer.getByLabel("Celular").fill("977700002");
    await newCustomer.getByRole("button", { name: "Guardar" }).click();
    const customerRow = page.getByRole("row").filter({ hasText: "Cliente Restaurante CRUD" });
    await customerRow.getByRole("button", { name: "Editar" }).click();
    const editCustomer = page.getByRole("dialog", { name: "Editar cliente" });
    await editCustomer.getByLabel("Preferencias").fill("Sin gluten");
    await editCustomer.getByLabel("Estado").selectOption("false");
    await editCustomer.getByRole("button", { name: "Actualizar" }).click();
    await expect(customerRow).toContainText("Inactivo");

    await page.goto("/t/brasa-norte/menu");
    await page.getByRole("button", { name: "Categoría", exact: true }).click();
    const newCategory = page.getByRole("dialog", { name: "Nueva categoría" });
    await newCategory.getByLabel("Nombre").fill("Categoría CRUD E2E");
    await newCategory.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Categoría creada correctamente.")).toBeVisible();
    await page.getByRole("button", { name: "Nuevo producto" }).click();
    const newProduct = page.getByRole("dialog", { name: "Nuevo producto" });
    await newProduct.getByLabel("Nombre").fill("Producto CRUD E2E");
    await newProduct.locator('select[name="categoryId"]').selectOption({ label: "Categoría CRUD E2E" });
    await newProduct.getByLabel("Precio (S/)").fill("18.90");
    await newProduct.getByRole("button", { name: "Guardar" }).click();
    const productRow = page.getByRole("row").filter({ hasText: "Producto CRUD E2E" });
    await productRow.getByRole("button", { name: "Editar" }).click();
    const editProduct = page.getByRole("dialog", { name: "Editar producto" });
    await editProduct.getByLabel("Estado").selectOption("false");
    await editProduct.getByRole("button", { name: "Actualizar" }).click();
    await expect(productRow).toContainText("Inactivo");

    await page.goto("/t/brasa-norte/settings");
    await page.getByRole("button", { name: "Ambiente", exact: true }).click();
    const newArea = page.getByRole("dialog", { name: "Nuevo ambiente" });
    await newArea.getByLabel("Nombre").fill("Patio CRUD E2E");
    await newArea.getByRole("button", { name: "Guardar" }).click();
    await page.getByRole("button", { name: "Mesa", exact: true }).click();
    const newTable = page.getByRole("dialog", { name: "Nueva mesa" });
    await newTable.getByLabel("Nombre").fill("Mesa CRUD E2E");
    await newTable.getByLabel("Personas").fill("5");
    await newTable.getByLabel("Ambiente").selectOption({ label: "Patio CRUD E2E" });
    await newTable.getByRole("button", { name: "Guardar" }).click();
    const tableRow = page.getByRole("row").filter({ hasText: "Mesa CRUD E2E" });
    await tableRow.getByRole("button", { name: "Editar" }).click();
    const editTable = page.getByRole("dialog", { name: "Editar mesa" });
    await editTable.getByLabel("Estado").selectOption("false");
    await editTable.getByRole("button", { name: "Actualizar" }).click();
    await expect(tableRow).toContainText("Inactiva");
  });

  test("administración: empresa nueva, rol, usuario, permisos y aislamiento", async ({ page }) => {
    await login(page, "superadmin@multisaas.local", "nova-studio");
    await page.goto("/t/nova-studio/settings");
    await page.getByRole("button", { name: "Empresa nueva" }).click();
    const company = page.getByRole("dialog", { name: "Nueva empresa" });
    await company.getByLabel("Razón comercial").fill("Empresa E2E Aislada");
    await company.getByLabel("Nombre corto").fill("Empresa E2E");
    await company.getByLabel("Identificador").fill("empresa-e2e-aislada");
    await company.getByLabel("Tipo").selectOption("BARBERSHOP");
    await company.getByLabel("Sede inicial").fill("Sede E2E");
    await company.getByLabel("Administrador", { exact: true }).fill("Administrador Empresa E2E");
    await company.getByLabel("Correo del administrador").fill("admin@empresa-e2e.local");
    await company.getByLabel("Contraseña temporal").fill(password);
    await company.getByRole("button", { name: "Crear empresa" }).click();
    await expect(page.getByText("Empresa, sede, suscripción y administrador creados correctamente.")).toBeVisible();

    const duplicateTenant = await api(page, "/api/operations/platform/tenants", "POST", {
      name: "Duplicada", shortName: "Duplicada", slug: "empresa-e2e-aislada", type: "BARBERSHOP", branchName: "Principal",
      adminName: "Otro Admin", adminEmail: "otro@empresa-e2e.local", adminPassword: password,
    });
    expect(duplicateTenant.status).toBe(409);
    expect(duplicateTenant.json.error.code).toBe("TENANT_EXISTS");

    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await login(page, "admin@empresa-e2e.local", "empresa-e2e-aislada");
    await expect(page.getByRole("heading", { name: "Beauty" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Beauty" })).toBeVisible();

    const forbiddenPlatform = await api(page, "/api/operations/platform/tenants", "POST", {});
    expect(forbiddenPlatform.status).toBe(403);
    await page.goto("/t/empresa-e2e-aislada/settings");
    await expect(page.getByRole("button", { name: "Empresa nueva" })).toHaveCount(0);

    await page.getByRole("button", { name: "Rol", exact: true }).click();
    const role = page.getByRole("dialog", { name: "Nuevo rol" });
    await role.getByLabel("Clave").fill("RECEPTION_E2E");
    await role.getByLabel("Nombre").fill("Recepción E2E");
    await role.getByRole("checkbox", { name: /Ver el resumen del negocio/ }).check();
    await role.getByRole("checkbox", { name: /^Ver clientes/ }).check();
    await role.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Rol creado correctamente.")).toBeVisible();

    await page.getByRole("button", { name: "Usuario", exact: true }).click();
    const user = page.getByRole("dialog", { name: "Nuevo usuario" });
    await user.getByLabel("Nombre").fill("Recepción Empresa E2E");
    await user.getByLabel("Correo").fill("recepcion@empresa-e2e.local");
    await user.getByLabel("Contraseña temporal").fill(password);
    await user.getByLabel("Rol").selectOption({ label: "Recepción E2E" });
    await user.getByLabel("Sucursal").selectOption({ label: "Sede E2E" });
    await user.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Usuario creado y vinculado a la empresa.")).toBeVisible();

    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await login(page, "recepcion@empresa-e2e.local", "empresa-e2e-aislada");
    await expect(page.getByRole("link", { name: /Configuración/ })).toHaveCount(0);
    const crossTenantRead = await api(page, "/api/operations/core/customers/customer-ana");
    expect(crossTenantRead.status).toBe(404);
    await page.goto("/t/empresa-e2e-aislada/settings");
    await expect(page.getByRole("heading", { name: "Esta vista no está disponible" })).toBeVisible();
  });

  test("tablas: búsqueda, ordenamiento y paginación", async ({ page }) => {
    await login(page, "admin@nova.local", "nova-studio");
    for (let index = 0; index < 9; index += 1) {
      const result = await api(page, "/api/operations/barbershop/customers", "POST", {
        name: `Cliente Paginación ${String(index).padStart(2, "0")}`,
        phone: `9666000${String(index).padStart(2, "0")}`,
      });
      expect(result.status).toBe(200);
    }
    await page.goto("/t/nova-studio/clients");
    const sortButton = page.getByRole("button", { name: "Ordenar por Cliente" });
    await sortButton.click();
    await expect(sortButton.locator("xpath=ancestor::th")).toHaveAttribute("aria-sort", "ascending");
    await expect(page.getByText(/1 \/ 2/)).toBeVisible();
    await page.getByRole("button", { name: "Página siguiente" }).click();
    await expect(page.getByText(/2 \/ 2/)).toBeVisible();
    await page.getByPlaceholder(/Buscar por nombre/).fill("Paginación 08");
    await expect(page.getByText("1 clientes")).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "Cliente Paginación 08" })).toBeVisible();
  });

  test("matriz responsive, modales, tema y consola en todas las vistas", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const issues: string[] = [];
    page.on("pageerror", (error) => issues.push(`pageerror: ${error.message}`));
    page.on("console", (message) => { if (message.type() === "error") issues.push(`console: ${message.text()}`); });
    page.on("response", (response) => { if (response.status() >= 400) issues.push(`${response.status()} ${response.url()}`); });

    const viewports = [
      { name: "desktop", width: 1440, height: 1000 },
      { name: "laptop", width: 1280, height: 800 },
      { name: "tablet", width: 768, height: 1024 },
      { name: "mobile", width: 390, height: 844 },
    ];
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const response = await page.goto("/login");
      expect(response?.status()).toBeLessThan(400);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    await login(page, "admin@nova.local", "nova-studio");
    await expect(page.getByRole("button", { name: "Buscar en la aplicación" })).toBeVisible();
    const themeWasDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    await page.getByRole("button", { name: /^Tema:/ }).click();
    await page.getByRole("menuitemradio", { name: themeWasDark ? /Claro/ : /Oscuro/ }).click();
    const themeAfterToggle = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    expect(themeAfterToggle).toBe(!themeWasDark);
    await page.reload();
    await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(themeAfterToggle);

    const barberRoutes = ["dashboard", "appointments", "clients", "team", "services", "checkout", "settings"];
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const route of barberRoutes) {
        const response = await page.goto(`/t/nova-studio/${route}`);
        expect(response?.status(), `${viewport.name}: ${route}`).toBeLessThan(400);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${viewport.name}: ${route}`).toBe(true);
      }
      await page.screenshot({ path: testInfo.outputPath(`barber-${viewport.name}.png`), fullPage: true, caret: "initial" });
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/t/nova-studio/appointments");
    const newAppointmentButton = page.getByRole("button", { name: "Nueva cita" });
    await newAppointmentButton.click();
    const dialog = page.getByRole("dialog", { name: "Nueva cita" });
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')))).toBe(true);
    const dialogBox = await dialog.boundingBox();
    expect(dialogBox).not.toBeNull();
    expect(dialogBox!.y).toBeGreaterThanOrEqual(0);
    expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(846);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(newAppointmentButton).toBeFocused();

    await page.evaluate(async () => { await fetch("/api/auth/logout", { method: "POST" }); });
    await login(page, "admin@brasa.local", "brasa-norte");
    const restaurantRoutes = ["dashboard", "floor", "menu", "clients", "orders", "kitchen", "checkout", "settings"];
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const route of restaurantRoutes) {
        const response = await page.goto(`/t/brasa-norte/${route}`);
        expect(response?.status(), `${viewport.name}: ${route}`).toBeLessThan(400);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${viewport.name}: ${route}`).toBe(true);
      }
      await page.screenshot({ path: testInfo.outputPath(`restaurant-${viewport.name}.png`), fullPage: true, caret: "initial" });
    }
    expect(issues).toEqual([]);
  });
});
