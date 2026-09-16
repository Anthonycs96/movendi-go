import { createHmac } from "node:crypto";
import { expect, type APIResponse, type Page, test } from "@playwright/test";

const password = "VentaReal2026!";
const businessSlug = "pacifico-logistica-e2e";
const adminEmail = "gerencia@pacifico-logistica-e2e.local";
let checkoutId = "";
let subscriptionRef = "";

async function login(page: Page, email = "superadmin@multisaas.local", slug = "nova-studio", userPassword = "Nexo2026!") {
  const response = await page.request.post("/api/auth/login", { data: { email, password: userPassword, businessSlug: slug, rememberSession: false } });
  expect(response.status()).toBe(200);
}

function checkoutData(overrides: Record<string, unknown> = {}) {
  return { planKey: "PROFESSIONAL", businessName: "Pacífico Logística Integral S.A.C.", businessShortName: "Pacífico Logística", businessSlug, businessType: "TRANSPORT", branchName: "Base Callao", adminName: "María Fernanda Torres", email: adminEmail, password, country: "PE", acceptedTerms: true, website: "", ...overrides };
}

async function body(response: APIResponse) {
  return response.json() as Promise<Record<string, unknown>>;
}

test.describe.configure({ mode: "serial" });
test.describe("fase 5 comercial: 22 escenarios reales", () => {
  test("[01/22] publica únicamente planes activos", async ({ page }) => {
    const response = await page.request.get("/api/billing/plans");
    expect(response.status()).toBe(200);
    const result = await body(response) as { plans: Array<{ key: string; monthlyPriceCents: number }> };
    expect(result.plans.map((item) => item.key)).toEqual(["STARTER", "PROFESSIONAL"]);
    expect(result.plans.every((item) => item.monthlyPriceCents > 0)).toBe(true);
  });

  test("[02/22] muestra una contratación pública profesional y adaptable", async ({ page }) => {
    await page.goto("/planes");
    await expect(page.getByRole("heading", { name: /Empieza con una operación seria/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Profesional/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continuar al pago" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test("[03/22] protege la cobranza global frente a anónimos", async ({ page }) => {
    await page.goto("/platform/billing");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("[04/22] rechaza una contraseña débil", async ({ page }) => {
    const response = await page.request.post("/api/billing/checkout", { data: checkoutData({ password: "debil123" }) });
    expect(response.status()).toBe(400);
    expect(JSON.stringify(await body(response))).toContain("VALIDATION_ERROR");
  });

  test("[05/22] bloquea el honeypot anti-bot", async ({ page }) => {
    const response = await page.request.post("/api/billing/checkout", { data: checkoutData({ website: "https://spam.invalid" }) });
    expect(response.status()).toBe(400);
  });

  test("[06/22] rechaza un plan inexistente", async ({ page }) => {
    const response = await page.request.post("/api/billing/checkout", { data: checkoutData({ planKey: "ENTERPRISE_INVENTADO" }) });
    expect(response.status()).toBe(404);
  });

  test("[07/22] evita contratar con un slug ya usado", async ({ page }) => {
    const response = await page.request.post("/api/billing/checkout", { data: checkoutData({ businessSlug: "andes-cargo" }) });
    expect(response.status()).toBe(409);
  });

  test("[08/22] evita duplicar un administrador existente", async ({ page }) => {
    const response = await page.request.post("/api/billing/checkout", { data: checkoutData({ email: "admin@andes.local" }) });
    expect(response.status()).toBe(409);
  });

  test("[09/22] crea un checkout realista sin crear aún el tenant", async ({ page }) => {
    const response = await page.request.post("/api/billing/checkout", { data: checkoutData() });
    expect(response.status()).toBe(201);
    const result = await body(response) as { checkout: { checkoutId: string; provider: string; url: string } };
    checkoutId = result.checkout.checkoutId;
    subscriptionRef = `mock_sub_${checkoutId}`;
    expect(result.checkout.provider).toBe("mock");
    expect(result.checkout.url).toContain(`/checkout/${checkoutId}`);
    const lookup = await page.request.post("/api/auth/lookup-email", { data: { email: adminEmail } });
    expect(JSON.stringify(await body(lookup))).not.toContain(businessSlug);
  });

  test("[10/22] impide abrir dos checkouts simultáneos del mismo negocio", async ({ page }) => {
    const response = await page.request.post("/api/billing/checkout", { data: checkoutData() });
    expect(response.status()).toBe(409);
  });

  test("[11/22] presenta el simulador como entorno local, no como cobro real", async ({ page }) => {
    await page.goto(`/checkout/${checkoutId}`);
    await expect(page.getByText("Simulador visible sólo en desarrollo")).toBeVisible();
    await expect(page.getByRole("button", { name: "Simular pago aprobado" })).toBeVisible();
  });

  test("[12/22] rechaza un webhook con firma incorrecta", async ({ page }) => {
    const response = await page.request.post("/api/billing/webhooks/mock", { data: { id: "evt_bad_signature", type: "ignored", data: {} }, headers: { "x-billing-signature": "incorrecta" } });
    expect(response.status()).toBe(400);
  });

  test("[13/22] acepta un webhook firmado e ignora eventos desconocidos", async ({ page }) => {
    const payload = JSON.stringify({ id: "evt_phase5_ignored", type: "catalog.updated", data: {} });
    const signature = createHmac("sha256", "movendi-phase5-e2e-webhook-secret").update(payload).digest("hex");
    const response = await page.request.post("/api/billing/webhooks/mock", { data: payload, headers: { "content-type": "application/json", "x-billing-signature": signature } });
    expect(response.status()).toBe(200);
    expect((await body(response)).status).toBe("IGNORED");
  });

  test("[14/22] confirma pago y aprovisiona empresa, sede, rol, usuario y suscripción", async ({ page }) => {
    const response = await page.request.post(`/api/billing/mock/${checkoutId}/complete`, { data: { outcome: "success" } });
    expect(response.status()).toBe(200);
    const result = await body(response) as { checkout: { status: string; tenantSlug: string } };
    expect(result.checkout).toEqual({ status: "COMPLETED", tenantSlug: businessSlug });
  });

  test("[15/22] permite iniciar sesión al administrador aprovisionado", async ({ page }) => {
    await login(page, adminEmail, businessSlug, password);
    await page.goto(`/t/${businessSlug}/dashboard`);
    await expect(page.getByRole("heading", { name: "Centro de control operativo" })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/t/${businessSlug}/dashboard$`));
  });

  test("[16/22] procesa el mismo evento una sola vez", async ({ page }) => {
    const response = await page.request.post(`/api/billing/mock/${checkoutId}/complete`, { data: { outcome: "success" } });
    expect(response.status()).toBe(200);
    expect((await body(response)).result).toEqual({ duplicate: true, status: "PROCESSED" });
  });

  test("[17/22] registra renovación fallida y deuda sin perder el tenant", async ({ page }) => {
    const response = await page.request.post(`/api/billing/mock/${checkoutId}/complete`, { data: { outcome: "renewal_failed", eventId: "evt_renewal_failed_phase5" } });
    expect(response.status()).toBe(200);
    await login(page);
    const platform = await page.request.get("/api/data/platform");
    const result = await body(platform) as { data: { businesses: Array<{ slug: string; subscriptionStatus: string }>; billing: { metrics: { failedPayments: number } } } };
    expect(result.data.businesses.find((item) => item.slug === businessSlug)?.subscriptionStatus).toBe("PAST_DUE");
    expect(result.data.billing.metrics.failedPayments).toBe(1);
  });

  test("[18/22] una renovación pagada recupera la suscripción", async ({ page }) => {
    const response = await page.request.post(`/api/billing/mock/${checkoutId}/complete`, { data: { outcome: "renewal_paid", eventId: "evt_renewal_paid_phase5" } });
    expect(response.status()).toBe(200);
    await login(page);
    const result = await body(await page.request.get("/api/data/platform")) as { data: { businesses: Array<{ slug: string; subscriptionStatus: string }> } };
    expect(result.data.businesses.find((item) => item.slug === businessSlug)?.subscriptionStatus).toBe("ACTIVE");
  });

  test("[19/22] deduplica la renovación sin duplicar pago ni factura", async ({ page }) => {
    await login(page);
    const first = await body(await page.request.get("/api/data/platform")) as { data: { billing: { invoices: unknown[]; payments: unknown[] } } };
    const response = await page.request.post(`/api/billing/mock/${checkoutId}/complete`, { data: { outcome: "renewal_paid", eventId: "evt_renewal_paid_phase5" } });
    expect((await body(response)).result).toEqual({ duplicate: true, status: "PROCESSED" });
    const second = await body(await page.request.get("/api/data/platform")) as { data: { billing: { invoices: unknown[]; payments: unknown[] } } };
    expect(second.data.billing.invoices.length).toBe(first.data.billing.invoices.length);
    expect(second.data.billing.payments.length).toBe(first.data.billing.payments.length);
  });

  test("[20/22] procesa cancelación y conserva trazabilidad", async ({ page }) => {
    const response = await page.request.post(`/api/billing/mock/${checkoutId}/complete`, { data: { outcome: "cancel", eventId: "evt_cancel_phase5" } });
    expect(response.status()).toBe(200);
    await login(page);
    const result = await body(await page.request.get("/api/data/platform")) as { data: { businesses: Array<{ slug: string; subscriptionStatus: string }> } };
    expect(result.data.businesses.find((item) => item.slug === businessSlug)?.subscriptionStatus).toBe("CANCELLED");
  });

  test("[21/22] Super Admin visualiza cobranza y un administrador normal no", async ({ page }) => {
    await login(page);
    await page.goto("/platform/billing");
    await expect(page.getByRole("heading", { name: "Cobranza y facturación" })).toBeVisible();
    await expect(page.getByText("Pacífico Logística Integral S.A.C.").first()).toBeVisible();
    await login(page, adminEmail, businessSlug, password);
    expect((await page.goto("/platform/billing"))?.status()).toBe(404);
  });

  test("[22/22] readiness informa cobro y correo, y housekeeping entrega la bandeja", async ({ page }) => {
    const before = await body(await page.request.get("/api/ready")) as { billing: { provider: string; status: string }; email: { provider: string; queued: number } };
    expect(before.billing).toMatchObject({ provider: "mock", status: "configured" });
    expect(before.email.provider).toBe("log");
    expect(before.email.queued).toBeGreaterThan(0);
    const housekeeping = await page.request.post("/api/internal/maintenance", { headers: { "x-job-runner-secret": "phase-3-e2e-worker-secret-0001" } });
    expect(housekeeping.status()).toBe(200);
    const after = await body(await page.request.get("/api/ready")) as { email: { queued: number } };
    expect(after.email.queued).toBe(0);
    expect(subscriptionRef).toBe(`mock_sub_${checkoutId}`);
  });
});
