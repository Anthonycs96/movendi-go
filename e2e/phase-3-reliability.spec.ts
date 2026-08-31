import { expect, type APIRequestContext, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const password = "Nexo2026!";
const workerSecret = "phase-3-e2e-worker-secret-0001";
const prisma = new PrismaClient();

async function login(request: APIRequestContext, email = "admin@andes.local", businessSlug = "andes-cargo") {
  const response = await request.post("/api/auth/login", { data: { email, password, businessSlug, rememberSession: false } });
  expect(response.status(), await response.text()).toBe(200);
}

test.describe.serial("Fase 3 · fiabilidad y operación productiva", () => {
  test.afterAll(async () => prisma.$disconnect());

  test("[01/15] health informa servicio, versión, base y latencia", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
    expect(response.headers()["x-request-id"]).toMatch(/^[a-zA-Z0-9._:-]{8,64}$/);
    await expect(response.json()).resolves.toMatchObject({ status: "ok", service: "backend", database: "reachable" });
  });

  test("[02/15] readiness comprueba base y estado de workers", async ({ request }) => {
    const response = await request.get("/api/ready");
    expect(response.status()).toBe(200);
    const payload = await response.json();
    expect(["ready", "degraded"]).toContain(payload.status);
    expect(payload.database.status).toBe("reachable");
    expect(payload.jobs).toEqual(expect.objectContaining({ queued: expect.any(Number), processing: expect.any(Number), failed: expect.any(Number), stale: expect.any(Number) }));
  });

  test("[03/15] un error anónimo conserva un request ID proporcionado", async ({ request }) => {
    const response = await request.get("/api/notifications", { headers: { "x-request-id": "qa-request-00000001" } });
    expect(response.status()).toBe(401);
    expect(response.headers()["x-request-id"]).toBe("qa-request-00000001");
    expect((await response.json()).error.code).toBe("UNAUTHORIZED");
  });

  test("[04/15] un request ID inválido se reemplaza", async ({ request }) => {
    const response = await request.get("/api/health", { headers: { "x-request-id": "x" } });
    expect(response.headers()["x-request-id"]).not.toBe("x");
    expect(response.headers()["x-request-id"]).toMatch(/^[a-zA-Z0-9._:-]{8,64}$/);
  });

  test("[05/15] health del frontend verifica realmente al backend", async ({ request }) => {
    const response = await request.get("/api/frontend-health");
    expect(response.status()).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "ok", service: "frontend", backend: { status: "ok", database: "reachable" } });
  });

  test("[06/15] las alertas de Transporte provienen de datos reales", async ({ page }) => {
    await login(page.request);
    const response = await page.request.get("/api/notifications");
    expect(response.status()).toBe(200);
    const payload = await response.json();
    expect(payload.total).toBeGreaterThan(0);
    expect(payload.items.every((item: { href: string }) => item.href.startsWith("/t/andes-cargo/"))).toBeTruthy();
  });

  test("[07/15] RBAC oculta alertas sin permiso al despachador", async ({ page }) => {
    await login(page.request, "despacho@andes.local");
    const payload = await (await page.request.get("/api/notifications")).json();
    expect(payload.items.some((item: { id: string }) => item.id === "transport-stock" || item.id === "transport-maintenance")).toBeFalsy();
  });

  test("[08/15] la campana renderiza alertas operativas y navegación", async ({ page }) => {
    await login(page.request);
    await page.goto("/t/andes-cargo/dashboard");
    await page.getByRole("button", { name: /Alertas operativas/ }).click();
    await expect(page.getByText("Alertas operativas")).toBeVisible();
    await expect(page.locator(".notification-item").first()).toBeVisible();
  });

  test("[09/15] los trabajos nuevos incluyen reintentos y vencimiento", async ({ page }) => {
    await login(page.request);
    const response = await page.request.post("/api/transport/exports", { data: { section: "operations", format: "excel", query: "", status: null } });
    const queued = await response.json();
    const stored = await prisma.transportDataJob.findUniqueOrThrow({ where: { id: queued.id } });
    expect(stored.maxAttempts).toBe(3);
    expect(stored.expiresAt?.getTime()).toBeGreaterThan(Date.now());
  });

  test("[10/15] workers concurrentes procesan trabajos una sola vez", async ({ page }) => {
    await login(page.request);
    const queued = await Promise.all(Array.from({ length: 8 }, () => page.request.post("/api/transport/exports", { data: { section: "operations", format: "csv", query: "", status: null } }).then((response) => response.json())));
    await Promise.all(Array.from({ length: 12 }, () => page.request.post("/api/internal/jobs/transport", { headers: { "x-job-runner-secret": workerSecret } })));
    const stored = await prisma.transportDataJob.findMany({ where: { id: { in: queued.map((item) => item.id) } } });
    expect(stored).toHaveLength(8);
    expect(stored.every((item) => item.status === "COMPLETED" && item.attempts === 1)).toBeTruthy();
  });

  test("[11/15] el endpoint interno rechaza secretos incorrectos", async ({ request }) => {
    const response = await request.post("/api/internal/jobs/transport", { headers: { "x-job-runner-secret": "incorrecto" } });
    expect(response.status()).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHORIZED");
  });

  test("[12/15] un trabajo interrumpido se recupera y completa", async ({ request }) => {
    const stale = await prisma.transportDataJob.create({ data: { tenantId: "tenant-andes", actorId: "user-andes-admin", type: "TRANSPORT_EXPORT", format: "csv", status: "PROCESSING", parameters: JSON.stringify({ section: "operations", format: "csv", query: "", status: null, branchId: "branch-andes-callao" }), attempts: 0, maxAttempts: 3, startedAt: new Date(Date.now() - 3_600_000), heartbeatAt: new Date(Date.now() - 3_600_000), expiresAt: new Date(Date.now() + 86_400_000) } });
    const response = await request.post("/api/internal/jobs/transport", { headers: { "x-job-runner-secret": workerSecret } });
    expect(response.status()).toBe(200);
    const stored = await prisma.transportDataJob.findUniqueOrThrow({ where: { id: stale.id } });
    expect(stored.status).toBe("COMPLETED");
    expect(stored.attempts).toBe(1);
  });

  test("[13/15] un error transitorio programa reintento", async ({ request }) => {
    const broken = await prisma.transportDataJob.create({ data: { tenantId: "tenant-andes", actorId: "user-andes-admin", type: "TRANSPORT_EXPORT", format: "csv", parameters: "{", maxAttempts: 2, expiresAt: new Date(Date.now() + 86_400_000) } });
    await request.post("/api/internal/jobs/transport", { headers: { "x-job-runner-secret": workerSecret } });
    const stored = await prisma.transportDataJob.findUniqueOrThrow({ where: { id: broken.id } });
    expect(stored.status).toBe("QUEUED");
    expect(stored.attempts).toBe(1);
    expect(stored.error).toBeTruthy();
  });

  test("[14/15] al agotar reintentos el trabajo queda fallido", async ({ request }) => {
    const broken = await prisma.transportDataJob.findFirstOrThrow({ where: { parameters: "{" } });
    await prisma.transportDataJob.update({ where: { id: broken.id }, data: { runAfter: new Date(Date.now() - 1_000) } });
    await request.post("/api/internal/jobs/transport", { headers: { "x-job-runner-secret": workerSecret } });
    const stored = await prisma.transportDataJob.findUniqueOrThrow({ where: { id: broken.id } });
    expect(stored.status).toBe("FAILED");
    expect(stored.attempts).toBe(2);
  });

  test("[15/15] Super Admin recibe métricas técnicas reales", async ({ page }) => {
    await login(page.request, "superadmin@multisaas.local", "nova-studio");
    const response = await page.request.get("/api/data/platform");
    expect(response.status()).toBe(200);
    const payload = await response.json();
    expect(payload.data.system).toEqual(expect.objectContaining({ activeSessions: expect.any(Number), auditEvents: expect.any(Number), queuedJobs: expect.any(Number), processingJobs: expect.any(Number), failedJobs: expect.any(Number), staleJobs: expect.any(Number) }));
  });
});
