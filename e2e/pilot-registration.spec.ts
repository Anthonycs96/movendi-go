import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const password = "PilotoRegistro2026!";
const name = "Minimarket Soráyda Prueba";
const input = { planKey: "PROFESSIONAL", businessName: name, businessShortName: name, businessType: "MINIMARKET", branchName: "Sede principal", adminName: "Sorayda", password, country: "PE", acceptedTerms: true };
test.describe.configure({ mode: "serial" });
test.skip(process.env.E2E_BILLING_PROVIDER !== "pilot", "Ejecutar con E2E_BILLING_PROVIDER=pilot en la base aislada.");

test("registro móvil automático, piloto sin cobro y panel disponible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/planes");
  await expect(page.getByText("Piloto gratuito · Entorno de prueba", { exact: true })).toBeVisible();
  await page.getByLabel("Razón comercial").fill(name);
  await expect(page.locator('[name="businessShortName"]')).toHaveValue(name);
  await expect(page.getByLabel("Dirección de tu negocio")).toHaveValue("/t/minimarket-sorayda-prueba");
  await expect(page.getByLabel("Dirección de tu negocio")).toHaveAttribute("readonly", "");
  await page.getByLabel("Tipo de negocio").selectOption("MINIMARKET");
  await page.getByLabel("Administrador", { exact: true }).fill("Sorayda Prueba");
  await page.getByLabel("Correo de acceso").fill("sorayda-piloto@e2e.local");
  await page.getByLabel("Contraseña segura").fill(password);
  await page.getByRole("checkbox").check();
  await page.screenshot({ path: "test-results/pilot-registration-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Crear mi negocio de prueba" }).click();
  await expect(page.getByRole("heading", { name: "Tu negocio está listo" })).toBeVisible();
  await expect(page.getByText("Gratis · Sin cobros", { exact: true })).toBeVisible();
  await expect(page.getByText("Simular pago aprobado")).toHaveCount(0);
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  const detail = await (await page.request.get(`/api/billing/checkout/${id}`)).json();
  expect(detail.checkout).toMatchObject({ provider: "pilot", amountCents: 0, status: "COMPLETED", tenantSlug: "minimarket-sorayda-prueba" });
  expect((await page.request.post(`/api/billing/pilot/${id}/activate`)).status()).toBe(200);
  const login = await page.request.post("/api/auth/login", { data: { email: "sorayda-piloto@e2e.local", businessSlug: detail.checkout.tenantSlug, password } });
  expect(login.status(), await login.text()).toBe(200);
  await page.goto(`/t/${detail.checkout.tenantSlug}`);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Resumen", exact: true })).toBeVisible();
  await expect(page.getByRole("note")).toContainText("Piloto gratuito");
  await expect(page.getByText("Ventas netas", { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: "test-results/pilot-dashboard-mobile.png", fullPage: true });
  const workspace = await (await page.request.get("/api/data/tenant?section=settings")).json();
  expect(workspace.session.enabledModules).toContain("dashboard");
  expect(workspace.core.roles.some((role: { key: string }) => role.key === "RETAIL_CASHIER")).toBe(true);
  await page.request.post("/api/auth/login", { data: { email: "superadmin@multisaas.local", businessSlug: "nova-studio", password: "Nexo2026!" } });
  const platform = (await (await page.request.get("/api/data/platform")).json()).data;
  expect(platform.businesses.find((business: { slug: string }) => business.slug === detail.checkout.tenantSlug).subscriptionStatus).toBe("TRIAL");
  expect(platform.billing.invoices.filter((invoice: { businessName: string }) => invoice.businessName === name)).toHaveLength(0);
  expect(platform.billing.payments.filter((payment: { businessName: string }) => payment.businessName === name)).toHaveLength(0);
});

test("nombres repetidos generan otra dirección automáticamente", async ({ request }) => {
  const response = await request.post("/api/billing/checkout", { data: { ...input, email: "sorayda-piloto-2@e2e.local" } });
  expect(response.status(), await response.text()).toBe(201);
  const result = await response.json();
  const detail = await (await request.get(`/api/billing/checkout/${result.checkout.checkoutId}`)).json();
  expect(detail.checkout.tenantSlug).toMatch(/^minimarket-sorayda-prueba-[a-f0-9]+$/);
  expect(detail.checkout.amountCents).toBe(0);
});

test("el piloto no permite simulaciones de pago ni webhooks financieros", async ({ request }) => {
  expect((await request.post("/api/billing/mock/unknown/complete", { data: { outcome: "success" } })).status()).toBe(404);
  expect((await request.post("/api/billing/webhooks/pilot", { data: { type: "invoice.paid" } })).status()).toBe(404);
  expect((await request.post("/api/billing/webhooks/mock", { data: { type: "invoice.paid" } })).status()).toBe(404);
});

test("un Minimarket registrado antes de la corrección recupera el resumen", async ({ page }) => {
  expect(process.env.DATABASE_URL).toMatch(/e2e\.db$/);
  const prisma = new PrismaClient();
  try {
    // Reproduce the old public signup: no enabled modules and no setup record.
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "minimarket-sorayda-prueba" } });
    await prisma.businessSetup.delete({ where: { tenantId: tenant.id } });
    await prisma.tenant.update({ where: { id: tenant.id }, data: { enabledModules: "[]" } });
  } finally { await prisma.$disconnect(); }
  const response = await page.request.post("/api/auth/login", { data: { email: "sorayda-piloto@e2e.local", businessSlug: "minimarket-sorayda-prueba", password } });
  expect(response.status()).toBe(200);
  await page.goto("/t/minimarket-sorayda-prueba");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Resumen", exact: true })).toBeVisible();
});
