import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDb = resolve(repositoryRoot, "apps", "backend", "prisma", "dev.db");
const temporaryRoot = await mkdtemp(resolve(tmpdir(), "movendi-transport-load-"));
const temporaryDb = resolve(temporaryRoot, "load.db");
const records = Math.min(100_000, Math.max(10_000, Number(process.env.TRANSPORT_LOAD_RECORDS ?? 10_000)));

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

async function measure(name, action, repetitions = 15) {
  const samples = [];
  for (let index = 0; index < repetitions; index += 1) {
    const startedAt = performance.now();
    await action();
    samples.push(performance.now() - startedAt);
  }
  return { name, runs: repetitions, p50Ms: Number(percentile(samples, 0.5).toFixed(2)), p95Ms: Number(percentile(samples, 0.95).toFixed(2)), maxMs: Number(Math.max(...samples).toFixed(2)) };
}

let prisma;
try {
  await copyFile(sourceDb, temporaryDb);
  process.env.DATABASE_URL = `file:${temporaryDb.replaceAll("\\", "/")}`;
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient({ log: ["error"] });
  const tenant = await prisma.tenant.findFirst({ where: { type: "TRANSPORT" }, select: { id: true } });
  if (!tenant) throw new Error("No existe un tenant Transporte para preparar la prueba.");
  const [branch, customer, route] = await Promise.all([
    prisma.branch.findFirst({ where: { tenantId: tenant.id }, select: { id: true } }),
    prisma.transportParty.findFirst({ where: { tenantId: tenant.id, kind: "CUSTOMER" }, select: { id: true } }),
    prisma.transportRoute.findFirst({ where: { tenantId: tenant.id }, select: { id: true } }),
  ]);
  if (!branch || !customer || !route) throw new Error("Faltan sucursal, cliente o ruta base en Transporte.");

  const prefix = `LOAD-${Date.now()}`;
  const insertStartedAt = performance.now();
  for (let offset = 0; offset < records; offset += 500) {
    const size = Math.min(500, records - offset);
    await prisma.transportTrip.createMany({ data: Array.from({ length: size }, (_, relative) => {
      const index = offset + relative;
      const start = new Date(Date.now() - index * 60_000);
      return { id: `${prefix}-${index}`, tenantId: tenant.id, branchId: branch.id, code: `${prefix}-${String(index).padStart(6, "0")}`, customerId: customer.id, routeId: route.id, serviceType: index % 2 ? "CARGA_GENERAL" : "DISTRIBUCION", cargoDescription: `Carga realista ${index}`, cargoWeightKg: 1_000 + index % 20_000, scheduledStartAt: start, scheduledEndAt: new Date(start.getTime() + 3_600_000), status: ["DRAFT", "ASSIGNED", "IN_TRANSIT", "DELIVERED"][index % 4], priority: index % 20 === 0 ? "HIGH" : "NORMAL", freightCents: 100_000 + index, budgetCents: 80_000 + index };
    }) });
  }
  const insertionMs = performance.now() - insertStartedAt;
  const total = await prisma.transportTrip.count({ where: { tenantId: tenant.id, branchId: branch.id } });
  const measurements = await Promise.all([
    measure("pagina_inicial_25", () => prisma.transportTrip.findMany({ where: { tenantId: tenant.id, branchId: branch.id }, orderBy: { scheduledStartAt: "desc" }, take: 25, select: { id: true, code: true, status: true } })),
    measure("pagina_profunda_25", () => prisma.transportTrip.findMany({ where: { tenantId: tenant.id, branchId: branch.id }, orderBy: { scheduledStartAt: "desc" }, skip: Math.max(0, records - 25), take: 25, select: { id: true, code: true, status: true } })),
    measure("filtro_estado", () => prisma.transportTrip.findMany({ where: { tenantId: tenant.id, branchId: branch.id, status: "IN_TRANSIT" }, orderBy: { scheduledStartAt: "desc" }, take: 25, select: { id: true, code: true } })),
    measure("busqueda_codigo", () => prisma.transportTrip.findMany({ where: { tenantId: tenant.id, branchId: branch.id, code: { contains: `${prefix}-009999` } }, take: 25, select: { id: true, code: true } })),
    measure("conteo_filtrado", () => prisma.transportTrip.count({ where: { tenantId: tenant.id, branchId: branch.id, status: "DELIVERED" } })),
  ]);
  console.log(JSON.stringify({ isolatedDatabase: true, recordsInserted: records, totalTransportTrips: total, insertionMs: Number(insertionMs.toFixed(2)), measurements }, null, 2));
} finally {
  if (prisma) await prisma.$disconnect();
  const safeTemporaryRoot = resolve(temporaryRoot);
  const expectedPrefix = resolve(tmpdir(), "movendi-transport-load-");
  if (!safeTemporaryRoot.startsWith(expectedPrefix) || safeTemporaryRoot === resolve(tmpdir()) || !safeTemporaryRoot.includes(`${sep}movendi-transport-load-`)) throw new Error("La ruta temporal no superó la validación de seguridad.");
  await rm(safeTemporaryRoot, { recursive: true, force: true });
}
