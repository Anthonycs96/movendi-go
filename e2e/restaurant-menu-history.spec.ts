import { test, expect, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PDFDocument } from "pdf-lib";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
const db = new PrismaClient();
test.describe.configure({ mode: "serial" });
async function login(api: APIRequestContext, businessSlug = "brasa-norte", email = "superadmin@multisaas.local") {
  const response = await api.post("/api/auth/login", { data: { email, businessSlug, password: "Nexo2026!" } }); expect(response.status(), await response.text()).toBe(200);
  if (businessSlug === "brasa-norte") expect((await api.get("/api/data/tenant?section=menu")).status()).toBe(200);
}
async function fixture() {
  const tenant = await db.tenant.findUniqueOrThrow({ where: { slug: "brasa-norte" } });
  const branch = await db.branch.findFirstOrThrow({ where: { tenantId: tenant.id, active: true } });
  const actor = await db.user.findFirstOrThrow({ where: { email: "superadmin@multisaas.local" } });
  const category = await db.category.findFirstOrThrow({ where: { tenantId: tenant.id, branchId: branch.id, active: true } });
  const area = await db.preparationArea.findFirst({ where: { tenantId: tenant.id, branchId: branch.id, active: true } }) ?? await db.preparationArea.create({ data: { tenantId: tenant.id, branchId: branch.id, name: "Cocina historial" } });
  return { tenantId: tenant.id, branchId: branch.id, actorId: actor.id, category, area };
}
async function createProduct(api: APIRequestContext, name: string) {
  const current = await fixture();
  const body = { name, categoryId: current.category.id, price: 20, cost: 5, taxCategory: "GRAVADA", preparationAreaId: current.area.id };
  const response = await api.post("/api/operations/restaurant/products", { data: body }); expect(response.status(), await response.text()).toBe(200);
  return { ...body, id: (await response.json()).id };
}
async function latest(api: APIRequestContext) { const response = await api.get("/api/restaurant/menu-history"); expect(response.status()).toBe(200); return (await response.json()).entries[0]; }
async function upload(api: APIRequestContext, id: string, bytes: Buffer) {
  const size = 4 * 1024 * 1024, total = Math.ceil(bytes.length / size);
  for (let index = 0; index < total; index++) { const response = await api.post(`/api/restaurant/menu-source?id=${id}&index=${index}&total=${total}`, { headers: { "Content-Type": "application/octet-stream" }, data: bytes.subarray(index * size, (index + 1) * size) }); expect(response.status(), await response.text()).toBe(200); }
  const response = await api.patch(`/api/restaurant/menu-source?id=${id}`); expect(response.status(), await response.text()).toBe(200);
}
let pdfJob = "", pdfEntry = "", pdfBytes: Buffer;
test.afterAll(async () => { await db.$disconnect(); });

test("manual changes preserve before/after and revert atomically once", async ({ request }) => {
  await login(request); const product = await createProduct(request, "Historial manual");
  const response = await request.patch(`/api/operations/restaurant/products/${product.id}`, { data: { ...product, price: 23, cost: 7, description: "Nueva descripción", active: "true" } }); expect(response.status(), await response.text()).toBe(200);
  const entry = await latest(request); expect(entry.history.changes[0].before.priceCents).toBe(2000); expect(entry.history.changes[0].after.priceCents).toBe(2300);
  const revert = { id: entry.id, reason: "Prueba de corrección de precios", confirmed: true };
  const results = await Promise.all([request.post("/api/restaurant/menu-history", { data: revert }), request.post("/api/restaurant/menu-history", { data: revert })]);
  for (const result of results) expect(result.status(), await result.text()).toBe(200);
  expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).priceCents).toBe(2000);
  expect(await db.auditLog.count({ where: { entityId: entry.id, action: "MENU_REVERT" } })).toBe(1);
});

test("source uploads resume without duplicates and reject incomplete or wrong PDFs", async ({ request }) => {
  await login(request); const { tenantId, branchId, actorId } = await fixture();
  const pdf = await PDFDocument.create(); pdf.addPage(); pdfBytes = Buffer.concat([Buffer.from(await pdf.save()), Buffer.alloc(4 * 1024 * 1024, 32)]);
  const job = await db.restaurantMenuImport.create({ data: { tenantId, branchId, actorId, filename: "Carta historial.pdf", sourceHash: createHash("sha256").update(pdfBytes).digest("hex"), pageCount: 1, nextPage: 1, status: "REVIEW" } }); pdfJob = job.id;
  expect((await request.patch(`/api/restaurant/menu-source?id=${job.id}`)).status()).toBe(409);
  await upload(request, job.id, pdfBytes); const objects = await db.storedObject.count({ where: { purpose: "RESTAURANT_MENU_SOURCE" } }); await upload(request, job.id, pdfBytes);
  expect(await db.storedObject.count({ where: { purpose: "RESTAURANT_MENU_SOURCE" } })).toBe(objects);
  const info = await (await request.get(`/api/restaurant/menu-source?id=${job.id}`)).json(); expect(info.parts).toBe(2);
  const parts = []; for (let index = 0; index < info.parts; index++) parts.push(await (await request.get(`/api/restaurant/menu-source?id=${job.id}&part=${index}`)).body());
  expect(Buffer.concat(parts).equals(pdfBytes)).toBe(true);
  const bad = await db.restaurantMenuImport.create({ data: { tenantId, branchId, actorId, filename: "Incorrecto.pdf", sourceHash: "0".repeat(64), pageCount: 1 } });
  expect((await request.post(`/api/restaurant/menu-source?id=${bad.id}&index=0&total=1`, { data: Buffer.from(await pdf.save()) })).status()).toBe(200);
  expect((await request.patch(`/api/restaurant/menu-source?id=${bad.id}`)).status()).toBe(409);
});

test("PDF changes record created IDs and conflicts prevent partial rollback", async ({ request }) => {
  await login(request); const current = await fixture(); const existing = await createProduct(request, "Historial PDF existente");
  const rows = [
    { name: existing.name, category: current.category.name, description: "Actualizado desde PDF", price: 30, cost: 5, kind: "PRODUCT", targetId: existing.id, expectedPriceCents: 2000, active: true },
    { name: "Historial PDF nuevo", category: current.category.name, description: "Nuevo desde PDF", price: 12, cost: 4, kind: "PRODUCT", active: true },
  ];
  const response = await request.patch("/api/restaurant/menu-import", { data: { id: pdfJob, confirmed: true, areaId: current.area.id, taxCategory: "GRAVADA", rows } }); expect(response.status(), await response.text()).toBe(200);
  const entry = await latest(request); pdfEntry = entry.id; expect(entry.history.changes).toHaveLength(2); expect(entry.sourceAvailable).toBe(true);
  const newId = entry.history.changes[1].productId;
  await request.patch(`/api/operations/restaurant/products/${newId}`, { data: { ...existing, name: "Historial PDF nuevo", price: 14, active: "true" } });
  const revert = await request.post("/api/restaurant/menu-history", { data: { id: entry.id, reason: "Intento con cambios posteriores", confirmed: true } }); expect(revert.status(), await revert.text()).toBe(409);
  expect((await db.product.findUniqueOrThrow({ where: { id: existing.id } })).priceCents).toBe(3000);
  expect(await db.auditLog.count({ where: { entityId: entry.id, action: "MENU_REVERT" } })).toBe(0);
});

test("history UI downloads original and reverts a product with explicit confirmation", async ({ page }) => {
  await login(page.request); const product = await createProduct(page.request, "Revertir desde navegador");
  await page.goto("/t/brasa-norte/menu"); await page.getByRole("tab", { name: "Historial de carta" }).click();
  const entry = page.locator(".menu-history-entry").first(); await entry.locator("summary").click(); await expect(entry).toContainText(product.name);
  await entry.getByRole("button", { name: "Revertir este cambio" }).click();
  const dialog = page.getByRole("dialog"); await expect(dialog.getByRole("button", { name: "Confirmar reversión" })).toBeDisabled();
  await dialog.getByLabel("Motivo de la reversión").fill("Producto creado por error"); await dialog.getByRole("checkbox").check(); await dialog.getByRole("button", { name: "Confirmar reversión" }).click(); await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Cambio revertido" })).toBeVisible(); expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).active).toBe(false);
  await page.getByLabel("Origen del cambio").selectOption("PDF"); const pdf = page.locator(".menu-history-entry").filter({ hasText: "Carta historial.pdf" }).first();
  const download = page.waitForEvent("download"); await pdf.getByRole("button", { name: "Descargar PDF original" }).click(); expect((await download).suggestedFilename()).toBe("Carta historial.pdf");
  await pdf.locator("summary").click(); await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await mkdir("outputs/menu-history", { recursive: true }); await page.screenshot({ path: "outputs/menu-history/mobile.png", fullPage: true });
});

test("complete PDF rollback restores prices and deactivates new products", async ({ request }) => {
  await login(request); const { tenantId, branchId, actorId, category, area } = await fixture(); const existing = await createProduct(request, "PDF reversible existente");
  const job = await db.restaurantMenuImport.create({ data: { tenantId, branchId, actorId, filename: "Segunda carta.pdf", sourceHash: createHash("sha256").update(pdfBytes).digest("hex"), pageCount: 1, nextPage: 1, status: "REVIEW" } });
  const payload = { id: job.id, confirmed: true, areaId: area.id, taxCategory: "GRAVADA", rows: [
    { name: existing.name, category: category.name, description: "Cambio reversible", price: 28, cost: 5, kind: "PRODUCT", active: true, targetId: existing.id, expectedPriceCents: 2000 },
    { name: "PDF reversible nuevo", category: category.name, description: "Alta reversible", price: 15, cost: 5, kind: "PRODUCT", active: true },
  ] };
  expect((await request.patch("/api/restaurant/menu-import", { data: payload })).status()).toBe(409);
  await upload(request, job.id, pdfBytes); const applied = await request.patch("/api/restaurant/menu-import", { data: payload }); expect(applied.status(), await applied.text()).toBe(200);
  const entry = await latest(request); const response = await request.post("/api/restaurant/menu-history", { data: { id: entry.id, reason: "Restaurar la carta anterior", confirmed: true } }); expect(response.status(), await response.text()).toBe(200);
  expect((await db.product.findUniqueOrThrow({ where: { id: existing.id } })).priceCents).toBe(2000);
  expect((await db.product.findUniqueOrThrow({ where: { id: entry.history.changes[1].productId } })).active).toBe(false);
  expect((await request.patch("/api/restaurant/menu-import", { data: payload })).status()).toBe(200);
  expect((await db.product.findUniqueOrThrow({ where: { id: entry.history.changes[1].productId } })).active).toBe(false);
});

test("permission and branch boundaries protect history, files and reversion", async ({ request, page }) => {
  expect((await request.get("/api/restaurant/menu-history")).status()).toBe(401);
  await login(request, "nova-studio"); expect((await request.get("/api/restaurant/menu-history")).status()).toBe(403); expect((await request.get(`/api/restaurant/menu-source?id=${pdfJob}`)).status()).toBe(403);
  const membership = await db.membership.findFirstOrThrow({ where: { user: { email: "admin@brasa.local" } } });
  const previous = await db.role.findUniqueOrThrow({ where: { id: membership.roleId } });
  const restricted = await db.role.create({ data: { tenantId: membership.tenantId, name: "Auditor carta pruebas", key: "MENU_HISTORY_TEST", permissions: JSON.stringify(["dashboard:read", "restaurant:menu:read", "restaurant:menu-history:read"]) } });
  await db.membership.update({ where: { id: membership.id }, data: { roleId: restricted.id } });
  try {
    await login(page.request, "brasa-norte", "admin@brasa.local"); await page.goto("/t/brasa-norte/menu"); await page.getByRole("tab", { name: "Historial de carta" }).click(); await expect(page.locator(".menu-history-entry").first()).toBeVisible(); await expect(page.getByRole("button", { name: "Revertir este cambio" })).toHaveCount(0);
    expect((await page.request.post("/api/restaurant/menu-history", { data: { id: pdfEntry, reason: "Sin permiso de reversión", confirmed: true } })).status()).toBe(403);
    await db.role.update({ where: { id: restricted.id }, data: { permissions: JSON.stringify(["dashboard:read", "restaurant:menu:read"]) } });
    expect((await page.request.get("/api/restaurant/menu-history")).status()).toBe(403); expect((await page.request.get(`/api/restaurant/menu-source?id=${pdfJob}`)).status()).toBe(403);
    await page.reload(); await expect(page.getByRole("tab", { name: "Historial de carta" })).toHaveCount(0);
    await login(request); const originalBranch = membership.branchId; const otherBranch = await db.branch.create({ data: { tenantId: membership.tenantId, name: "Otra sede historial" } });
    const job = await db.restaurantMenuImport.findUniqueOrThrow({ where: { id: pdfJob } }); await db.restaurantMenuImport.update({ where: { id: pdfJob }, data: { branchId: otherBranch.id } });
    expect((await request.get(`/api/restaurant/menu-source?id=${pdfJob}`)).status()).toBe(404); await db.restaurantMenuImport.update({ where: { id: pdfJob }, data: { branchId: job.branchId } }); expect(originalBranch).toBeTruthy();
    const foreign = await db.auditLog.create({ data: { tenantId: membership.tenantId, branchId: otherBranch.id, entityType: "RestaurantMenuHistory", action: "MENU_CHANGE", metadata: "{}" } });
    const history = await (await request.get("/api/restaurant/menu-history")).json(); expect(history.entries.some((entry: { id: string }) => entry.id === foreign.id)).toBe(false);
    expect((await request.post("/api/restaurant/menu-history", { data: { id: foreign.id, reason: "Otra sede no autorizada", confirmed: true } })).status()).toBe(404);
  } finally { await db.membership.update({ where: { id: membership.id }, data: { roleId: previous.id } }); }
});

test("history paginates and explicitly labels legacy records without snapshots", async ({ request }) => {
  await login(request); const { tenantId, branchId, actorId } = await fixture();
  for (let index = 0; index < 23; index++) await db.auditLog.create({ data: { tenantId, branchId, userId: actorId, action: "UPDATE", entityType: "Product", entityId: `legacy-${index}` } });
  const first = await (await request.get("/api/restaurant/menu-history?type=MANUAL")).json(); const second = await (await request.get("/api/restaurant/menu-history?type=MANUAL&page=2")).json();
  expect(first.entries).toHaveLength(20); expect(first.entries[0].history).toBeNull(); expect(second.entries.length).toBeGreaterThan(0);
  expect(first.entries.some((entry: { id: string }) => second.entries.some((other: { id: string }) => other.id === entry.id))).toBe(false);
  const pdf = await (await request.get("/api/restaurant/menu-history?type=PDF")).json(); expect(pdf.entries.every((entry: { history: { source: string } }) => entry.history?.source === "PDF")).toBe(true);
});

test("browser archives a reviewed PDF before applying without calling the AI", async ({ page }) => {
  await login(page.request); const { tenantId, branchId, actorId, area } = await fixture();
  const pdf = await PDFDocument.create(); pdf.addPage(); pdf.setTitle("Revisión archivada desde frontend"); const bytes = Buffer.from(await pdf.save());
  const row = { key: "0-0", page: 1, name: "Producto revisión con archivo", category: "Archivo desde navegador", description: "Revisado", price: 15, kind: "PRODUCT", warning: "", active: false, selected: true, cost: 0 };
  const job = await db.restaurantMenuImport.create({ data: { tenantId, branchId, actorId, filename: "Revisión.pdf", sourceHash: createHash("sha256").update(bytes).digest("hex"), pageCount: 1, nextPage: 1, status: "REVIEW", rows: JSON.stringify([row]) } });
  await page.goto("/t/brasa-norte/menu"); await page.getByRole("button", { name: "Importar carta PDF" }).click(); await page.getByLabel("Borradores guardados").selectOption(job.id);
  await page.getByLabel("Seleccionar PDF o continuar lectura").setInputFiles({ name: "Revisión.pdf", mimeType: "application/pdf", buffer: bytes });
  await expect.poll(async () => (await db.restaurantMenuImport.findUniqueOrThrow({ where: { id: job.id } })).sourceVerified).toBe(true);
  await page.getByLabel("Área de preparación para productos nuevos").selectOption(area.id); await page.getByLabel("Afectación tributaria de productos nuevos").selectOption("GRAVADA"); await page.getByRole("checkbox", { name: /Revisé los precios/ }).check();
  await page.getByRole("button", { name: "Importar 1 productos revisados" }).click(); await expect(page.getByRole("dialog")).toContainText("1 productos importados");
  expect(await db.auditLog.count({ where: { entityType: "RestaurantMenuHistory", entityId: job.id } })).toBe(1);
});
