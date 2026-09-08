import { expect, type Page, test } from "@playwright/test";

const password = "Nexo2026!";

async function login(page: Page, email: string, businessSlug: string, options: { password?: string; changePasswordTo?: string } = {}) {
  const currentPassword = options.password ?? password;
  await page.goto("/login");
  await page.getByLabel(/Correo electrónico/i).fill(email);
  await page.getByLabel(/^Negocio$/i).fill(businessSlug);
  await page.getByLabel(/^Contraseña$/i).fill(currentPassword);
  await page.getByRole("button", { name: "Entrar al sistema" }).click();
  if (options.changePasswordTo) {
    await expect(page).toHaveURL(/\/change-password\?next=/);
    await page.getByLabel("Contraseña temporal").fill(currentPassword);
    await page.getByLabel(/^Nueva contraseña$/).fill(options.changePasswordTo);
    await page.getByLabel(/^Confirmar nueva contraseña$/).fill(options.changePasswordTo);
    await page.getByRole("button", { name: "Guardar y continuar" }).click();
  }
  await expect(page).toHaveURL(new RegExp(`/t/${businessSlug}/dashboard$`));
}

async function selectContaining(select: ReturnType<Page["getByLabel"]>, value: string) {
  const optionValue = await select.locator("option").filter({ hasText: value }).getAttribute("value");
  if (!optionValue) throw new Error(`No se encontró la opción ${value}`);
  await select.selectOption(optionValue);
}

async function logoutViaApi(page: Page) {
  await page.request.post("/api/auth/logout");
  await page.goto("/login");
}

test.describe.serial("flujos críticos con base de datos real", () => {
  test("detecta el acceso global del Super Admin sin pedir empresa", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("MOVENDI GO", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tu operación completa, en un solo lugar." })).toBeVisible();
    await expect(page.getByText("Accesos de demostración")).toHaveCount(0);
    await expect(page.getByLabel("Correo electrónico")).toHaveValue("");
    await page.getByLabel("Correo electrónico").fill("superadmin@multisaas.local");
    await expect(page.getByLabel("Tipo de acceso")).toHaveValue("Super Admin · Control global");
    await expect(page.getByLabel(/^Negocio$/i)).toHaveCount(0);
  });

  test("login: Super Admin entra directamente al centro de control", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill("superadmin@multisaas.local");
    await page.getByLabel(/^Contraseña$/i).fill(password);
    await page.getByRole("button", { name: "Entrar al sistema" }).click();
    await expect(page).toHaveURL(/\/platform\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Centro de control" })).toBeVisible();
  });

  test("tema: se sincroniza entre Super Admin, negocio y recargas", async ({ page }) => {
    await logoutViaApi(page);
    await page.emulateMedia({ colorScheme: "light" });
    await page.evaluate(() => {
      window.localStorage.removeItem("saas-v2-theme-mode");
      window.localStorage.setItem("saas-v2-theme", "dark");
    });
    await page.reload();
    await page.getByLabel("Correo electrónico").fill("superadmin@multisaas.local");
    await page.getByLabel(/^Contraseña$/i).fill(password);
    await page.getByRole("button", { name: "Entrar al sistema" }).click();
    await expect(page).toHaveURL(/\/platform\/dashboard$/);
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await expect(page.getByRole("button", { name: "Tema: Sistema" })).toBeVisible();

    await page.getByRole("button", { name: "Tema: Sistema" }).click();
    await page.getByRole("menuitemradio", { name: /Oscuro/ }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.locator(".platform-sidebar").hover();
    await page.getByLabel("Seleccionar negocio").selectOption("brasa-norte");
    await expect(page).toHaveURL(/\/t\/brasa-norte\/dashboard$/);
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);

    await page.locator(".sidebar").hover();
    const businessThemeButton = page.getByRole("button", { name: "Tema: Oscuro" });
    await expect(businessThemeButton).toBeEnabled();
    await businessThemeButton.click();
    await page.getByRole("menuitemradio", { name: /Claro/ }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await page.getByRole("link", { name: /Centro de control/ }).click();
    await expect(page).toHaveURL(/\/platform\/dashboard$/);
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });

  test("login: autocompleta una operación normal al enviar sin escribir el slug", async ({ page }) => {
    await logoutViaApi(page);
    await page.getByLabel("Correo electrónico").fill("admin@nova.local");
    await page.getByLabel(/^Contraseña$/i).fill(password);
    await page.getByRole("button", { name: "Entrar al sistema" }).click();
    await expect(page).toHaveURL(/\/t\/nova-studio\/dashboard$/);
  });

  test("barbería: cliente, edición, cita, reprogramación, cobro y cierre de caja", async ({ page }) => {
    await login(page, "admin@nova.local", "nova-studio");
    await expect(page.getByRole("heading", { name: "Beauty" })).toBeVisible();

    await page.goto("/t/nova-studio/clients");
    await page.getByRole("button", { name: "Nuevo cliente" }).click();
    const customerDialog = page.getByRole("dialog", { name: "Nuevo cliente" });
    await customerDialog.getByLabel("Nombre completo").fill("Cliente E2E Nova");
    await customerDialog.getByLabel("DNI").fill("73124568");
    await customerDialog.getByLabel("Celular").fill("999888777");
    await customerDialog.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Cliente creado correctamente.")).toBeVisible();

    await page.getByPlaceholder("Buscar por nombre o DNI").fill("73124568");
    const createdCustomerRow = page.getByRole("row").filter({ hasText: "Cliente E2E Nova" });
    await expect(createdCustomerRow).toContainText("73124568");
    await page.getByPlaceholder("Buscar por nombre o DNI").fill("");
    await createdCustomerRow.getByRole("button", { name: "Editar" }).click();
    const editCustomerDialog = page.getByRole("dialog", { name: "Editar Cliente E2E Nova" });
    await editCustomerDialog.getByLabel("Nombre").fill("Cliente E2E Nova Editado");
    await editCustomerDialog.getByRole("button", { name: "Actualizar" }).click();
    await expect(page.getByText("Cliente actualizado correctamente.")).toBeVisible();

    await page.goto("/t/nova-studio/appointments");
    await page.getByRole("button", { name: "Nueva cita" }).click();
    const appointmentDialog = page.getByRole("dialog", { name: "Nueva cita" });
    await selectContaining(appointmentDialog.getByLabel("Cliente"), "Cliente E2E Nova Editado");
    await selectContaining(appointmentDialog.getByLabel("Servicio"), "Corte clásico");
    await selectContaining(appointmentDialog.getByLabel("Barbero"), "Mateo Ríos");
    await appointmentDialog.getByLabel("Fecha y hora").fill("2030-01-15T14:00");
    await appointmentDialog.getByRole("button", { name: "Guardar cita" }).click();
    await expect(page.getByText("Cita guardada correctamente.")).toBeVisible();

    let appointmentRow = page.getByRole("row").filter({ hasText: "Cliente E2E Nova Editado" });
    await expect(appointmentRow).toContainText("Pendiente");
    await appointmentRow.getByRole("button", { name: "Confirmar" }).click();
    await expect(appointmentRow).toContainText("Confirmada");
    await appointmentRow.getByRole("button", { name: "Reprogramar" }).click();
    const rescheduleDialog = page.getByRole("dialog", { name: "Reprogramar cita" });
    await rescheduleDialog.getByLabel("Fecha y hora").fill("2030-01-16T15:30");
    await rescheduleDialog.getByRole("button", { name: "Actualizar cita" }).click();
    await expect(page.getByText("Cita reprogramada y devuelta a pendiente.")).toBeVisible();
    appointmentRow = page.getByRole("row").filter({ hasText: "Cliente E2E Nova Editado" });
    await expect(appointmentRow).toContainText("Pendiente");
    await appointmentRow.getByRole("button", { name: "Confirmar" }).click();
    await appointmentRow.getByRole("button", { name: "Cobrar" }).click();
    await expect(appointmentRow).toContainText("Completada");

    await page.goto("/t/nova-studio/checkout");
    await page.getByRole("button", { name: "Cerrar caja" }).click();
    const closeCashDialog = page.getByRole("dialog", { name: "Cerrar caja" });
    await closeCashDialog.locator('button[type="submit"]').click();
    await expect(page.getByText(/Caja cerrada\. Diferencia: S\/ 0\.00/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Abrir caja" })).toBeVisible();
  });

  test("administración: crea, restringe y desactiva un usuario con RBAC", async ({ page }) => {
    const operatorPassword = "Operador2026!Segura";
    await login(page, "admin@nova.local", "nova-studio");
    await page.goto("/t/nova-studio/settings");
    await page.getByRole("button", { name: "Usuario", exact: true }).click();
    const userDialog = page.getByRole("dialog", { name: "Nuevo usuario" });
    await userDialog.getByLabel("Nombre").fill("Operador E2E");
    await userDialog.getByLabel("Correo").fill("operador.e2e@nova.local");
    await userDialog.getByLabel("Contraseña temporal").fill(password);
    await userDialog.getByLabel("Rol").selectOption({ label: "Barbero" });
    await userDialog.getByLabel("Sucursal").selectOption({ label: "Sede Lince" });
    await userDialog.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Usuario creado y vinculado a la empresa.")).toBeVisible();
    await expect(page.getByRole("row", { name: /Operador E2E operador\.e2e@nova\.local/ })).toContainText("Barbero");

    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await login(page, "operador.e2e@nova.local", "nova-studio", { changePasswordTo: operatorPassword });
    await expect(page.getByRole("link", { name: /Configuración/ })).toHaveCount(0);
    await page.goto("/t/nova-studio/settings");
    await expect(page.getByRole("heading", { name: "Esta vista no está disponible" })).toBeVisible();

    await logoutViaApi(page);
    await login(page, "admin@nova.local", "nova-studio");
    await page.goto("/t/nova-studio/settings");
    const operatorRow = page.getByRole("row", { name: /Operador E2E operador\.e2e@nova\.local/ });
    await operatorRow.getByRole("button", { name: "Editar" }).click();
    const editUserDialog = page.getByRole("dialog", { name: "Editar Operador E2E" });
    await editUserDialog.getByLabel("Estado").selectOption("false");
    await editUserDialog.getByRole("button", { name: "Actualizar" }).click();
    await expect(operatorRow).toContainText("Inactivo");
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel(/Correo electrónico/i).fill("operador.e2e@nova.local");
    await page.getByLabel(/^Negocio$/i).fill("nova-studio");
    await page.getByLabel(/^Contraseña$/i).fill(operatorPassword);
    await page.getByRole("button", { name: "Entrar al sistema" }).click();
    await expect(page.locator(".auth-error")).toContainText("Credenciales o negocio incorrectos");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("restaurante: reserva, pedido, traslado, cocina, cobro, limpieza y caja", async ({ page }) => {
    await login(page, "admin@brasa.local", "brasa-norte");
    await page.goto("/t/brasa-norte/floor");
    const table3 = page.locator(".floor-table").filter({ hasText: "Mesa 3" });
    await table3.locator(".floor-table__select").click();
    await page.getByLabel("Acciones de Mesa 3", { exact: true }).getByRole("button", { name: "Reservar", exact: true }).click();
    await expect(table3).toContainText("Reservada");
    await page.getByLabel("Acciones de Mesa 3", { exact: true }).getByRole("button", { name: "Liberar", exact: true }).click();
    await expect(table3).toContainText("Libre");

    await page.locator(".floor-table").filter({ hasText: "Mesa 2" }).locator(".floor-table__select").click();
    const orderComposer = page.locator(".new-order-composer");
    await expect(orderComposer.getByRole("region", { name: "Productos disponibles" })).toBeVisible();
    const desktopCatalogBox = await orderComposer.locator(".menu-catalog").boundingBox();
    const desktopCartBox = await orderComposer.locator(".current-order--desktop").boundingBox();
    expect(desktopCatalogBox).not.toBeNull();
    expect(desktopCartBox).not.toBeNull();
    expect(desktopCartBox!.x).toBeGreaterThan(desktopCatalogBox!.x);
    expect(Math.abs(desktopCartBox!.y - desktopCatalogBox!.y)).toBeLessThan(2);
    await selectContaining(orderComposer.getByLabel("Mesa"), "Mesa 2");
    await page.getByRole("tab", { name: "Fondos" }).click();
    await expect(page.locator(".touch-product").filter({ hasText: "Lomo saltado" })).toBeVisible();
    await expect(page.locator(".touch-product").filter({ hasText: "Chicha morada" })).toHaveCount(0);
    await page.getByLabel("Buscar producto").fill("lomo");
    await expect(page.locator(".touch-product").filter({ hasText: "Pollo a la brasa" })).toHaveCount(0);
    await page.getByLabel("Buscar producto").fill("");
    await page.getByRole("tab", { name: "Todos" }).click();

    const customerSearch = page.getByLabel("Buscar cliente por nombre o DNI");
    const customerSelect = page.getByLabel("Cliente (opcional)");
    await customerSearch.fill("Rosa");
    await expect(customerSelect.locator("option").filter({ hasText: "Rosa Delgado" })).toHaveCount(1);
    await customerSearch.fill("45872136");
    await expect(customerSelect.locator("option").filter({ hasText: "DNI 45872136" })).toHaveCount(1);
    await page.getByRole("button", { name: "Nuevo cliente" }).click();
    const inlineCustomer = page.getByRole("dialog", { name: "Nuevo cliente" });
    await inlineCustomer.getByLabel("Nombre completo").fill("Cliente Pedido E2E");
    await inlineCustomer.getByLabel("Documento", { exact: true }).fill("87654321");
    await inlineCustomer.getByRole("button", { name: "Registrar y seleccionar" }).click();
    await expect(customerSelect.locator("option:checked")).toHaveText(/Cliente Pedido E2E/);
    await customerSelect.selectOption("");

    const productCatalog = page.getByRole("region", { name: "Productos disponibles" });
    await productCatalog.getByLabel("Agregar Lomo saltado").click();
    await productCatalog.getByLabel("Agregar Lomo saltado").click();
    await page.getByLabel("Reducir Lomo saltado").first().click();
    await productCatalog.getByLabel("Agregar Chicha morada").click();
    const lomoLine = page.locator(".order-line").filter({ hasText: "Lomo saltado" });
    await lomoLine.getByPlaceholder("Ej. sin cebolla, término medio").fill("sin cebolla");
    await page.getByPlaceholder("Ej. servir todos los platos juntos").fill("Servir todo junto");
    await expect(page.getByRole("button", { name: /Enviar a cocina · 2 productos · S\/ 51\.00/ })).toBeEnabled();
    await page.getByRole("button", { name: /Enviar a cocina/ }).click();
    await expect(page.getByText("Pedido guardado y enviado a cocina.")).toBeVisible();
    const table2WithOrder = page.locator(".floor-table").filter({ hasText: "Mesa 2" });
    await expect(table2WithOrder).toContainText(/PED-/);
    await expect(table2WithOrder).toContainText("Pedido pendiente");

    await table3.locator(".floor-table__select").click();
    await selectContaining(page.locator(".new-order-composer").getByLabel("Mesa"), "Mesa 2");
    await expect(page.locator('.floor-table__select[aria-pressed="true"]')).toContainText("Mesa 2");
    const activeOrder = page.locator(".table-attention");
    await expect(activeOrder.getByText("Atención activa")).toBeVisible();
    await expect(activeOrder).toContainText("Lomo saltado");
    await expect(activeOrder).toContainText("Chicha morada");
    await expect(activeOrder).toContainText("sin cebolla");
    await expect(activeOrder).toContainText("Servir todo junto");

    await activeOrder.getByRole("button", { name: "Abrir carta y agregar productos" }).click();
    const expansionPanel = page.locator(".active-expansion-panel");
    const expansionCatalog = expansionPanel.getByRole("region", { name: "Agregar productos" });
    await expansionCatalog.getByLabel("Agregar Tequeños de queso").click();
    await expansionPanel.getByRole("button", { name: /Enviar ampliación a cocina · 1 producto · S\/ 24\.00/ }).click();
    await expect(activeOrder).toContainText("Tequeños de queso");
    await expect(page.getByText("Productos agregados y nueva comanda enviada a cocina.")).toBeVisible();

    const duplicateStatus = await page.evaluate(async () => (await fetch("/api/operations/restaurant/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tableId: "table-2", items: [{ productId: "product-lomo", quantity: 1 }] }),
    })).status);
    expect(duplicateStatus).toBe(409);

    await page.goto("/t/brasa-norte/orders");
    let orderRow = page.getByRole("row").filter({ hasText: "Mesa 2" });
    await orderRow.getByRole("button", { name: "Trasladar" }).click();
    const transferDialog = page.getByRole("dialog", { name: "Trasladar pedido" });
    await selectContaining(transferDialog.getByLabel("Mesa destino"), "Mesa 3");
    await transferDialog.getByRole("button", { name: "Mover pedido" }).click();
    await expect(page.getByText("Pedido trasladado a la nueva mesa.")).toBeVisible();
    orderRow = page.getByRole("row").filter({ hasText: "Mesa 3" });

    await page.goto("/t/brasa-norte/kitchen");
    const tickets = page.locator(".kitchen-ticket").filter({ hasText: "Mesa 3" });
    await expect(tickets).toHaveCount(2);
    for (const product of ["Chicha morada", "Lomo saltado"]) {
      const ticket = tickets.filter({ hasText: product });
      await ticket.getByRole("button", { name: "Iniciar preparación" }).click();
      await ticket.getByRole("button", { name: "Marcar listo" }).click();
      await expect(ticket.getByRole("button", { name: "Entregado" })).toBeVisible();
    }

    await page.goto("/t/brasa-norte/orders");
    orderRow = page.getByRole("row").filter({ hasText: "Mesa 3" });
    await expect(orderRow).toContainText("Listo");
    await orderRow.getByRole("button", { name: "Cobrar" }).click();
    const checkoutDialog = page.getByRole("dialog", { name: /Cobrar PED-/ });
    await checkoutDialog.getByRole("button", { name: "Confirmar cobro" }).click();
    await expect(orderRow).toContainText("Pagado");

    await page.goto("/t/brasa-norte/kitchen");
    for (const product of ["Chicha morada", "Lomo saltado"]) {
      await page.locator(".kitchen-ticket").filter({ hasText: "Mesa 3" }).filter({ hasText: product }).getByRole("button", { name: "Entregado", exact: true }).click();
    }

    await page.goto("/t/brasa-norte/floor");
    await page.locator(".floor-table").filter({ hasText: "Mesa 3" }).locator(".floor-table__select").click();
    await page.getByLabel("Acciones de Mesa 3", { exact: true }).getByRole("button", { name: "Marcar limpia" }).click();
    await expect(page.locator(".floor-table").filter({ hasText: "Mesa 3" })).toContainText("Libre");

    await page.goto("/t/brasa-norte/checkout");
    await page.getByRole("button", { name: "Cerrar caja" }).click();
    await page.getByRole("dialog", { name: "Cerrar caja" }).getByRole("button", { name: "Confirmar cierre" }).click();
    await expect(page.getByText(/Caja cerrada\. Diferencia: S\/ 0\.00/)).toBeVisible();

    await page.goto("/t/brasa-norte/reports");
    await expect(page.getByRole("heading", { name: "Estadísticas y reportes" })).toBeVisible();
    await expect(page.locator(".stat-card").filter({ hasText: "Ventas totales" })).not.toContainText("S/ 0.00");
    await expect(page.locator(".report-panel").filter({ hasText: "Productos más vendidos" })).toContainText("Lomo saltado");
    await expect(page.getByRole("tab", { name: "Día" })).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exportar CSV" }).click();
    await expect((await download).suggestedFilename()).toMatch(/reporte-restaurante-30d-\d{4}-\d{2}-\d{2}\.csv/);
    await page.getByRole("link", { name: "7 días" }).click();
    await expect(page).toHaveURL(/\/t\/brasa-norte\/reports\?period=7d$/);
    await expect(page.getByText("Últimos 7 días", { exact: false }).first()).toBeVisible();
  });

  test("aislamiento: un tenant no lee ni referencia datos de otro", async ({ page }) => {
    await login(page, "admin@nova.local", "nova-studio");
    const readStatus = await page.evaluate(async () => (await fetch("/api/operations/core/customers/customer-brasa-rosa")).status);
    expect(readStatus).toBe(404);

    const writeStatus = await page.evaluate(async () => (await fetch("/api/operations/barbershop/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: "customer-brasa-rosa", staffId: "staff-mateo", serviceId: "service-cut", startsAt: "2030-01-16T14:00:00.000Z" }),
    })).status);
    expect(writeStatus).toBe(404);

    await page.goto("/t/brasa-norte/dashboard");
    await expect(page.getByRole("heading", { name: "Esta vista no está disponible" })).toBeVisible();
  });

  test("restaurante móvil: el pedido actual se gestiona en un panel persistente", async ({ page }) => {
    await page.setViewportSize({ width: 348, height: 640 });
    await login(page, "admin@brasa.local", "brasa-norte");
    await page.goto("/t/brasa-norte/floor");
    await page.locator(".floor-table").filter({ hasText: "Libre" }).first().locator(".floor-table__select").click();
    const mobileComposer = page.locator(".new-order-composer");
    await expect(mobileComposer.getByRole("region", { name: "Productos disponibles" })).toBeVisible();
    await expect(page.locator(".current-order--desktop")).toHaveCount(0);
    const trigger = page.locator(".mobile-order-trigger");
    await expect(trigger).toContainText("Revisar pedido (0)");
    const catalog = page.getByRole("region", { name: "Productos disponibles" });
    await catalog.getByLabel("Agregar Lomo saltado").click();
    await catalog.getByLabel("Agregar Chicha morada").click();
    await expect(trigger).toContainText("Revisar pedido (2)");
    await expect(trigger).toContainText("S/ 51.00");
    await trigger.click();
    let orderPanel = mobileComposer.locator(".current-order--modal");
    await expect(orderPanel.getByText("Lomo saltado", { exact: true })).toBeVisible();
    await expect(orderPanel.getByText("Chicha morada", { exact: true })).toBeVisible();
    await orderPanel.getByLabel("Agregar Lomo saltado").click();
    await orderPanel.getByLabel("Eliminar Chicha morada").click();
    await orderPanel.getByPlaceholder("Ej. sin cebolla, término medio").fill("sin cebolla");
    await orderPanel.getByPlaceholder("Ej. servir todos los platos juntos").fill("Servir junto");
    await expect(orderPanel.locator(".order-summary__total")).toContainText("S/ 84.00");
    await mobileComposer.getByRole("button", { name: "Seguir agregando productos" }).click();
    await expect(trigger).toContainText("Revisar pedido (2)");
    await expect(trigger).toContainText("S/ 84.00");
    await trigger.click();
    orderPanel = mobileComposer.locator(".current-order--modal");
    await expect(orderPanel.getByPlaceholder("Ej. servir todos los platos juntos")).toHaveValue("Servir junto");
    const sendToKitchen = orderPanel.getByRole("button", { name: /Enviar a cocina · 2 productos · S\/ 84\.00/ });
    await expect(sendToKitchen).toBeVisible();
    await sendToKitchen.scrollIntoViewIfNeeded();
    await expect(sendToKitchen).toBeInViewport();
    await expect(sendToKitchen).toBeEnabled();
    await sendToKitchen.click();
    await expect(page.getByText("Pedido guardado y enviado a cocina.")).toBeVisible();

    await expect(page.locator('.floor-table__select[aria-pressed="true"]')).toContainText("Pedido pendiente");
    const activeMobilePanel = page.locator(".table-attention");
    await expect(activeMobilePanel).toBeVisible();
    await activeMobilePanel.getByRole("button", { name: "Abrir carta y agregar productos" }).click();
    const mobileExpansion = page.locator(".active-expansion-panel");
    await mobileExpansion.getByRole("region", { name: "Agregar productos" }).getByLabel("Agregar Tequeños de queso").click();
    await mobileExpansion.locator(".mobile-order-trigger").click();
    const directExpansionSend = mobileExpansion.getByRole("button", { name: /Enviar ampliación a cocina · 1 producto · S\/ 24\.00/ });
    await directExpansionSend.scrollIntoViewIfNeeded();
    await expect(directExpansionSend).toBeInViewport();
    await directExpansionSend.click();
    await expect(activeMobilePanel).toContainText("Tequeños de queso");
    await expect(page.getByText("Productos agregados y nueva comanda enviada a cocina.")).toBeVisible();
  });

  test("super admin: el menú móvil queda expandido al entrar a un negocio", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill("superadmin@multisaas.local");
    await page.getByLabel(/^Contraseña$/i).fill(password);
    await page.getByRole("button", { name: "Entrar al sistema" }).click();
    await expect(page).toHaveURL(/\/platform\/dashboard$/);
    await page.getByRole("button", { name: "Abrir navegación" }).click();
    const platformMenu = page.locator(".platform-sidebar--mobile");
    await platformMenu.getByLabel("Seleccionar negocio").selectOption("brasa-norte");
    await expect(page).toHaveURL(/\/t\/brasa-norte\/dashboard$/);
    await page.getByRole("button", { name: "Abrir navegación" }).click();
    const tenantMenu = page.locator(".mobile-sidebar");
    await expect(tenantMenu.getByText("Brasa Norte", { exact: true })).toBeVisible();
    await expect(tenantMenu.getByText("Resumen", { exact: true })).toBeVisible();
    await expect(tenantMenu.getByText("Reportes", { exact: true })).toBeVisible();
    await expect(tenantMenu.getByText("Centro de control", { exact: true })).toBeVisible();
  });

  test("calidad visual en escritorio y móvil sin errores ni overflow", async ({ page }, testInfo) => {
    const failures: string[] = [];
    page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
    page.on("console", (message) => { if (message.type() === "error") failures.push(`console: ${message.text()}`); });
    page.on("response", (response) => { if (response.status() >= 500) failures.push(`${response.status()} ${response.url()}`); });
    await login(page, "admin@nova.local", "nova-studio");
    await page.screenshot({ path: testInfo.outputPath("barbershop-desktop.png"), fullPage: true, caret: "initial" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/t/nova-studio/appointments");
    await expect(page.getByRole("button", { name: "Abrir navegación" })).toBeVisible();
    const mobileNavigation = page.getByRole("navigation", { name: "Navegación móvil" });
    await expect(mobileNavigation).toBeVisible();
    await expect(mobileNavigation.getByRole("link", { name: "Agenda" })).toHaveAttribute("aria-current", "page");
    await mobileNavigation.getByRole("link", { name: "Clientes" }).click();
    await expect(page).toHaveURL(/\/t\/nova-studio\/clients$/);
    await expect(mobileNavigation.getByRole("link", { name: "Clientes" })).toHaveAttribute("aria-current", "page");
    await page.screenshot({ path: testInfo.outputPath("barbershop-mobile.png"), fullPage: true, caret: "initial" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(failures).toEqual([]);
  });
});
