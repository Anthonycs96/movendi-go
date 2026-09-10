import { test, expect, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { mkdir } from "node:fs/promises";
const db = new PrismaClient();
test.describe.configure({ mode: "serial" });
async function login(api: APIRequestContext, email = "superadmin@multisaas.local", businessSlug = "brasa-norte") {
  const response = await api.post("/api/auth/login", { data: { email, businessSlug, password: "Nexo2026!" } }); expect(response.status(), await response.text()).toBe(200);
}
const plan = { action: "plan", owner: "Responsable QA", participants: "Administrador y cajero de prueba", devices: "Navegador de laboratorio", supportContact: "Bandeja de soporte", supportHours: "Horario acordado en laboratorio", escalation: "Responsable de laboratorio" };
let ticketId = "";
test.afterAll(async () => { await db.$disconnect(); });
test("permissions protect platform credentials and tenant support", async ({ request }) => {
  expect((await request.get("/api/platform/operations")).status()).toBe(401);
  expect((await request.get("/api/restaurant/launch")).status()).toBe(401);
  await login(request, "admin@brasa.local");
  expect((await request.get("/api/platform/operations")).status()).toBe(403);
  expect((await request.post("/api/platform/operations", { data: { token: "not-a-real-key" } })).status()).toBe(403);
  expect((await request.get("/api/restaurant/launch")).status()).toBe(200);
  const membership = await db.membership.findFirstOrThrow({ where: { user: { email: "admin@brasa.local" } } });
  const role = await db.role.create({ data: { tenantId: membership.tenantId, name: "Launch read only", key: "LAUNCH_READ_ONLY", permissions: JSON.stringify(["dashboard:read", "restaurant:configuration:read"]) } });
  await db.membership.update({ where: { id: membership.id }, data: { roleId: role.id } });
  try {
    expect((await request.patch("/api/restaurant/launch", { data: plan })).status()).toBe(403);
    expect((await request.post("/api/restaurant/launch", { data: { subject: "No autorizado", details: "No debe registrarse", priority: "HIGH" } })).status()).toBe(403);
  } finally { await db.membership.update({ where: { id: membership.id }, data: { roleId: membership.roleId } }); }
});
test("pilot requires plan, evidence, explicit confirmation and measured peak latency", async ({ request }) => {
  await login(request);
  const current = await (await request.get("/api/restaurant/launch")).json();
  if (current.plan) await db.restaurantLaunchPlan.delete({ where: { id: current.plan.id } });
  expect((await request.patch("/api/restaurant/launch", { data: { action: "complete", confirmedReal: true } })).status()).toBe(409);
  expect((await request.patch("/api/restaurant/launch", { data: plan })).status()).toBe(200);
  expect((await request.patch("/api/restaurant/launch", { data: { action: "complete", confirmedReal: true } })).status()).toBe(409);
  const result = { status: "PASSED", evidence: "Evidencia sintética solo en base E2E", samples: 0 };
  expect((await request.patch("/api/restaurant/launch", { data: { action: "check", key: "MENU", result } })).status()).toBe(400);
  expect((await request.patch("/api/restaurant/launch", { data: { action: "check", key: "PEAK", result, confirmedReal: true } })).status()).toBe(400);
  expect((await request.patch("/api/restaurant/launch", { data: { action: "check", key: "PEAK", result: { ...result, samples: 50, p95Ms: 640 }, confirmedReal: true } })).status()).toBe(200);
});
test("support rejects cross-branch edits and stale versions; platform can respond", async ({ request, page }) => {
  await login(request, "admin@brasa.local");
  const response = await request.post("/api/restaurant/launch", { data: { subject: "Incidencia de prueba aislada", details: "Detalle suficiente para comprobar soporte", priority: "CRITICAL", tenantId: "forged" } }); expect(response.status()).toBe(200); ticketId = (await response.json()).id;
  const ticket = await db.restaurantSupportTicket.findUniqueOrThrow({ where: { id: ticketId } }); expect(ticket.tenantId).not.toBe("forged");
  const other = await db.branch.create({ data: { tenantId: ticket.tenantId, name: "Sede aislada soporte" } });
  const foreign = await db.restaurantSupportTicket.create({ data: { tenantId: ticket.tenantId, branchId: other.id, createdById: ticket.createdById, subject: "Otra sede", details: "No visible desde la sede original" } });
  const update = { id: ticketId, version: 1, status: "IN_PROGRESS", assignedTo: "Soporte QA", resolution: "Investigación en laboratorio" };
  expect((await request.put("/api/restaurant/launch", { data: { ...update, id: foreign.id } })).status()).toBe(404);
  expect((await request.put("/api/restaurant/launch", { data: { ...update, status: "CLOSED", resolution: "" } })).status()).toBe(400);
  await login(page.request); const support = await page.request.put("/api/platform/operations", { data: update }); expect(support.status(), await support.text()).toBe(200);
  expect((await request.put("/api/restaurant/launch", { data: update })).status()).toBe(409);
  expect((await (await request.get("/api/restaurant/launch")).json()).tickets.find((item: { id: string }) => item.id === ticketId).resolution).toBe(update.resolution);
});
test("pilot close blocks critical incidents and missing recovery, then audits completion", async ({ request }) => {
  await login(request);
  const data = await (await request.get("/api/restaurant/launch")).json();
  // Synthetic fixtures only in the runner's isolated database; never certify production.
  const checks = Object.fromEntries(data.cases.map((item: { key: string }) => [item.key, { status: "PASSED", evidence: "Fixture de laboratorio E2E", samples: 50, p95Ms: 640 }]));
  await db.restaurantLaunchPlan.update({ where: { id: data.plan.id }, data: { checks: JSON.stringify(checks) } });
  const close = () => request.patch("/api/restaurant/launch", { data: { action: "complete", confirmedReal: true } });
  expect((await (await close()).json()).error.code).toBe("OPEN_INCIDENTS");
  expect((await request.put("/api/restaurant/launch", { data: { id: ticketId, version: 2, status: "CLOSED", assignedTo: "Soporte QA", resolution: "Solución comprobada en laboratorio" } })).status()).toBe(200);
  expect((await (await close()).json()).error.code).toBe("BACKUP_REQUIRED");
  await db.externalBackupRun.create({ data: { id: "e2e-backup", status: "COMPLETED", startedAt: new Date(), completedAt: new Date(), prefix: "fixture", restoreVerified: true } });
  expect((await close()).status()).toBe(200);
  expect((await request.patch("/api/restaurant/launch", { data: plan })).status()).toBe(409);
  expect(await db.auditLog.count({ where: { entityId: data.plan.id, action: "PILOT_COMPLETE" } })).toBe(1);
  await db.restaurantLaunchPlan.delete({ where: { id: data.plan.id } });
  await db.externalBackupRun.delete({ where: { id: "e2e-backup" } });
});
test("backup callback rejects unauthenticated and incomplete results", async ({ request }) => {
  expect((await request.post("http://127.0.0.1:3001/api/internal/backup-status", { data: {} })).status()).toBe(401);
  const headers = { Authorization: "Bearer launch-e2e-backup-token" };
  const id = "153980ef-c7a4-4613-9e53-0df1f16a1a55", prefix = `movendi-backups/v1/2026-09-10/${id}/`;
  const payload = { id, prefix, status: "COMPLETED", startedAt: new Date().toISOString() };
  expect((await request.post("http://127.0.0.1:3001/api/internal/backup-status", { headers, data: payload })).status()).toBe(400);
  expect((await request.post("http://127.0.0.1:3001/api/internal/backup-status", { headers, data: { ...payload, completedAt: new Date().toISOString(), files: 3, bytes: 500, restoreVerified: true } })).status()).toBe(200);
  await request.post("http://127.0.0.1:3001/api/internal/backup-status", { headers, data: { ...payload, status: "RUNNING" } });
  expect((await db.externalBackupRun.findUniqueOrThrow({ where: { id } })).status).toBe("COMPLETED");
});
test("mobile frontend can plan pilot, register a ticket and platform can resolve it", async ({ page }) => {
  await login(page.request); await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/t/brasa-norte/settings"); await page.getByRole("button", { name: "Abrir piloto y soporte" }).click();
  const dialog = page.getByRole("dialog");
  for (const [label, value] of [["Responsable del piloto", plan.owner], ["Participantes y roles", plan.participants], ["Dispositivos y red del local", plan.devices], ["Canal de soporte acordado", plan.supportContact], ["Horario de atención acordado", plan.supportHours], ["Responsable y canal de escalamiento", plan.escalation]]) await dialog.getByLabel(label).fill(value);
  await dialog.getByRole("button", { name: "Guardar plan y soporte" }).click(); await expect(dialog.getByRole("status")).toContainText("Seguimiento guardado");
  await mkdir("outputs/operational-launch", { recursive: true }); await page.screenshot({ path: "outputs/operational-launch/pilot-mobile.png", fullPage: false });
  await dialog.getByRole("button", { name: "Soporte", exact: true }).click();
  await dialog.getByLabel("Asunto de incidencia").fill("Incidencia desde frontend"); await dialog.getByLabel("Detalle de incidencia").fill("Recorrido completo desde el navegador móvil");
  await dialog.getByRole("button", { name: "Registrar incidencia" }).click(); await expect(dialog.locator("summary").filter({ hasText: "Incidencia desde frontend" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.goto("/platform/settings"); await page.getByRole("button", { name: "Revisar servicios" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Copia reciente y restauración comprobada." })).toBeVisible();
  await expect(page.getByLabel("Clave API de Mistral")).toHaveAttribute("type", "password");
  const ticket = page.locator(".operational-ticket").filter({ hasText: "Incidencia desde frontend" }); await ticket.locator("summary").click();
  await ticket.getByLabel("Estado de incidencia").selectOption("CLOSED"); await ticket.getByLabel("Responsable asignado").fill("Soporte QA"); await ticket.getByLabel("Respuesta o solución").fill("Atención y solución desde navegador"); await ticket.getByRole("button", { name: "Guardar incidencia" }).click(); await expect(ticket).toHaveCount(0);
  await page.screenshot({ path: "outputs/operational-launch/platform-mobile.png", fullPage: false });
});
