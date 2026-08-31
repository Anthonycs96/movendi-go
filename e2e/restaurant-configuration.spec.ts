import { expect, type Page, test } from "@playwright/test";
import type { RestaurantConfiguration, RestaurantData } from "@movendi/contracts";

const password = "Nexo2026!";

async function login(page: Page, email: string, businessSlug: string) {
  const response = await page.request.post("/api/auth/login", { data: { email, password, businessSlug, rememberSession: false } });
  expect(response.status(), await response.text()).toBe(200);
}

async function restaurantData(page: Page, section = "settings") {
  const response = await page.request.get(`/api/data/tenant?section=${section}`);
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json() as { data: RestaurantData }).data;
}

test.describe.serial("Configuración integral de Restaurante", () => {
  test("el Super Admin completa las 13 etapas del restaurante", async ({ page }) => {
    await login(page, "superadmin@multisaas.local", "nova-studio");
    await page.goto("/platform/businesses");
    const row = page.locator("tbody tr").filter({ hasText: "Brasa Norte" });
    await row.getByRole("button", { name: /Configurar|Continuar|Revisar/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    for (const label of ["Empresa y sede", "Módulos", "Operación", "Áreas y horarios", "Carta", "Usuarios y roles", "Salón", "Cocina", "Caja y promociones", "Reglas por módulo", "Impresión", "Integraciones", "Validación final"]) {
      await expect(dialog.getByRole("button", { name: new RegExp(`^(?:\\d+\\s+)?${label}\\b`, "i") })).toBeVisible();
    }

    const continueButton = dialog.getByRole("button", { name: "Guardar y continuar", exact: true });
    for (const heading of ["Módulos", "Operación", "Áreas y horarios", "Carta"]) {
      await continueButton.click();
      await expect(dialog.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    }
    const skipCatalog = dialog.getByRole("checkbox", { name: /Completar esta información después/i });
    if (await skipCatalog.isChecked()) await skipCatalog.uncheck();
    const categories = dialog.getByRole("region", { name: "2. Categorías" });
    const products = dialog.getByRole("region", { name: "3. Productos y precios" });
    const categoryName = categories.getByLabel("Categoría", { exact: true }).first();
    if (!await categoryName.inputValue()) await categoryName.fill("Platos principales");
    const area = categories.getByLabel("Área operativa").first();
    if (!await area.inputValue()) await area.selectOption({ index: 1 });
    if (await products.getByLabel("Producto", { exact: true }).count() === 0) await products.getByRole("button", { name: "Agregar producto" }).click();
    const productName = products.getByLabel("Producto", { exact: true }).first();
    if (!await productName.inputValue()) await productName.fill("Plato inicial");
    await products.getByLabel("Categoría").first().selectOption({ index: 1 });
    await products.getByLabel("Precio").first().fill("20");
    await products.getByLabel("Costo").first().fill("8");
    for (const heading of ["Usuarios y roles", "Salón", "Cocina", "Caja y promociones", "Reglas por módulo", "Impresión", "Integraciones", "Validación final"]) {
      await continueButton.click();
      await expect(dialog.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    }
    await dialog.getByRole("button", { name: /Marcar listo para operar/i }).click();
    await expect(dialog.getByText("Negocio marcado como listo para operar.")).toBeVisible();

    const platform = await page.request.get("/api/data/platform");
    const body = await platform.json() as { data: { businesses: Array<{ slug: string; setup: { status: string; completedSteps: string[] } }> } };
    const business = body.data.businesses.find((item) => item.slug === "brasa-norte");
    expect(business?.setup.status).toBe("READY");
    expect(business?.setup.completedSteps).toEqual(expect.arrayContaining(["RESTAURANT_OPERATION", "RESTAURANT_KITCHEN", "RESTAURANT_SALES", "RESTAURANT_CONTROL", "RESTAURANT_INTEGRATIONS"]));
  });

  test("el asistente obliga a crear áreas y categorías antes de ofrecerlas como selección", async ({ page }) => {
    await login(page, "superadmin@multisaas.local", "nova-studio");
    await page.goto("/platform/businesses");
    const row = page.locator("tbody tr").filter({ hasText: "Brasa Norte" });
    await row.getByRole("button", { name: /Configurar|Continuar|Revisar/i }).click();
    const dialog = page.getByRole("dialog");

    await dialog.getByRole("button", { name: /Áreas y horarios/i }).click();
    const areaNames = dialog.getByLabel(/Nombre del área/i);
    const initialAreaCount = await areaNames.count();
    await dialog.getByRole("button", { name: "Nueva área", exact: true }).click();
    await dialog.getByLabel(`Nombre del área ${initialAreaCount + 1}`).fill("Cocinas");
    await dialog.getByLabel(`Nombre del área ${initialAreaCount + 1}`).press("Tab");
    await expect(areaNames).toHaveCount(initialAreaCount);
    await expect(dialog.locator('input[aria-label^="Nombre del área"][value="Cocina"]')).toHaveCount(1);

    await dialog.getByRole("button", { name: /Carta/i }).click();
    const skipCatalog = dialog.getByRole("checkbox", { name: /Completar esta información después/i });
    if (await skipCatalog.isChecked()) await skipCatalog.uncheck();

    const categories = dialog.getByRole("region", { name: "2. Categorías" });
    const products = dialog.getByRole("region", { name: "3. Productos y precios" });
    await expect(categories.getByLabel("Área operativa")).toHaveCount(1);
    await expect(categories.getByLabel("Área operativa").locator("option", { hasText: "Cocina" })).toHaveCount(1);
    await categories.getByLabel("Categoría", { exact: true }).fill("");
    await expect(products.getByRole("button", { name: "Agregar producto" })).toBeDisabled();

    await categories.getByLabel("Categoría", { exact: true }).fill("Platos");
    await categories.getByLabel("Área operativa").selectOption({ label: "Cocina" });
    await expect(products.getByRole("button", { name: "Agregar producto" })).toBeEnabled();
    await products.getByRole("button", { name: "Agregar producto" }).click();
    await products.getByLabel("Producto", { exact: true }).last().fill("Producto guiado E2E");
    const productSelectors = products.getByRole("combobox");
    await productSelectors.nth((await productSelectors.count()) - 2).selectOption({ label: "Platos" });
    await expect(productSelectors.last()).toHaveValue("");
    await expect(productSelectors.last().locator("option", { hasText: "Heredar de la categoría" })).toHaveCount(1);

    await expect(dialog.getByRole("button", { name: "Guardar y continuar", exact: true })).toBeDisabled();
  });

  test("la carta grande detecta, normaliza y materializa áreas sin perder productos de precio cero", async ({ page }) => {
    await login(page, "superadmin@multisaas.local", "nova-studio");
    const slug = "restaurante-areas-e2e";
    const adminEmail = "admin@restaurante-areas-e2e.local";
    const created = await page.request.post("/api/operations/platform/tenants", { data: {
      name: "Restaurante Áreas E2E", shortName: "Áreas E2E", slug, type: "RESTAURANT", branchName: "Principal",
      adminName: "Administrador Áreas E2E", adminEmail, adminPassword: password, templateKey: "RESTAURANT_SIMPLE", startOnboarding: true,
    } });
    expect(created.status(), await created.text()).toBe(200);
    const tenantId = (await created.json() as { id: string }).id;
    const onboarding = `/api/operations/platform/onboarding/${tenantId}`;
    const hours = Array.from({ length: 7 }, (_, weekday) => ({ weekday, open: "09:00", close: "23:00", closed: false }));
    const initialOperations = await page.request.patch(onboarding, { data: {
      step: "OPERATIONS",
      preparationAreas: [
        { name: "Cocina", normalizedKey: "KITCHEN", type: "KITCHEN", source: "ONBOARDING", dispatchMode: "KDS", enabled: true },
        { name: "Cocinas", normalizedKey: "CUSTOM_COCINAS", type: "CUSTOM", source: "MANUAL", dispatchMode: "KDS", enabled: true },
        { name: "Barra", normalizedKey: "BAR", type: "BAR", source: "ONBOARDING", dispatchMode: "PRINTER", enabled: true },
        { name: "Bebidas", normalizedKey: "BEVERAGE", type: "BEVERAGE", source: "ONBOARDING", dispatchMode: "NONE", enabled: false },
      ],
      paymentMethods: ["CASH", "CARD", "YAPE"], hours,
    } });
    expect(initialOperations.status(), await initialOperations.text()).toBe(200);

    const products = Array.from({ length: 160 }, (_, index) => ({
      name: `Producto E2E ${index + 1}`,
      category: index % 3 === 0 ? "Platos" : index % 3 === 1 ? "Bebidas con alcohol" : "Bebidas sin alcohol",
      description: "Carga de validación",
      price: index === 0 ? 0 : 10 + index / 100,
      cost: index % 5,
      preparationArea: index % 3 === 0 ? (index % 2 ? "Cocina" : "cocina") : index % 3 === 1 ? (index % 2 ? "Bar" : "Barra") : "Bebidas",
    }));
    const catalogPayload = {
      step: "CATALOG", skip: false,
      categories: [
        { name: "Platos", preparationArea: "COCINA" },
        { name: "Bebidas con alcohol", preparationArea: "BARRA" },
        { name: "Bebidas sin alcohol", preparationArea: "BEBIDAS" },
      ],
      products,
      addons: [
        { name: "Extra heredado", price: 0, cost: 0, preparationArea: "", areaAssignmentMode: "INHERIT_FROM_PRODUCT" },
        { name: "Extra de barra", price: 2, cost: 0, preparationArea: "Bar", areaAssignmentMode: "SPECIFIC_AREA" },
      ],
      services: [],
    };
    const blockedCatalog = await page.request.patch(onboarding, { data: catalogPayload });
    expect(blockedCatalog.status()).toBe(409);
    expect((await blockedCatalog.json() as { error: { code: string } }).error.code).toBe("CATALOG_AREA_NOT_CONFIGURED");

    const operations = await page.request.patch(onboarding, { data: {
      step: "OPERATIONS",
      preparationAreas: [
        { name: "Cocinas", normalizedKey: "KITCHEN", type: "KITCHEN", source: "ONBOARDING", dispatchMode: "KDS", enabled: true },
        { name: "Barra", normalizedKey: "BAR", type: "BAR", source: "ONBOARDING", dispatchMode: "PRINTER", enabled: true },
        { name: "Bebidas", normalizedKey: "BEVERAGE", type: "BEVERAGE", source: "ONBOARDING", dispatchMode: "NONE", enabled: true },
      ],
      paymentMethods: ["CASH", "CARD", "YAPE"], hours,
    } });
    expect(operations.status(), await operations.text()).toBe(200);

    const catalog = await page.request.patch(onboarding, { data: catalogPayload });
    expect(catalog.status(), await catalog.text()).toBe(200);

    const platform = await page.request.get("/api/data/platform");
    expect(platform.status(), await platform.text()).toBe(200);
    const setupBusiness = (await platform.json() as { data: { businesses: Array<{ id: string; setup: { data: Record<string, unknown> } }> } }).data.businesses.find((item) => item.id === tenantId);
    const catalogSnapshot = setupBusiness?.setup.data.CATALOG as { detectedAreas: Array<{ key: string; aliases: string[] }> };
    expect(catalogSnapshot.detectedAreas.map((area) => area.key).sort()).toEqual(["BAR", "BEVERAGE", "KITCHEN"]);
    expect(catalogSnapshot.detectedAreas.find((area) => area.key === "BAR")?.aliases).toEqual(expect.arrayContaining(["Bar", "BARRA"]));
    expect(catalogSnapshot.detectedAreas.find((area) => area.key === "BAR")?.aliases).toHaveLength(2);

    const printing = await page.request.patch(onboarding, { data: {
      step: "PRINTING", skip: false, mode: "ADVANCED", automatic: true,
      areaDestinations: [
        { areaName: "Cocina", dispatchMode: "KDS" },
        { areaName: "Barra", dispatchMode: "PRINTER" },
        { areaName: "Bebidas", dispatchMode: "NONE" },
      ],
      printers: [{ name: "Impresora Barra E2E", connectionType: "BROWSER", paperWidthMm: 80, copies: 1, areas: ["Bar"] }],
    } });
    expect(printing.status(), await printing.text()).toBe(200);

    await login(page, "admin@brasa.local", "brasa-norte");
    const foreignArea = await page.request.post("/api/operations/restaurant/preparation-areas", { data: { name: "Cocina externa E2E", type: "KITCHEN", dispatchMode: "KDS", active: true } });
    expect(foreignArea.status(), await foreignArea.text()).toBe(200);
    const foreignAreaId = (await foreignArea.json() as { id: string }).id;

    await login(page, adminEmail, slug);
    const data = await restaurantData(page);
    expect(data.products).toHaveLength(162);
    expect(data.products.find((product) => product.name === "Producto E2E 1")?.priceCents).toBe(0);
    expect(data.products.find((product) => product.name === "Extra heredado")).toMatchObject({ productType: "ADDON", areaAssignmentMode: "INHERIT_FROM_PRODUCT", preparationArea: null });
    expect(data.products.find((product) => product.name === "Extra de barra")?.preparationArea?.name).toBe("Bar");
    expect(data.preparationAreas.filter((area) => area.active).map((area) => area.normalizedKey).sort()).toEqual(["BAR", "BEVERAGE", "KITCHEN"]);
    expect(data.preparationAreas.filter((area) => area.active && area.normalizedKey === "KITCHEN")).toHaveLength(1);
    expect(data.preparationAreas.find((area) => area.normalizedKey === "KITCHEN")?.name).toBe("Cocina");
    expect(data.preparationAreas.find((area) => area.normalizedKey === "BAR")).toMatchObject({ type: "BAR", dispatchMode: "PRINTER" });
    expect(data.preparationAreas.find((area) => area.normalizedKey === "BEVERAGE")).toMatchObject({ type: "BEVERAGE", dispatchMode: "NONE" });
    expect(data.preparationAreas.find((area) => area.normalizedKey === "KITCHEN")).toMatchObject({ type: "KITCHEN", dispatchMode: "KDS" });

    const foreignAreaProduct = await page.request.post("/api/operations/restaurant/products", { data: { name: "Producto con ruta externa", categoryId: data.categories[0].id, price: 10, cost: 1, productType: "FOOD", areaAssignmentMode: "SPECIFIC_AREA", preparationAreaId: foreignAreaId } });
    expect(foreignAreaProduct.status()).toBe(404);

    const inheritedAddon = data.products.find((product) => product.name === "Extra heredado")!;
    const kitchenBase = data.products.find((product) => product.productType !== "ADDON" && product.preparationArea?.name === "Cocina")!;
    const barBase = data.products.find((product) => product.productType !== "ADDON" && product.preparationArea?.name === "Bar")!;
    const ambiguousOrder = await page.request.post("/api/operations/restaurant/orders", { data: { source: "TAKEAWAY", items: [{ productId: kitchenBase.id, quantity: 1 }, { productId: barBase.id, quantity: 1 }, { productId: inheritedAddon.id, quantity: 1 }] } });
    expect(ambiguousOrder.status()).toBe(400);
    expect((await ambiguousOrder.json() as { error: { code: string } }).error.code).toBe("ADDON_PARENT_REQUIRED");

    const routedOrder = await page.request.post("/api/operations/restaurant/orders", { data: { source: "TAKEAWAY", items: [{ productId: kitchenBase.id, quantity: 1 }, { productId: barBase.id, quantity: 1 }, { productId: inheritedAddon.id, parentProductId: barBase.id, quantity: 1 }] } });
    expect(routedOrder.status(), await routedOrder.text()).toBe(200);
    const orderId = (await routedOrder.json() as { id: string }).id;
    const order = (await restaurantData(page, "orders")).orders.find((item) => item.id === orderId)!;
    expect(order.items.find((item) => item.productId === inheritedAddon.id)?.parentProductId).toBe(barBase.id);
    const printQueue = await page.request.get("/api/operations/restaurant/print-jobs");
    expect(printQueue.status(), await printQueue.text()).toBe(200);
    const jobs = (await printQueue.json() as { jobs: Array<{ order: { code: string }; payload: { sections: Array<{ areaName: string; items: Array<{ productId: string }> }> } }> }).jobs;
    const barJob = jobs.find((job) => job.order.code === order.code && job.payload.sections.some((section) => section.areaName === "Bar"));
    expect(barJob?.payload.sections.flatMap((section) => section.items).map((item) => item.productId)).toEqual(expect.arrayContaining([barBase.id, inheritedAddon.id]));
  });

  test("el Administrador gestiona configuración central y por módulo", async ({ page }) => {
    await login(page, "admin@brasa.local", "brasa-norte");
    await page.goto("/t/brasa-norte/settings");
    await expect(page.getByRole("heading", { name: "Parámetros centrales y por módulo" })).toBeVisible();
    for (const title of ["General y numeración", "Pedidos y estados", "Salón, mesas y reservas", "Carta y productos", "Cocina y comandas", "Caja, pagos y ventas", "Delivery", "Clientes y fidelización", "Inventario y recetas", "Promociones", "Notificaciones", "Integraciones", "Reportes"]) {
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
    }

    const before = await restaurantData(page);
    const updatedGeneral: RestaurantConfiguration["general"] = { ...before.configuration.general, orderPrefix: "RST", salePrefix: "VEN", serviceChargePct: 10 };
    const saved = await page.request.patch("/api/operations/restaurant/configuration/general", { data: updatedGeneral });
    expect(saved.status(), await saved.text()).toBe(200);
    const after = await restaurantData(page);
    expect(after.configuration.general.orderPrefix).toBe("RST");
    expect(after.configuration.general.salePrefix).toBe("VEN");
    expect(after.configuration.version).toBeGreaterThan(before.configuration.version);

    const customerSettings = { ...after.configuration.customers, loyaltyEnabled: true, pointsPerCurrencyUnit: 2 };
    const savedCustomers = await page.request.patch("/api/operations/restaurant/configuration/customers", { data: customerSettings });
    expect(savedCustomers.status(), await savedCustomers.text()).toBe(200);
    const customerResponse = await page.request.post("/api/operations/restaurant/customers", { data: { name: "Cliente CE E2E", documentType: "CE", dni: "CE123456", segment: "VIP", phone: "999888777" } });
    expect(customerResponse.status(), await customerResponse.text()).toBe(200);
    const customerId = (await customerResponse.json() as { id: string }).id;

    const table = after.tables.find((item) => item.active && item.status === "AVAILABLE" && !item.activeOrder);
    const product = after.products.find((item) => item.active);
    expect(table).toBeTruthy();
    expect(product).toBeTruthy();
    const orderResponse = await page.request.post("/api/operations/restaurant/orders", { data: { source: "DINE_IN", tableId: table!.id, customerId, items: [{ productId: product!.id, quantity: 1 }] } });
    expect(orderResponse.status(), await orderResponse.text()).toBe(200);
    const orderId = (await orderResponse.json() as { id: string }).id;
    const operation = (await restaurantData(page, "orders")).orders.find((item) => item.id === orderId);
    expect(operation?.code).toMatch(/^RST-/);
    expect(operation?.totalCents).toBe(Math.round(product!.priceCents * 1.1));
    const checkout = await page.request.post(`/api/operations/restaurant/orders/${orderId}/checkout`, { data: { paymentMethod: "CASH" } });
    expect(checkout.status(), await checkout.text()).toBe(200);
    const closedData = await restaurantData(page, "clients");
    const configuredCustomer = closedData.customers.find((item) => item.id === customerId);
    expect(configuredCustomer).toMatchObject({ documentType: "CE", segment: "VIP", dni: "CE123456" });
    expect(configuredCustomer?.loyaltyPoints).toBe(Math.floor((operation!.totalCents / 100) * 2));
    expect(closedData.sales.find((sale) => sale.orderCode === operation!.code)?.code).toMatch(/^VEN-/);

    const invalidSource = await page.request.post("/api/operations/restaurant/orders", { data: { source: "CURBSIDE", items: [{ productId: product!.id, quantity: 1 }] } });
    expect(invalidSource.status()).toBe(400);
    expect((await invalidSource.json() as { error: { code: string } }).error.code).toBe("CONFIG_VALUE_NOT_ALLOWED");

    const invalidProduct = await page.request.post("/api/operations/restaurant/products", { data: { name: "Producto sin costo E2E", categoryId: after.categories[0].id, price: 10, cost: 0, kitchenArea: "GENERAL" } });
    expect(invalidProduct.status()).toBe(400);
    expect((await invalidProduct.json() as { error: { code: string } }).error.code).toBe("PRODUCT_COST_REQUIRED");
  });

  test("Cocina no puede modificar los parámetros administrativos", async ({ page }) => {
    await login(page, "cocina@brasa.local", "brasa-norte");
    const response = await page.request.patch("/api/operations/restaurant/configuration/general", { data: {} });
    expect(response.status()).toBe(403);
    expect((await response.json() as { error: { code: string } }).error.code).toBe("FORBIDDEN");
    const settings = await page.request.get("/api/data/tenant?section=settings");
    expect(settings.status()).toBe(403);
    const menu = await page.request.get("/api/data/tenant?section=menu");
    expect(menu.status()).toBe(403);
    const kitchen = await page.request.get("/api/data/tenant?section=kitchen");
    expect(kitchen.status(), await kitchen.text()).toBe(200);
    const kitchenData = (await kitchen.json() as { data: RestaurantData }).data;
    expect(kitchenData.customers).toEqual([]);
    expect(kitchenData.sales).toEqual([]);
    expect(kitchenData.products).toEqual([]);
    expect(kitchenData.printDevices).toEqual([]);
    expect(kitchenData.configuration.integrations.webhookUrl).toBe("");
  });

  test("versiona por sede, cobra con pagos divididos y protege las credenciales SUNAT", async ({ page }) => {
    await login(page, "admin@brasa.local", "brasa-norte");
    const before = await restaurantData(page, "orders");
    const salesConfiguration = { ...before.configuration.sales, splitPaymentsEnabled: true };
    const configured = await page.request.patch("/api/operations/restaurant/configuration/sales", { data: salesConfiguration });
    expect(configured.status(), await configured.text()).toBe(200);
    const historyResponse = await page.request.get("/api/operations/restaurant/configuration/history");
    expect(historyResponse.status(), await historyResponse.text()).toBe(200);
    const versions = (await historyResponse.json() as { versions: Array<{ id: string; section: string; scope: string }> }).versions;
    const salesVersion = versions.find((version) => version.section === "sales");
    expect(salesVersion).toMatchObject({ section: "sales", scope: "BRANCH" });

    let data = await restaurantData(page, "orders");
    if (!data.cashSession) {
      const opened = await page.request.post("/api/operations/restaurant/cash", { data: { openingAmount: 100 } });
      expect(opened.status(), await opened.text()).toBe(200);
      data = await restaurantData(page, "orders");
    }
    const product = data.products.find((item) => item.active && item.priceCents > 0)!;
    const created = await page.request.post("/api/operations/restaurant/orders", { data: { source: "TAKEAWAY", items: [{ productId: product.id, quantity: 1 }] } });
    expect(created.status(), await created.text()).toBe(200);
    const orderId = (await created.json() as { id: string }).id;
    const order = (await restaurantData(page, "orders")).orders.find((item) => item.id === orderId)!;
    const firstCents = Math.floor(order.totalCents / 2);
    const checkout = await page.request.post(`/api/operations/restaurant/orders/${orderId}/checkout`, { data: { payments: [{ method: "CASH", amount: firstCents / 100 }, { method: "CARD", amount: (order.totalCents - firstCents) / 100 }] } });
    expect(checkout.status(), await checkout.text()).toBe(200);
    const sale = (await restaurantData(page, "checkout")).sales.find((item) => item.orderCode === order.code)!;
    expect(sale.paymentMethod).toBe("SPLIT");
    expect(sale.payments.map((payment) => payment.method)).toEqual(["CASH", "CARD"]);
    expect(sale.payments.reduce((sum, payment) => sum + payment.amountCents, 0)).toBe(order.totalCents);

    const rejectedCredentials = await page.request.post("/api/operations/restaurant/sunat/credentials", { data: { apiUrl: "https://example.invalid/nubefact", token: "token-super-seguro-e2e-123456" } });
    expect(rejectedCredentials.status()).toBe(400);

    const credentials = await page.request.post("/api/operations/restaurant/sunat/credentials", { data: { apiUrl: "https://api.nubefact.com/api/v1/e2e", token: "token-super-seguro-e2e-123456" } });
    expect(credentials.status(), await credentials.text()).toBe(200);
    const status = await page.request.get("/api/operations/restaurant/sunat/status");
    const sunat = await status.json() as { configured: boolean; tokenHint: string };
    expect(sunat.configured).toBe(true);
    expect(sunat.tokenHint).toBe("••••3456");
    expect(JSON.stringify(sunat)).not.toContain("token-super-seguro");

    const rollback = await page.request.post(`/api/operations/restaurant/configuration/rollback/${salesVersion!.id}`, { data: {} });
    expect(rollback.status(), await rollback.text()).toBe(200);
  });
});
