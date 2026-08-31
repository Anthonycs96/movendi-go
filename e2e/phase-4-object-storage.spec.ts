import { createHash } from "node:crypto";
import { expect, type APIRequestContext, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const password = "Nexo2026!";
const workerSecret = "phase-3-e2e-worker-secret-0001";
const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF", "ascii");
let vehicleId = "";
let documentId = "";
let exportJobId = "";
let exportObjectId = "";

async function login(request: APIRequestContext, email = "admin@andes.local", businessSlug = "andes-cargo") {
  const response = await request.post("/api/auth/login", { data: { email, password, businessSlug, rememberSession: false } });
  expect(response.status(), await response.text()).toBe(200);
}

async function firstVehicle(request: APIRequestContext) {
  const payload = await (await request.get("/api/data/tenant?section=fleet&pageSize=10")).json();
  return payload.data.vehicles[0].id as string;
}

test.describe.serial("Fase 4 · almacenamiento privado de objetos", () => {
  test.afterAll(async () => prisma.$disconnect());

  test("[01/16] una sesión anónima no puede cargar documentos", async ({ request }) => {
    const response = await request.post("/api/transport/documents", { multipart: { ownerType: "VEHICLE", ownerId: "none", type: "SOAT" } });
    expect(response.status()).toBe(401);
  });

  test("[02/16] RBAC impide cargar al despachador sin permiso de escritura", async ({ page }) => {
    await login(page.request, "despacho@andes.local");
    vehicleId = await firstVehicle(page.request);
    const response = await page.request.post("/api/transport/documents", { multipart: { ownerType: "VEHICLE", ownerId: vehicleId, type: "SOAT" } });
    expect(response.status()).toBe(403);
  });

  test("[03/16] rechaza un titular de otra empresa antes de almacenar", async ({ page }) => {
    await login(page.request);
    const before = await prisma.storedObject.count();
    const response = await page.request.post("/api/transport/documents", { multipart: { ownerType: "VEHICLE", ownerId: "vehicle-foreign", type: "SOAT", file: { name: "soat.pdf", mimeType: "application/pdf", buffer: pdf } } });
    expect(response.status()).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_DOCUMENT_OWNER");
    expect(await prisma.storedObject.count()).toBe(before);
  });

  test("[04/16] rechaza ejecutables aunque declaren un MIME permitido", async ({ page }) => {
    await login(page.request);
    const response = await page.request.post("/api/transport/documents", { multipart: { ownerType: "VEHICLE", ownerId: vehicleId, type: "SOAT", file: { name: "malware.pdf", mimeType: "application/pdf", buffer: Buffer.from("MZ-not-a-pdf") } } });
    expect(response.status()).toBe(415);
    expect((await response.json()).error.code).toBe("UNSUPPORTED_FILE");
  });

  test("[05/16] detecta diferencia entre MIME y firma real", async ({ page }) => {
    await login(page.request);
    const response = await page.request.post("/api/transport/documents", { multipart: { ownerType: "VEHICLE", ownerId: vehicleId, type: "SOAT", file: { name: "imagen.png", mimeType: "image/png", buffer: pdf } } });
    expect(response.status()).toBe(415);
    expect((await response.json()).error.code).toBe("FILE_TYPE_MISMATCH");
  });

  test("[06/16] permite registrar metadatos sin adjunto", async ({ page }) => {
    await login(page.request);
    const response = await page.request.post("/api/transport/documents", { multipart: { ownerType: "VEHICLE", ownerId: vehicleId, type: "TARJETA", number: "TIV-2026" } });
    expect(response.status()).toBe(200);
    expect((await response.json()).storageObjectId).toBeNull();
  });

  test("[07/16] almacena PDF con hash, tamaño y clave aislada", async ({ page }) => {
    await login(page.request);
    const response = await page.request.post("/api/transport/documents", { multipart: { ownerType: "VEHICLE", ownerId: vehicleId, type: "SOAT DIGITAL", number: "SOAT-2026-001", file: { name: "soat-unidad-01.pdf", mimeType: "application/pdf", buffer: pdf } } });
    expect(response.status(), await response.text()).toBe(200);
    const payload = await response.json();
    documentId = payload.id;
    const stored = await prisma.storedObject.findUniqueOrThrow({ where: { id: payload.storageObjectId } });
    expect(stored.provider).toBe("local");
    expect(stored.key).toMatch(/^tenants\/tenant-andes\/documents\//);
    expect(stored.sha256).toBe(createHash("sha256").update(pdf).digest("hex"));
    expect(stored.sizeBytes).toBe(pdf.byteLength);
    expect(stored.scanStatus).toBe("SKIPPED");
  });

  test("[08/16] la API expone una ruta autorizada y no la clave física", async ({ page }) => {
    await login(page.request);
    const payload = await (await page.request.get("/api/data/tenant?section=documents&pageSize=100")).json();
    const document = payload.data.documents.find((item: { id: string }) => item.id === documentId);
    expect(document.fileUrl).toBe(`/api/transport/documents/${documentId}/file`);
    expect(JSON.stringify(document)).not.toContain("tenants/tenant-andes");
  });

  test("[09/16] descarga el archivo exacto con cabeceras seguras", async ({ page }) => {
    await login(page.request);
    const response = await page.request.get(`/api/transport/documents/${documentId}/file`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("application/pdf");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(await response.body()).toEqual(pdf);
  });

  test("[10/16] la UI muestra el documento como descarga privada", async ({ page }) => {
    await login(page.request);
    await page.goto("/t/andes-cargo/documents");
    await expect(page.getByText("soat-unidad-01.pdf")).toBeVisible();
    await expect(page.getByRole("link", { name: /soat-unidad-01.pdf/ })).toHaveAttribute("href", `/api/transport/documents/${documentId}/file`);
  });

  test("[11/16] otro rubro no puede usar el identificador del documento", async ({ page }) => {
    await login(page.request, "admin@nova.local", "nova-studio");
    const response = await page.request.get(`/api/transport/documents/${documentId}/file`);
    expect(response.status()).toBe(403);
  });

  test("[12/16] exportación asíncrona deja de guardar Base64 en la base", async ({ page }) => {
    await login(page.request);
    const queued = await page.request.post("/api/transport/exports", { data: { section: "operations", format: "pdf", query: "", status: null } });
    exportJobId = (await queued.json()).id;
    const processed = await page.request.post("/api/internal/jobs/transport", { headers: { "x-job-runner-secret": workerSecret } });
    expect(processed.status()).toBe(200);
    const job = await prisma.transportDataJob.findUniqueOrThrow({ where: { id: exportJobId }, include: { storageObject: true } });
    expect(job.status).toBe("COMPLETED");
    expect(job.resultData).toBeNull();
    expect(job.storageObject?.key).toMatch(/^tenants\/tenant-andes\/exports\//);
    exportObjectId = job.storageObjectId!;
    const download = await page.request.get(`/api/transport/exports?job=${exportJobId}`);
    expect(download.status()).toBe(200);
    expect((await download.body()).subarray(0, 8).toString("ascii")).toContain("%PDF-1.4");
  });

  test("[13/16] otro actor del tenant no descarga la exportación", async ({ page }) => {
    await login(page.request, "despacho@andes.local");
    const response = await page.request.get(`/api/transport/exports?job=${exportJobId}`);
    expect(response.status()).toBe(404);
  });

  test("[14/16] housekeeping elimina físicamente el objeto expirado", async ({ request }) => {
    await prisma.storedObject.update({ where: { id: exportObjectId }, data: { expiresAt: new Date(Date.now() - 1_000) } });
    const response = await request.post("/api/internal/maintenance", { headers: { "x-job-runner-secret": workerSecret } });
    expect(response.status()).toBe(200);
    const object = await prisma.storedObject.findUniqueOrThrow({ where: { id: exportObjectId } });
    const job = await prisma.transportDataJob.findUniqueOrThrow({ where: { id: exportJobId } });
    expect(object.status).toBe("DELETED");
    expect(job.status).toBe("EXPIRED");
  });

  test("[15/16] readiness informa proveedor y objetos activos", async ({ request }) => {
    const payload = await (await request.get("/api/ready")).json();
    expect(payload.storage).toEqual(expect.objectContaining({ status: "configured", provider: "local", activeObjects: expect.any(Number) }));
    expect(payload.storage.activeObjects).toBeGreaterThan(0);
  });

  test("[16/16] Super Admin recibe métricas reales de almacenamiento", async ({ page }) => {
    await login(page.request, "superadmin@multisaas.local", "nova-studio");
    const payload = await (await page.request.get("/api/data/platform")).json();
    expect(payload.data.system.storageProvider).toBe("local");
    expect(payload.data.system.storedObjects).toBeGreaterThan(0);
    expect(payload.data.system.storedBytes).toBeGreaterThan(0);
  });
});
