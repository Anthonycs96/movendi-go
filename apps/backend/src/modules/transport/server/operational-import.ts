import "server-only";

import ExcelJS, { type CellValue } from "exceljs";
import { AppError } from "@/core/auth/errors";
import { prisma } from "@/core/database/prisma";
import type { TenantScope } from "@/core/auth/types";
import { getTransportConfiguration } from "./configuration";
import { normalizeCustomFieldValue, saveTripCustomFields } from "./custom-fields";
import { reserveTransportCode } from "./sequence";

type Mapping = { sourceColumn: string; targetType: string; targetKey: string; fieldId: string | null; required: boolean; defaultValue: string | null };
type NormalizedTripRow = { tripId: string | null; operationId: string | null; customerId: string; routeId: string; serviceType: string; cargoDescription: string; cargoWeightKg: number | null; scheduledStartAt: string; scheduledEndAt: string; appointmentStartAt: string | null; appointmentEndAt: string | null; priority: string; referenceNo: string | null; notes: string | null; freightCents: number; budgetCents: number; customFields: Array<{ fieldId: string; value: unknown }> };

function cellValue(value: CellValue): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    if ("result" in value) return cellValue(value.result as CellValue);
    if ("text" in value) return value.text;
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
  }
  return value ?? "";
}

function dateValue(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function numberValue(value: unknown, fallback = 0) {
  const number = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) ? number : fallback;
}

const aliases: Record<string, string> = {
  "CODIGO MOVENDI": "code", CODIGO: "code", CLIENTE: "customerDocument", "RUC CLIENTE": "customerDocument", "DOCUMENTO CLIENTE": "customerDocument",
  RUTA: "routeCode", "CODIGO RUTA": "routeCode", SERVICIO: "serviceType", "TIPO SERVICIO": "serviceType", CARGA: "cargoDescription", "DESCRIPCION CARGA": "cargoDescription", PESO: "cargoWeightKg", "PESO KG": "cargoWeightKg",
  SALIDA: "scheduledStartAt", "FECHA SALIDA": "scheduledStartAt", LLEGADA: "scheduledEndAt", "FECHA LLEGADA": "scheduledEndAt", "CITA INICIO": "appointmentStartAt", "CITA FIN": "appointmentEndAt", PRIORIDAD: "priority", REFERENCIA: "referenceNo", "REFERENCIA HEREDADA": "referenceNo", NOTAS: "notes", FLETE: "freight", PRESUPUESTO: "budget",
};

function normalizedHeader(value: unknown) {
  return String(value ?? "").trim().replace(/\*/g, "").replace(/\s*\[[^\]]+\]\s*$/, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

export async function previewOperationalWorkbook(scope: TenantScope, buffer: Buffer, fileName: string, profileId?: string | null) {
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]); } catch { throw new AppError("WORKBOOK_INVALID", 400, "No pudimos leer el archivo Excel."); }
  if (workbook.worksheets.length < 1 || workbook.worksheets.length > 10) throw new AppError("WORKBOOK_INVALID", 400, "El archivo debe contener entre 1 y 10 hojas.");
  const profile = profileId ? await prisma.transportImportProfile.findFirst({ where: { id: profileId, tenantId: scope.tenantId, active: true }, include: { mappings: true, identityField: true } }) : null;
  if (profileId && !profile) throw new AppError("IMPORT_PROFILE_NOT_FOUND", 404, "La plantilla de importación no existe.");
  const sheet = profile?.worksheetName ? workbook.getWorksheet(profile.worksheetName) : workbook.worksheets[0];
  if (!sheet) throw new AppError("WORKSHEET_NOT_FOUND", 400, "La hoja configurada no existe en el Excel.");
  const headerRow = profile?.headerRow ?? 1;
  if (sheet.rowCount - headerRow > 2_000) throw new AppError("WORKBOOK_TOO_LARGE", 413, "El archivo admite hasta 2,000 viajes por lote.");
  const headers = sheet.getRow(headerRow).values as CellValue[];
  const columns = headers.slice(1).map((value, index) => ({ index: index + 1, name: String(cellValue(value) ?? "").trim() })).filter((item) => item.name);
  const definitions = await prisma.transportCustomFieldDefinition.findMany({ where: { tenantId: scope.tenantId, entityType: "TRIP", active: true, importable: true } });
  const configuration = await getTransportConfiguration(scope.tenantId);
  const serviceTypes = new Set(configuration.operations.serviceTypes.filter((item) => item.active).map((item) => item.key));
  const priorities = new Set(configuration.operations.priorities.filter((item) => item.active).map((item) => item.key));
  const automaticMappings: Mapping[] = [];
  for (const column of columns) {
    const normalized = normalizedHeader(column.name);
    const definition = definitions.find((item) => normalizedHeader(item.code) === normalized || normalizedHeader(item.label) === normalized);
    if (definition) { automaticMappings.push({ sourceColumn: column.name, targetType: "CUSTOM", targetKey: definition.code, fieldId: definition.id, required: definition.required, defaultValue: null }); continue; }
    const targetKey = aliases[normalized];
    if (targetKey) automaticMappings.push({ sourceColumn: column.name, targetType: "CORE", targetKey, fieldId: null, required: ["customerDocument", "routeCode", "serviceType", "cargoDescription", "scheduledStartAt", "scheduledEndAt"].includes(targetKey), defaultValue: null });
  }
  const mappings = (profile?.mappings ?? automaticMappings) as Mapping[];
  const customerDocuments = new Set<string>();
  const routeCodes = new Set<string>();
  const rawRows: Array<{ rowNumber: number; values: Record<string, unknown> }> = [];
  for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const values = Object.fromEntries(columns.map((column) => [column.name, cellValue(sheet.getRow(rowNumber).getCell(column.index).value)]));
    if (!Object.values(values).some((value) => String(value ?? "").trim())) continue;
    rawRows.push({ rowNumber, values });
    for (const mapping of mappings) {
      const value = values[mapping.sourceColumn] ?? mapping.defaultValue;
      if (mapping.targetKey === "customerDocument") customerDocuments.add(String(value ?? "").trim());
      if (mapping.targetKey === "routeCode") routeCodes.add(String(value ?? "").trim().toUpperCase());
    }
  }
  const [customers, routes] = await Promise.all([
    prisma.transportParty.findMany({ where: { tenantId: scope.tenantId, kind: "CUSTOMER", documentNo: { in: [...customerDocuments] } }, select: { id: true, documentNo: true } }),
    prisma.transportRoute.findMany({ where: { tenantId: scope.tenantId, code: { in: [...routeCodes] } }, select: { id: true, code: true } }),
  ]);
  const customerByDocument = new Map(customers.map((item) => [item.documentNo, item.id]));
  const routeByCode = new Map(routes.map((item) => [item.code, item.id]));
  const previews = [];
  for (const raw of rawRows) {
    const core: Record<string, unknown> = {};
    const customFields: NormalizedTripRow["customFields"] = [];
    const errors: string[] = [];
    for (const mapping of mappings) {
      const value = raw.values[mapping.sourceColumn] ?? mapping.defaultValue ?? "";
      if (mapping.required && !String(value ?? "").trim()) errors.push(`Falta ${mapping.sourceColumn}.`);
      if (mapping.targetType === "CUSTOM" && mapping.fieldId) customFields.push({ fieldId: mapping.fieldId, value });
      else core[mapping.targetKey] = value;
    }
    const customerId = customerByDocument.get(String(core.customerDocument ?? "").trim());
    const routeId = routeByCode.get(String(core.routeCode ?? "").trim().toUpperCase());
    if (!customerId) errors.push("Cliente no encontrado por documento.");
    if (profile?.scopeType === "CUSTOMER" && customerId && profile.scopeId !== customerId) errors.push("El cliente no corresponde al alcance del perfil.");
    if (!routeId) errors.push("Ruta no encontrada por código.");
    const scheduledStartAt = dateValue(core.scheduledStartAt);
    const scheduledEndAt = dateValue(core.scheduledEndAt);
    if (!scheduledStartAt || !scheduledEndAt || scheduledEndAt <= scheduledStartAt) errors.push("El rango de salida y llegada no es válido.");
    if (!serviceTypes.has(String(core.serviceType ?? "").trim().toUpperCase())) errors.push("El tipo de servicio no está activo en la configuración.");
    if (!priorities.has(String(core.priority || "NORMAL").trim().toUpperCase())) errors.push("La prioridad no está activa en la configuración.");
    let tripId: string | null = null;
    const identityStrategy = profile?.identityStrategy ?? "INTERNAL_CODE";
    if (identityStrategy === "INTERNAL_CODE" && core.code) tripId = (await prisma.transportTrip.findFirst({ where: { tenantId: scope.tenantId, branchId: scope.branchId, code: String(core.code).trim().toUpperCase() }, select: { id: true } }))?.id ?? null;
    if (identityStrategy === "INTERNAL_CODE" && core.code && !tripId) errors.push("El Código MOVENDI indicado no existe; déjalo vacío para crear.");
    if (profile?.identityStrategy === "CUSTOM_FIELD" && profile.identityFieldId) {
      const mapped = customFields.find((item) => item.fieldId === profile.identityFieldId);
      if (mapped?.value) tripId = (await prisma.transportCustomFieldValue.findFirst({ where: { tenantId: scope.tenantId, definitionId: profile.identityFieldId, normalizedValue: normalizeCustomFieldValue(mapped.value), trip: { branchId: scope.branchId } }, select: { tripId: true } }))?.tripId ?? null;
      else errors.push("Falta la clave externa configurada para identificar el viaje.");
    }
    const normalized: NormalizedTripRow | null = customerId && routeId && scheduledStartAt && scheduledEndAt ? { tripId, operationId: profile?.scopeType === "OPERATION" ? profile.scopeId : null, customerId, routeId, serviceType: String(core.serviceType ?? "").trim().toUpperCase(), cargoDescription: String(core.cargoDescription ?? "").trim(), cargoWeightKg: core.cargoWeightKg ? numberValue(core.cargoWeightKg) : null, scheduledStartAt, scheduledEndAt, appointmentStartAt: dateValue(core.appointmentStartAt), appointmentEndAt: dateValue(core.appointmentEndAt), priority: String(core.priority || "NORMAL").trim().toUpperCase(), referenceNo: String(core.referenceNo || "").trim() || null, notes: String(core.notes || "").trim() || null, freightCents: Math.round(numberValue(core.freight) * 100), budgetCents: Math.round(numberValue(core.budget) * 100), customFields } : null;
    previews.push({ rowNumber: raw.rowNumber, action: tripId ? "UPDATE" : "CREATE", status: errors.length ? "INVALID" : "VALID", rawData: raw.values, normalizedData: normalized, errors });
  }
  const batch = await prisma.transportImportBatch.create({ data: { tenantId: scope.tenantId, profileId: profile?.id ?? null, fileName, mode: "PREVIEW", status: previews.some((item) => item.status === "INVALID") ? "REVIEW" : "READY", totalRows: previews.length, validRows: previews.filter((item) => item.status === "VALID").length, invalidRows: previews.filter((item) => item.status === "INVALID").length, createdById: scope.actorId, rows: { create: previews.map((item) => ({ rowNumber: item.rowNumber, action: item.action, status: item.status, tripId: item.normalizedData?.tripId ?? null, rawData: JSON.stringify(item.rawData), normalizedData: item.normalizedData ? JSON.stringify(item.normalizedData) : null, errors: item.errors.length ? JSON.stringify(item.errors) : null })) } } });
  return { batchId: batch.id, headers: columns.map((item) => item.name), mappings, totalRows: batch.totalRows, validRows: batch.validRows, invalidRows: batch.invalidRows, rows: previews.slice(0, 100).map((item) => ({ rowNumber: item.rowNumber, action: item.action, status: item.status, errors: item.errors, values: item.rawData })) };
}

export async function commitOperationalImport(scope: TenantScope, batchId: string) {
  const batch = await prisma.transportImportBatch.findFirst({ where: { id: batchId, tenantId: scope.tenantId }, include: { rows: { orderBy: { rowNumber: "asc" } } } });
  if (!batch) throw new AppError("IMPORT_BATCH_NOT_FOUND", 404, "La previsualización ya no existe.");
  if (batch.status === "COMMITTED") return { created: batch.createdRows, updated: batch.updatedRows };
  if (batch.invalidRows) throw new AppError("IMPORT_HAS_ERRORS", 409, "Corrige las filas inválidas antes de confirmar la importación.");
  const configuration = await getTransportConfiguration(scope.tenantId);
  const prepared: Array<{ row: typeof batch.rows[number]; value: NormalizedTripRow; reservedCode: string | null }> = [];
  for (const row of batch.rows) {
    const value = JSON.parse(row.normalizedData ?? "null") as NormalizedTripRow | null;
    if (!value) continue;
    const reservedCode = value.tripId ? null : await reserveTransportCode({ tenantId: scope.tenantId, branchId: scope.branchId, kind: "TRIP", prefix: configuration.general.tripPrefix });
    prepared.push({ row, value, reservedCode });
  }
  let created = 0;
  let updated = 0;
  await prisma.$transaction(async (tx) => {
    for (const { row, value, reservedCode } of prepared) {
      if (value.tripId) {
        const current = await tx.transportTrip.findFirst({ where: { id: value.tripId, tenantId: scope.tenantId, branchId: scope.branchId } });
        if (!current) throw new AppError("IMPORT_TRIP_NOT_FOUND", 409, `El viaje de la fila ${row.rowNumber} ya no existe.`);
        await tx.transportTrip.update({ where: { id: current.id }, data: { operationId: value.operationId, customerId: value.customerId, routeId: value.routeId, serviceType: value.serviceType, cargoDescription: value.cargoDescription, cargoWeightKg: value.cargoWeightKg, scheduledStartAt: new Date(value.scheduledStartAt), scheduledEndAt: new Date(value.scheduledEndAt), appointmentStartAt: value.appointmentStartAt ? new Date(value.appointmentStartAt) : null, appointmentEndAt: value.appointmentEndAt ? new Date(value.appointmentEndAt) : null, appointmentStatus: value.appointmentStartAt ? "PENDING" : "NONE", priority: value.priority, referenceNo: value.referenceNo, notes: value.notes, freightCents: value.freightCents, budgetCents: value.budgetCents, version: { increment: 1 } } });
        await saveTripCustomFields(tx, { tenantId: scope.tenantId, tripId: current.id, customerId: value.customerId, operationId: value.operationId, values: value.customFields, enforceRequired: true });
        await tx.transportTripEvent.create({ data: { tenantId: scope.tenantId, tripId: current.id, type: "IMPORTED_UPDATE", payload: JSON.stringify({ batchId, rowNumber: row.rowNumber }), actorId: scope.actorId } });
        await tx.transportImportRowResult.update({ where: { id: row.id }, data: { status: "COMMITTED", tripId: current.id } });
        updated += 1;
      } else {
        const trip = await tx.transportTrip.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, code: reservedCode!, operationId: value.operationId, customerId: value.customerId, routeId: value.routeId, serviceType: value.serviceType, cargoDescription: value.cargoDescription, cargoWeightKg: value.cargoWeightKg, scheduledStartAt: new Date(value.scheduledStartAt), scheduledEndAt: new Date(value.scheduledEndAt), appointmentStartAt: value.appointmentStartAt ? new Date(value.appointmentStartAt) : null, appointmentEndAt: value.appointmentEndAt ? new Date(value.appointmentEndAt) : null, appointmentStatus: value.appointmentStartAt ? "PENDING" : "NONE", priority: value.priority, referenceNo: value.referenceNo, notes: value.notes, freightCents: value.freightCents, budgetCents: value.budgetCents } });
        await saveTripCustomFields(tx, { tenantId: scope.tenantId, tripId: trip.id, customerId: value.customerId, operationId: value.operationId, values: value.customFields, enforceRequired: true });
        await tx.transportTripEvent.create({ data: { tenantId: scope.tenantId, tripId: trip.id, type: "IMPORTED_CREATE", payload: JSON.stringify({ batchId, rowNumber: row.rowNumber }), actorId: scope.actorId } });
        await tx.transportImportRowResult.update({ where: { id: row.id }, data: { status: "COMMITTED", tripId: trip.id } });
        created += 1;
      }
    }
    await tx.transportImportBatch.update({ where: { id: batchId }, data: { status: "COMMITTED", mode: "COMMIT", createdRows: created, updatedRows: updated, committedAt: new Date() } });
  }, { maxWait: 5_000, timeout: Math.max(10_000, prepared.length * 250) });
  return { created, updated };
}
