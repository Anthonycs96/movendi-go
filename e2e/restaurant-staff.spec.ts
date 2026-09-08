import { expect, test, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import type { AxeResults } from "axe-core";
const require = createRequire(resolve("package.json"));

const secret = "Staff-review-2026!";
let workerId: string;
let roleId: string;
let foreignWorkerId: string;
let foreignCursor: string;
let branchCursor: string;
const db = new PrismaClient();
async function login(api: APIRequestContext, email = "superadmin@multisaas.local", password = "Nexo2026!") {
  const response = await api.post("/api/auth/login", { data: { email, password, businessSlug: "brasa-norte" } });
  expect(response.status(), await response.text()).toBe(200);
  if ((await response.json()).redirectTo.startsWith("/change-password")) {
    const changed = await api.post("/api/auth/change-password", { data: { currentPassword: password, newPassword: `${secret}-changed` } });
    expect(changed.status(), await changed.text()).toBe(200);
  }
}
test.beforeAll(async ({ request }) => {
  await login(request);
  const { session, data } = await (await request.get("/api/data/tenant?section=floor")).json();
  const response = await request.post("/api/operations/core/roles", { data: { name: "Supervisor de actividad", permissions: "dashboard:read,restaurant:floor:read,restaurant:staff:read" } });
  expect(response.status(), await response.text()).toBe(200);
  roleId = (await response.json()).id;
  const user = await request.post("/api/operations/core/users", { data: { name: "Supervisor de prueba", email: "supervision@brasa.local", password: secret, roleId, branchId: session.branchId } });
  expect(user.status(), await user.text()).toBe(200);
  workerId = (await user.json()).id;
  const foreign = await db.membership.findFirstOrThrow({ where: { tenant: { slug: "nova-studio" } } });
  foreignWorkerId = foreign.userId;
  const otherBranch = await db.branch.create({ data: { tenantId: session.tenantId, name: "Sucursal aislada" } });
  const scope = { tenantId: session.tenantId, branchId: session.branchId, userId: workerId };
  await db.auditLog.createMany({ data: Array.from({ length: 56 }, (_, index) => ({ ...scope, action: "CREATE", entityType: "RestaurantOrder", metadata: '{"private":"DO-NOT-EXPOSE"}', createdAt: new Date(Date.now() - index * 1000) })) });
  foreignCursor = (await db.auditLog.create({ data: { tenantId: foreign.tenantId, branchId: foreign.branchId, userId: foreign.userId, action: "FOREIGN_TENANT", entityType: "RestaurantOrder" } })).id;
  branchCursor = (await db.auditLog.create({ data: { ...scope, branchId: otherBranch.id, action: "FOREIGN_BRANCH", entityType: "RestaurantOrder" } })).id;
  await db.auditLog.create({ data: { ...scope, action: "OLD_EVENT", entityType: "RestaurantOrder", createdAt: new Date(Date.now() - 3 * 86_400_000) } });
  for (let index = 5; index <= 14; index++) {
    const added = await request.post("/api/operations/restaurant/tables", { data: { name: `Mesa ${index}`, areaId: data.tables[0].area.id, seats: 4 } });
    expect(added.status(), await added.text()).toBe(200);
  }
});
test.afterAll(async () => { await db.$disconnect(); });

test("consulta protegida, filtros y paginación sin exponer otra empresa, sede o metadatos", async ({ request }) => {
  await login(request, "supervision@brasa.local", secret);
  const response = await request.get(`/api/data/restaurant-staff?worker=${workerId}`);
  expect(response.status()).toBe(200);
  const payload = await response.json();
  expect(payload.events).toHaveLength(50);
  expect(payload.events.every((event: { user: { id: string } }) => event.user.id === workerId)).toBe(true);
  expect(JSON.stringify(payload)).not.toMatch(/DO-NOT-EXPOSE|FOREIGN_|OLD_EVENT|password|email/);
  const next = await (await request.get(`/api/data/restaurant-staff?worker=${workerId}&cursor=${payload.nextCursor}`)).json();
  expect(next.events.length).toBeGreaterThan(0);
  expect(next.events.some((event: { id: string }) => payload.events.some((item: { id: string }) => item.id === event.id))).toBe(false);
  expect((await request.get(`/api/data/restaurant-staff?worker=${foreignWorkerId}`)).status()).toBe(404);
  for (const cursor of [foreignCursor, branchCursor]) expect((await request.get(`/api/data/restaurant-staff?cursor=${cursor}`)).status()).toBe(400);
  expect((await request.get("/api/data/restaurant-staff?days=999")).status()).toBe(400);
  let page = await (await request.get(`/api/data/restaurant-staff?days=7&worker=${workerId}`)).json();
  page = await (await request.get(`/api/data/restaurant-staff?days=7&worker=${workerId}&cursor=${page.nextCursor}`)).json();
  expect(page.events.some((event: { action: string }) => event.action === "OLD_EVENT")).toBe(true);
});

for (const width of [1920, 1280, 768, 390]) test(`mesas a todo el ancho, pedido y actividad accesibles a ${width}px`, async ({ page }) => {
  await login(page.request);
  await page.setViewportSize({ width, height: 950 });
  await page.goto("/t/brasa-norte/floor");
  const map = page.locator(".floor-map");
  expect((await map.locator(".floor-table__select > strong").allTextContents()).slice(0, 3)).toEqual(["Mesa 1", "Mesa 2", "Mesa 3"]);
  const work = page.locator(".floor-order-layout");
  expect((await map.boundingBox())!.width / (await work.boundingBox())!.width).toBeGreaterThan(.95);
  expect((await page.locator(".floor-table").first().boundingBox())!.width).toBeGreaterThanOrEqual(230);
  await expect(page.locator(".new-order-composer")).not.toBeVisible();
  await mkdir("outputs/staff-review", { recursive: true });
  await page.screenshot({ path: `outputs/staff-review/mesas-${width}.png`, fullPage: true });
  await page.locator(".floor-table--available .floor-table__select").first().click();
  await expect(page.locator(".new-order-composer")).toBeVisible();
  await expect(map).not.toBeVisible();
  const product = page.locator(".new-order-composer .touch-product").first();
  await product.getByRole("button", { name: /^Agregar / }).click();
  await expect(product.locator(".quantity-stepper b")).toHaveText("1");
  await page.getByRole("button", { name: "Volver a las mesas", exact: true }).click();
  await expect(map).toBeVisible();
  await page.getByRole("navigation", { name: "Vistas del salón" }).getByRole("button", { name: "Pedido", exact: true }).click();
  await expect(product.locator(".quantity-stepper b")).toHaveText("1");
  await page.getByRole("navigation", { name: "Vistas del salón" }).getByRole("button", { name: "Actividad del personal" }).click();
  await expect(page.getByRole("heading", { name: "Actividad del personal" })).toBeVisible();
  await expect(page.locator(".staff-activity__workers article").first()).toBeVisible();
  await page.getByLabel("Filtrar trabajador").selectOption(workerId);
  await expect(page.locator(".staff-activity__workers article")).toHaveCount(1);
  await expect(page.locator(".staff-activity__workers article")).toContainText("Supervisor de prueba");
  await expect(page.getByRole("button", { name: "Ver anteriores" })).toBeVisible();
  await page.getByRole("button", { name: "Ver anteriores" }).click();
  await expect(page.getByRole("button", { name: "Volver a recientes" })).toBeVisible();
  await page.getByRole("button", { name: "Volver a recientes" }).click();
  await expect(page.getByRole("button", { name: "Ver anteriores" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  const accessibility = await page.evaluate(async () => (window as typeof window & { axe: { run: (context: string, options: object) => Promise<AxeResults> } }).axe.run(".staff-activity", { runOnly: ["wcag2a", "wcag2aa"] }));
  expect(accessibility.violations).toEqual([]);
  await page.screenshot({ path: `outputs/staff-review/actividad-${width}.png`, fullPage: true });
});

test("permiso editable desde roles y revocación aplicada a UI y API", async ({ page, request }) => {
  await login(request);
  await login(page.request, "supervision@brasa.local", `${secret}-changed`);
  await page.goto("/t/brasa-norte/floor");
  await expect(page.getByRole("button", { name: "Actividad del personal", exact: true })).toBeVisible();
  const revoked = await request.patch(`/api/operations/core/roles/${roleId}`, { data: { name: "Supervisor de actividad", permissions: "dashboard:read,restaurant:floor:read" } });
  expect(revoked.status(), await revoked.text()).toBe(200);
  await page.reload();
  await expect(page.getByRole("button", { name: "Actividad del personal", exact: true })).toHaveCount(0);
  expect((await page.request.get("/api/data/restaurant-staff")).status()).toBe(403);
  expect((await (await page.request.get("/api/data/tenant")).json()).core.audit).toEqual([]);
  await login(page.request);
  await page.goto("/t/brasa-norte/settings");
  await page.getByRole("button", { name: "Rol", exact: true }).click();
  await expect(page.getByRole("dialog").getByLabel("Ver actividad del personal (en Salón)")).toBeVisible();
});
