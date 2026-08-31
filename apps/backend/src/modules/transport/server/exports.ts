import "server-only";
import { prisma } from "@/core/database/prisma";
import type { TenantScope } from "@/core/auth/types";
import type { TransportDataSection } from "./data";
import { recoverStaleTransportJobs } from "@/core/maintenance/housekeeping";
import { logEvent } from "@/core/observability/logging";
import { storeObject } from "@/core/storage/service";

export type TransportExportFormat = "csv" | "excel" | "pdf";
type ExportCell = string | number | boolean | null | undefined;
type ExportRow = Record<string, ExportCell>;

export type TransportExportRequest = {
  section: TransportDataSection;
  format: TransportExportFormat;
  query: string;
  status: string | null;
};

export type TransportExportFile = { name: string; mime: string; data: Buffer; rows: number };

const text = (value: ExportCell) => value == null ? "" : String(value);
const csvCell = (value: ExportCell) => `"${text(value).replaceAll('"', '""')}"`;
const xmlCell = (value: ExportCell) => text(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const ascii = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "?");
const pdfEscape = (value: string) => ascii(value).replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");

function buildCsv(rows: ExportRow[]) {
  const headers = Object.keys(rows[0] ?? { resultado: "Sin registros" });
  return Buffer.from(`\ufeff${[headers.map(csvCell).join(","), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))].join("\r\n")}`, "utf8");
}

function buildExcel(rows: ExportRow[]) {
  const headers = Object.keys(rows[0] ?? { resultado: "Sin registros" });
  const rowXml = [headers, ...rows.map((row) => headers.map((header) => row[header]))]
    .map((row) => `<Row>${row.map((cell) => `<Cell><Data ss:Type="${typeof cell === "number" ? "Number" : "String"}">${xmlCell(cell)}</Data></Cell>`).join("")}</Row>`)
    .join("");
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#D9EAD3" ss:Pattern="Solid"/></Style></Styles><Worksheet ss:Name="Transporte"><Table>${rowXml}</Table></Worksheet></Workbook>`, "utf8");
}

function buildPdf(rows: ExportRow[], title: string) {
  const headers = Object.keys(rows[0] ?? { resultado: "Sin registros" });
  const displayHeaders = headers.map((header) => header.replaceAll("_", " "));
  const pageWidth = 842;
  const pageHeight = 595;
  const margin = 36;
  const tableWidth = pageWidth - margin * 2;
  const columnWidth = tableWidth / headers.length;
  const charactersPerLine = Math.max(6, Math.floor((columnWidth - 8) / 3.55));
  const wrap = (value: ExportCell) => {
    const source = ascii(text(value));
    if (!source) return [""];
    const chunks: string[] = [];
    for (let offset = 0; offset < source.length; offset += charactersPerLine) chunks.push(source.slice(offset, offset + charactersPerLine));
    return chunks;
  };
  const preparedRows = rows.map((row) => headers.map((header) => wrap(row[header])));
  const rowHeight = (cells: string[][]) => Math.max(1, ...cells.map((cell) => cell.length)) * 8 + 8;
  const availableBodyHeight = pageHeight - 106;
  const pages: Array<string[][][]> = [[]];
  let occupied = 0;
  for (const row of preparedRows) {
    const height = rowHeight(row);
    if (pages.at(-1)!.length && occupied + height > availableBodyHeight) { pages.push([]); occupied = 0; }
    pages.at(-1)!.push(row);
    occupied += height;
  }
  const objects: string[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  const pageObjectIds = pages.map((_, index) => 4 + index * 2);
  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  pages.forEach((pageRows, index) => {
    const pageId = pageObjectIds[index];
    const contentId = pageId + 1;
    const commands = [
      `BT /F1 15 Tf ${margin} 558 Td (${pdfEscape(title)}) Tj ET`,
      `BT /F1 7 Tf ${pageWidth - 105} 560 Td (Pagina ${index + 1} de ${pages.length}) Tj ET`,
      `0.92 0.95 0.91 rg ${margin} 525 ${tableWidth} 24 re f`,
      `0.70 0.74 0.70 RG ${margin} 525 ${tableWidth} 24 re S`,
      "0.12 0.15 0.12 rg",
    ];
    displayHeaders.forEach((header, column) => {
      const x = margin + column * columnWidth;
      if (column) commands.push(`${x.toFixed(2)} 525 m ${x.toFixed(2)} 549 l S`);
      commands.push(`BT /F1 6 Tf ${(x + 4).toFixed(2)} 534 Td (${pdfEscape(ascii(header).slice(0, charactersPerLine))}) Tj ET`);
    });
    let top = 525;
    pageRows.forEach((row) => {
      const height = rowHeight(row);
      const bottom = top - height;
      commands.push(`0.82 0.84 0.82 RG ${margin} ${bottom.toFixed(2)} ${tableWidth} ${height.toFixed(2)} re S`);
      row.forEach((cellLines, column) => {
        const x = margin + column * columnWidth;
        if (column) commands.push(`${x.toFixed(2)} ${bottom.toFixed(2)} m ${x.toFixed(2)} ${top.toFixed(2)} l S`);
        cellLines.forEach((line, lineIndex) => commands.push(`BT /F1 6 Tf ${(x + 4).toFixed(2)} ${(top - 10 - lineIndex * 8).toFixed(2)} Td (${pdfEscape(line)}) Tj ET`));
      });
      top = bottom;
    });
    const stream = commands.join("\n");
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`;
  });
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(pdf, "ascii");
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer << /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "ascii");
}

export async function getTransportExportRows(scope: TenantScope, request: TransportExportRequest, limit = 10_000): Promise<ExportRow[]> {
  const q = request.query;
  const status = request.status;
  if (request.section === "operations") return (await prisma.transportTrip.findMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId, ...(status ? { status } : {}), ...(q ? { OR: [{ code: { contains: q } }, { cargoDescription: { contains: q } }, { customer: { legalName: { contains: q } } }] } : {}) }, orderBy: { scheduledStartAt: "desc" }, take: limit, include: { operation: { select: { code: true, name: true } }, customer: { select: { legalName: true } }, route: { select: { name: true } } } })).map((row) => ({ codigo: row.code, operacion: row.operation ? `${row.operation.code} - ${row.operation.name}` : null, cliente: row.customer.legalName, ruta: row.route.name, carga: row.cargoDescription, inicio: row.scheduledStartAt.toISOString(), estado: row.status, flete_centimos: row.freightCents }));
  if (request.section === "fleet") return (await prisma.transportVehicle.findMany({ where: { tenantId: scope.tenantId, ...(status ? { status } : {}), ...(q ? { OR: [{ plate: { contains: q } }, { brand: { contains: q } }, { model: { contains: q } }] } : {}) }, orderBy: { plate: "asc" }, take: limit })).map((row) => ({ placa: row.plate, marca: row.brand, modelo: row.model, anio: row.year, tipo: row.type, kilometraje: row.odometerKm, estado: row.status, activo: row.active }));
  if (request.section === "drivers") return (await prisma.transportDriver.findMany({ where: { tenantId: scope.tenantId, ...(status ? { status } : {}), ...(q ? { OR: [{ firstName: { contains: q } }, { lastName: { contains: q } }, { documentNo: { contains: q } }, { licenseNo: { contains: q } }] } : {}) }, orderBy: { lastName: "asc" }, take: limit })).map((row) => ({ documento: row.documentNo, nombres: row.firstName, apellidos: row.lastName, licencia: row.licenseNo, clase: row.licenseClass, vence: row.licenseDueAt.toISOString(), regimen: row.workRegimeName, estado: row.status }));
  if (request.section === "documents") return (await prisma.transportDocument.findMany({ where: { tenantId: scope.tenantId, ...(status ? { status } : {}), ...(q ? { OR: [{ type: { contains: q } }, { number: { contains: q } }, { ownerType: { contains: q } }] } : {}) }, orderBy: { expiresAt: "asc" }, take: limit })).map((row) => ({ titular_tipo: row.ownerType, titular_id: row.ownerId, documento: row.type, numero: row.number, emision: row.issuedAt?.toISOString(), vencimiento: row.expiresAt?.toISOString(), estado: row.status }));
  if (request.section === "finance") return (await prisma.transportExpense.findMany({ where: { tenantId: scope.tenantId, ...(status ? { status } : {}), ...(q ? { OR: [{ description: { contains: q } }, { category: { contains: q } }, { receiptNo: { contains: q } }] } : {}) }, orderBy: { occurredAt: "desc" }, take: limit, include: { trip: { select: { code: true } } } })).map((row) => ({ fecha: row.occurredAt.toISOString(), viaje: row.trip?.code, categoria: row.category, descripcion: row.description, monto_centimos: row.amountCents, comprobante: row.receiptNo, estado: row.status }));
  if (request.section === "fuel") return (await prisma.transportFuelLog.findMany({ where: { tenantId: scope.tenantId, ...(status ? { status } : {}), ...(q ? { OR: [{ station: { contains: q } }, { invoiceNo: { contains: q } }, { vehicle: { plate: { contains: q } } }] } : {}) }, orderBy: { loadedAt: "desc" }, take: limit, include: { vehicle: { select: { plate: true } }, trip: { select: { code: true } } } })).map((row) => ({ fecha: row.loadedAt.toISOString(), placa: row.vehicle.plate, viaje: row.trip?.code, estacion: row.station, litros: row.liters, total_centimos: row.totalCents, odometro: row.odometerKm, estado: row.status }));
  if (request.section === "maintenance") return (await prisma.transportMaintenanceOrder.findMany({ where: { tenantId: scope.tenantId, ...(status ? { status } : {}), ...(q ? { OR: [{ code: { contains: q } }, { title: { contains: q } }, { vehicle: { plate: { contains: q } } }] } : {}) }, orderBy: { scheduledAt: "desc" }, take: limit, include: { vehicle: { select: { plate: true } } } })).map((row) => ({ orden: row.code, placa: row.vehicle.plate, tipo: row.type, titulo: row.title, prioridad: row.priority, estado: row.status, programada: row.scheduledAt?.toISOString(), costo_estimado_centimos: row.estimatedCents, costo_real_centimos: row.actualCents }));
  if (request.section === "tires") return (await prisma.transportTire.findMany({ where: { tenantId: scope.tenantId, ...(status ? { status } : {}), ...(q ? { OR: [{ serialNo: { contains: q } }, { brand: { contains: q } }, { size: { contains: q } }] } : {}) }, orderBy: { serialNo: "asc" }, take: limit })).map((row) => ({ serie: row.serialNo, marca: row.brand, modelo: row.model, medida: row.size, cocada_actual_mm: row.currentTreadMm, estado: row.status, vehiculo_id: row.currentVehicleId, posicion: row.currentPosition, activo: row.active }));
  return (await prisma.transportParty.findMany({ where: { tenantId: scope.tenantId, ...(status === "ACTIVE" ? { active: true } : status === "INACTIVE" ? { active: false } : {}), ...(q ? { OR: [{ legalName: { contains: q } }, { documentNo: { contains: q } }, { tradeName: { contains: q } }] } : {}) }, orderBy: { legalName: "asc" }, take: limit })).map((row) => ({ tipo: row.kind, documento_tipo: row.documentType, documento: row.documentNo, razon_social: row.legalName, nombre_comercial: row.tradeName, contacto: row.contactName, telefono: row.phone, correo: row.email, activo: row.active }));
}

export async function buildTransportExport(scope: TenantScope, request: TransportExportRequest): Promise<TransportExportFile> {
  const rows = await getTransportExportRows(scope, request);
  const stamp = new Date().toISOString().slice(0, 10);
  const sectionLabel: Record<string, string> = { operations: "Viajes", fleet: "Flota", drivers: "Conductores", documents: "Documentos", finance: "Finanzas", fuel: "Combustible", maintenance: "Mantenimiento", tires: "Neumaticos", settings: "Empresas vinculadas" };
  if (request.format === "pdf") return { name: `transporte-${request.section}-${stamp}.pdf`, mime: "application/pdf", data: buildPdf(rows, `Movendi Go - ${sectionLabel[request.section] ?? request.section}`), rows: rows.length };
  if (request.format === "excel") return { name: `transporte-${request.section}-${stamp}.xls`, mime: "application/vnd.ms-excel; charset=utf-8", data: buildExcel(rows), rows: rows.length };
  return { name: `transporte-${request.section}-${stamp}.csv`, mime: "text/csv; charset=utf-8", data: buildCsv(rows), rows: rows.length };
}

export async function processNextTransportDataJob() {
  const now = new Date();
  await recoverStaleTransportJobs(now);
  let job: Awaited<ReturnType<typeof prisma.transportDataJob.findFirst>> = null;
  for (let claimAttempt = 0; claimAttempt < 10; claimAttempt += 1) {
    const candidate = await prisma.transportDataJob.findFirst({ where: { status: "QUEUED", runAfter: { lte: now } }, orderBy: { createdAt: "asc" } });
    if (!candidate) break;
    const claimedAt = new Date();
    const claimed = await prisma.transportDataJob.updateMany({ where: { id: candidate.id, status: "QUEUED" }, data: { status: "PROCESSING", attempts: { increment: 1 }, startedAt: claimedAt, heartbeatAt: claimedAt } });
    if (claimed.count) { job = candidate; break; }
  }
  if (!job) return null;
  const attempt = job.attempts + 1;
  logEvent("info", "transport_job_started", { jobId: job.id, tenantId: job.tenantId, attempt, maxAttempts: job.maxAttempts });
  try {
    const parameters = JSON.parse(job.parameters) as TransportExportRequest & { branchId: string };
    const file = await buildTransportExport({ tenantId: job.tenantId, branchId: parameters.branchId, actorId: job.actorId, permissions: [] }, parameters);
    const stored = await storeObject({ tenantId: job.tenantId, actorId: job.actorId, purpose: "TRANSPORT_EXPORT", originalName: file.name, mimeType: file.mime, data: file.data, expiresAt: job.expiresAt, scanStatus: "GENERATED" });
    await prisma.transportDataJob.update({ where: { id: job.id }, data: { status: "COMPLETED", resultName: file.name, resultMime: file.mime, resultData: null, storageObjectId: stored.id, completedAt: new Date(), heartbeatAt: new Date(), error: null } });
    logEvent("info", "transport_job_completed", { jobId: job.id, tenantId: job.tenantId, attempt, rows: file.rows, storageObjectId: stored.id, storageProvider: stored.provider });
    return { id: job.id, status: "COMPLETED", rows: file.rows };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    if (attempt < job.maxAttempts) {
      const retrySeconds = Math.min(300, Math.max(1, Number(process.env.JOB_RETRY_BASE_SECONDS ?? 5)) * 2 ** (attempt - 1));
      await prisma.transportDataJob.update({ where: { id: job.id }, data: { status: "QUEUED", error: message.slice(0, 2_000), runAfter: new Date(Date.now() + retrySeconds * 1_000), startedAt: null, heartbeatAt: null, completedAt: null } });
      logEvent("warn", "transport_job_retry_scheduled", { jobId: job.id, tenantId: job.tenantId, attempt, retrySeconds, error: message });
      return { id: job.id, status: "RETRY_SCHEDULED", attempt, retrySeconds };
    }
    await prisma.transportDataJob.update({ where: { id: job.id }, data: { status: "FAILED", error: message.slice(0, 2_000), completedAt: new Date(), heartbeatAt: new Date() } });
    logEvent("error", "transport_job_failed", { jobId: job.id, tenantId: job.tenantId, attempt, error: message });
    return { id: job.id, status: "FAILED", error: message, attempt };
  }
}
