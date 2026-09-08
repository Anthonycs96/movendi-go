import { expect, type Page, test } from "@playwright/test";

const password = "Nexo2026!";

async function login(page: Page, email = "superadmin@multisaas.local", businessSlug = "nova-studio") {
  const response = await page.request.post("/api/auth/login", { data: { email, password, businessSlug, rememberSession: false } });
  expect(response.status()).toBe(200);
}

async function platformApi(page: Page, path: string, data: unknown) {
  const response = await page.request.patch(`/api/operations/platform/${path}`, { data });
  return { status: response.status(), body: await response.json() };
}

test.describe.configure({ mode: "serial" });
test.describe("consola Super Admin: 15 flujos globales reales", () => {
  test("[01/15] protege la consola frente a sesiones anónimas", async ({ page }) => {
    await page.goto("/platform/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("[02/15] oculta la consola a un administrador de negocio", async ({ page }) => {
    await login(page, "admin@nova.local");
    const response = await page.goto("/platform/dashboard");
    expect(response?.status()).toBe(404);
  });

  test("[03/15] muestra métricas globales al Super Admin", async ({ page }) => {
    await login(page);
    await page.goto("/platform/dashboard");
    await expect(page.getByRole("heading", { name: "Centro de control" })).toBeVisible();
    await expect(page.getByText("MRR contratado")).toBeVisible();
    await expect(page.getByText("Nova Studio", { exact: true }).first()).toBeVisible();
  });

  const sections = [
    ["businesses", "Negocios"], ["plans", "Planes comerciales"], ["subscriptions", "Suscripciones"],
    ["users", "Equipo de plataforma"], ["audit", "Auditoría global"], ["catalog", "Rubros y módulos"], ["settings", "Configuración y estado"],
  ] as const;
  for (const [index, [route, title]] of sections.entries()) {
    test(`[${String(index + 4).padStart(2, "0")}/15] navega a ${title}`, async ({ page }) => {
      await login(page);
      await page.goto(`/platform/${route}`);
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    });
  }

  test("[11/15] suspende y reactiva otro negocio con auditoría", async ({ page }) => {
    await login(page);
    const suspended = await platformApi(page, "businesses/tenant-brasa", { status: "SUSPENDED" });
    expect(suspended.status).toBe(200);
    const restored = await platformApi(page, "businesses/tenant-brasa", { status: "ACTIVE" });
    expect(restored.status).toBe(200);
    await page.goto("/platform/audit");
    await expect(page.getByText("Actualizó una empresa").first()).toBeVisible();
  });

  test("[12/15] impide suspender el tenant desde el que se administra", async ({ page }) => {
    await login(page);
    const result = await platformApi(page, "businesses/tenant-nova", { status: "SUSPENDED" });
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("CURRENT_TENANT");
  });

  test("[13/15] cambia la suscripción y conserva el negocio operativo", async ({ page }) => {
    await login(page);
    const result = await platformApi(page, "subscriptions/tenant-brasa", { planId: "plan-professional", subscriptionStatus: "ACTIVE", subscriptionEndsAt: null, trialEndsAt: null, cancelAtPeriodEnd: false });
    expect(result.status).toBe(200);
    await page.goto("/platform/subscriptions");
    const row = page.locator("tbody tr").filter({ hasText: "Brasa Norte" });
    await expect(row).toContainText("Profesional");
    await expect(row).toContainText("Activa");
  });

  test("[14/15] filtra el directorio por nombre", async ({ page }) => {
    await login(page);
    await page.goto("/platform/businesses");
    await page.getByPlaceholder("Buscar por nombre, slug o correo…").fill("Brasa");
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr")).toContainText("Brasa Norte");
  });

  test("[15/15] crea un tenant completo y permite entrar a su administrador", async ({ page }) => {
    await login(page);
    await page.goto("/platform/businesses");
    await page.getByRole("button", { name: /Nuevo negocio|Nueva empresa/i }).click();
    await page.getByLabel("Nombre comercial").fill("Prueba Plataforma E2E");
    await page.getByLabel("Nombre corto").fill("Prueba E2E");
    await page.getByLabel(/Identificador URL/).fill("prueba-plataforma-e2e");
    await page.getByRole("dialog").getByLabel("Rubro").selectOption("RESTAURANT");
    await page.getByLabel("Primera sede").fill("Sede de validación");
    await page.getByLabel("Administrador", { exact: true }).fill("Admin Prueba E2E");
    await page.getByLabel("Correo del administrador").fill("admin@prueba-e2e.local");
    await page.getByLabel(/Clave temporal/).fill(password);
    await page.getByRole("button", { name: /Crear y continuar/i }).click();
    await expect(page.getByText("Negocio creado. Continúa con su implementación guiada.")).toBeVisible();
    const access = await page.request.post("/api/auth/login", { data: { email: "admin@prueba-e2e.local", password, businessSlug: "prueba-plataforma-e2e", rememberSession: false } });
    expect(access.status()).toBe(200);
  });
});

test.describe("separación entre configuración del negocio y plataforma", () => {
  for (const [slug, email] of [
    ["nova-studio", "admin@nova.local"],
    ["brasa-norte", "admin@brasa.local"],
    ["andes-cargo", "admin@andes.local"],
  ]) {
    test(`${slug}: administra su perfil sin poder crear empresas`, async ({ page }) => {
      await login(page, email, slug);
      await page.goto(`/t/${slug}/settings`);
      await expect(page.getByRole("button", { name: /Empresa nueva|Nueva empresa|Crear empresa/ })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Abrir centro de control" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Sucursal", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Datos de la empresa", exact: true }).click();
      const profile = page.getByRole("dialog", { name: "Perfil empresarial" });
      await expect(profile.getByRole("button", { name: "Actualizar", exact: true })).toBeVisible();
      await expect(profile.getByLabel("Razón comercial")).not.toHaveValue("");
      await profile.getByRole("button", { name: "Cancelar", exact: true }).click();

      const response = await page.request.post("/api/operations/platform/tenants", { data: {
        name: "Empresa no autorizada", shortName: "No autorizada", slug: `bloqueada-${slug}`,
        type: "RESTAURANT", branchName: "Principal", adminName: "Administrador no autorizado",
        adminEmail: `bloqueado@${slug}.local`, adminPassword: "Tenant-boundary-2026!",
      } });
      expect(response.status()).toBe(403);
      expect((await response.json()).error.code).toBe("FORBIDDEN");
    });
  }

  test("el superadministrador crea empresas desde su centro de control", async ({ page }) => {
    await login(page);
    await page.goto("/t/nova-studio/settings");
    await expect(page.getByRole("button", { name: /Empresa nueva|Nueva empresa|Crear empresa/ })).toHaveCount(0);
    await page.getByRole("link", { name: "Abrir centro de control" }).click();
    await expect(page).toHaveURL(/\/platform\/dashboard$/);
    await page.getByRole("button", { name: "Nuevo negocio", exact: true }).click();
    await expect(page.getByRole("dialog").getByLabel("Nombre comercial")).toBeVisible();
  });
});
