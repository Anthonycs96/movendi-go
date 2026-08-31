import { expect, type Page, test } from "@playwright/test";

const password = "Nexo2026!";
const slug = "andes-cargo";

async function login(page: Page, email = "admin@andes.local") {
  const response = await page.request.post("/api/auth/login", { data: { email, password, businessSlug: slug, rememberSession: false } });
  expect(response.status(), await response.text()).toBe(200);
}

test.describe.serial("Fase 2 · datos de Transporte a escala", () => {
  test("[01/10] una sesión anónima no puede exportar", async ({ request }) => {
    const response = await request.get("/api/transport/exports?section=operations&format=excel");
    expect(response.status()).toBe(401);
  });

  test("[02/10] la API pagina y cuenta viajes en servidor", async ({ page }) => {
    await login(page);
    const response = await page.request.get("/api/data/tenant?section=operations&page=1&pageSize=10");
    expect(response.status()).toBe(200);
    const payload = await response.json();
    expect(payload.data.pagination).toMatchObject({ section: "operations", resource: "trips", page: 1, pageSize: 10, total: 3, totalPages: 1 });
    expect(payload.data.trips).toHaveLength(3);
  });

  test("[03/10] búsqueda de servidor devuelve solo el viaje solicitado", async ({ page }) => {
    await login(page);
    const response = await page.request.get("/api/data/tenant?section=operations&q=VJ-2026-00002&pageSize=10");
    const payload = await response.json();
    expect(payload.data.pagination.total).toBe(1);
    expect(payload.data.trips.map((trip: { code: string }) => trip.code)).toEqual(["VJ-2026-00002"]);
  });

  test("[04/10] filtro de estado se ejecuta en la base", async ({ page }) => {
    await login(page);
    const response = await page.request.get("/api/data/tenant?section=operations&status=DELIVERED&pageSize=10");
    const payload = await response.json();
    expect(payload.data.pagination.total).toBe(1);
    expect(payload.data.trips[0].status).toBe("DELIVERED");
  });

  test("[05/10] controles profesionales conservan filtros en la navegación", async ({ page }) => {
    await login(page);
    await page.goto(`/t/${slug}/operations?q=VJ-2026-00001&pageSize=10`);
    const controls = page.getByRole("region", { name: "Búsqueda y paginación en servidor" });
    await expect(controls).toBeVisible();
    await expect(controls.getByPlaceholder("Buscar en todos los campos principales")).toHaveValue("VJ-2026-00001");
    await expect(controls.getByText(/Mostrando 1–1 de/)).toBeVisible();
    await expect(page.getByText("VJ-2026-00001").first()).toBeVisible();
    await expect(page.getByText("VJ-2026-00002")).toHaveCount(0);
  });

  test("[06/10] exportación Excel produce un libro descargable", async ({ page }) => {
    await login(page);
    const response = await page.request.get("/api/transport/exports?section=operations&format=excel&status=DELIVERED");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/vnd.ms-excel");
    expect(response.headers()["content-disposition"]).toContain(".xls");
    expect(await response.text()).toContain("<Workbook");
    expect(response.headers()["x-export-rows"]).toBe("1");
  });

  test("[07/10] exportación PDF genera un PDF real", async ({ page }) => {
    await login(page);
    const response = await page.request.get("/api/transport/exports?section=fleet&format=pdf");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("application/pdf");
    const bytes = await response.body();
    expect(bytes.subarray(0, 8).toString("ascii")).toContain("%PDF-1.4");
  });

  test("[08/10] importación valida antes de escribir", async ({ page }) => {
    await login(page);
    const response = await page.request.post("/api/transport/imports", { data: { resource: "vehicles", rows: [{ plate: "X" }] } });
    expect(response.status()).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
  });

  test("[09/10] importación CSV crea y luego permite consultar una empresa", async ({ page }) => {
    await login(page);
    const documentNo = "20999990001";
    const imported = await page.request.post("/api/transport/imports", { data: { resource: "parties", rows: [{ kind: "CUSTOMER", documentType: "RUC", documentNo, legalName: "Cliente Fase Dos S.A.C.", phone: "999888777" }] } });
    expect(imported.status(), await imported.text()).toBe(200);
    expect((await imported.json()).imported).toBe(1);
    const lookup = await page.request.get(`/api/data/tenant?section=settings&q=${documentNo}&pageSize=10`);
    const payload = await lookup.json();
    expect(payload.data.pagination.total).toBe(1);
    expect(payload.data.parties[0].legalName).toBe("Cliente Fase Dos S.A.C.");
  });

  test("[10/10] trabajo pesado queda en cola y respeta al actor", async ({ page }) => {
    await login(page);
    const queued = await page.request.post("/api/transport/exports", { data: { section: "operations", format: "excel", query: "", status: null } });
    expect(queued.status(), await queued.text()).toBe(202);
    const job = await queued.json();
    expect(job.status).toBe("QUEUED");
    const pending = await page.request.get(`/api/transport/exports?job=${job.id}`);
    expect(pending.status()).toBe(202);
    expect((await pending.json()).status).toBe("QUEUED");
  });
});
