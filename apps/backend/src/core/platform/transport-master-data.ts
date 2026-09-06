import "server-only";

import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { AppError } from "@/core/auth/errors";
import { prisma } from "@/core/database/prisma";
import { getTransportConfiguration } from "@/modules/transport/server/configuration";
import type { TransportMasterWorkbookDraft } from "./transport-workbook";

const MASTER_DATA_WRITE_BATCH_SIZE = 50;

const optionalText = (max: number) => z.string().trim().max(max).default("");
const configuredKey = z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]+$/).min(1).max(60);
const optionalDate = z.union([z.coerce.date(), z.literal(""), z.null()]).transform((value) => value instanceof Date ? value : null);

const party = z.object({ kind: configuredKey, documentType: z.enum(["RUC", "DNI", "CE", "OTHER"]), documentNo: z.string().trim().min(8).max(20), legalName: z.string().trim().min(2).max(160), tradeName: optionalText(120), contactName: optionalText(120), phone: optionalText(30), email: z.union([z.string().trim().email(), z.literal("")]).default(""), address: optionalText(240) });
const location = z.object({ code: configuredKey.max(20), name: z.string().trim().min(2).max(120), address: optionalText(240), district: optionalText(80), province: optionalText(80), department: optionalText(80), latitude: z.number().min(-90).max(90).nullable(), longitude: z.number().min(-180).max(180).nullable() });
const route = z.object({ code: configuredKey.max(20), name: z.string().trim().min(2).max(140), originCode: configuredKey.max(20), destinationCode: configuredKey.max(20), distanceKm: z.number().positive().max(20_000), estimatedMinutes: z.number().int().positive().max(43_200), tollEstimate: z.number().min(0).max(100_000_000), baseFreight: z.number().min(0).max(100_000_000) });
const vehicle = z.object({ plate: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{5,10}$/), brand: z.string().trim().min(2).max(60), model: z.string().trim().min(1).max(60), year: z.number().int().min(1980).max(new Date().getFullYear() + 1), type: configuredKey, capacityKg: z.number().positive().max(200_000).nullable(), odometerKm: z.number().min(0).max(10_000_000), status: configuredKey, technicalDueAt: optionalDate, soatDueAt: optionalDate, gpsDeviceId: optionalText(80) });
const trailer = z.object({ plate: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{5,10}$/), brand: optionalText(60), model: optionalText(60), type: configuredKey, capacityKg: z.number().positive().max(200_000).nullable(), status: configuredKey });
const driver = z.object({ documentNo: z.string().trim().min(8).max(20), firstName: z.string().trim().min(2).max(80), lastName: z.string().trim().min(2).max(100), type: configuredKey, phone: optionalText(30), email: z.union([z.string().trim().email(), z.literal("")]).default(""), licenseNo: z.string().trim().toUpperCase().min(6).max(30), licenseClass: configuredKey.max(20), licenseDueAt: z.coerce.date(), hireDate: optionalDate, workRegimeKey: configuredKey.max(30), workCycleAnchor: z.coerce.date(), status: configuredKey });

export const transportCustomerMasterDataSchema = z.object({ parties: z.array(party).max(500).default([]), locations: z.array(location).max(500).default([]), routes: z.array(route).max(1_000).default([]) });
export const transportFleetMasterDataSchema = z.object({ vehicles: z.array(vehicle).max(500).default([]), trailers: z.array(trailer).max(500).default([]) });
export const transportDriverMasterDataSchema = z.object({ drivers: z.array(driver).max(500).default([]) });

function activeKeys(items: Array<{ key: string; active: boolean }>) {
  return new Set(items.filter((item) => item.active).map((item) => item.key));
}

function assertUnique(values: string[], label: string) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new AppError("MASTER_DATA_DUPLICATE", 409, `${label} ${value} está repetido en la plantilla.`);
    seen.add(value);
  }
}

function storedObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

export async function stageTransportMasterDataDraft(tenantId: string, masterData: TransportMasterWorkbookDraft, actorId: string) {
  const setup = await prisma.businessSetup.findUnique({ where: { tenantId }, select: { id: true, data: true } });
  if (!setup) throw new AppError("SETUP_NOT_FOUND", 404, "La implementación de esta empresa no existe.");
  let current: Record<string, unknown> = {};
  try { current = storedObject(JSON.parse(setup.data || "{}")); } catch { current = {}; }
  const customers = storedObject(current.TRANSPORT_CUSTOMERS);
  const fleet = storedObject(current.TRANSPORT_FLEET);
  const drivers = storedObject(current.TRANSPORT_DRIVERS);
  const next = {
    ...current,
    TRANSPORT_CUSTOMERS: { ...customers, masterData },
    TRANSPORT_FLEET: { ...fleet, masterData: { vehicles: masterData.vehicles, trailers: masterData.trailers } },
    TRANSPORT_DRIVERS: { ...drivers, masterData: { drivers: masterData.drivers } },
  };
  await prisma.$transaction([
    prisma.businessSetup.update({ where: { tenantId }, data: { data: JSON.stringify(next), updatedById: actorId } }),
    prisma.auditLog.create({ data: { tenantId, userId: actorId, action: "PLATFORM_TRANSPORT_MASTER_STAGED", entityType: "BusinessSetup", entityId: setup.id, metadata: JSON.stringify({ users: masterData.users.length, parties: masterData.parties.length, locations: masterData.locations.length, routes: masterData.routes.length, vehicles: masterData.vehicles.length, trailers: masterData.trailers.length, drivers: masterData.drivers.length }) } }),
  ]);
}

async function runWriteBatches<T>(items: T[], buildOperation: (item: T) => Prisma.PrismaPromise<unknown>) {
  for (let index = 0; index < items.length; index += MASTER_DATA_WRITE_BATCH_SIZE) {
    const batch = items.slice(index, index + MASTER_DATA_WRITE_BATCH_SIZE);
    await prisma.$transaction(batch.map(buildOperation));
  }
}

export async function persistTransportCustomerMasterData(tenantId: string, raw: unknown) {
  const parsed = transportCustomerMasterDataSchema.safeParse(raw);
  if (!parsed.success) throw new AppError("MASTER_DATA_INVALID", 400, "La carga maestra de clientes, ubicaciones o rutas contiene datos inválidos.", parsed.error.flatten());
  const data = parsed.data;
  assertUnique(data.parties.map((item) => `${item.kind}:${item.documentNo}`), "La cuenta");
  assertUnique(data.locations.map((item) => item.code), "La ubicación");
  assertUnique(data.routes.map((item) => item.code), "La ruta");
  const configuration = await getTransportConfiguration(tenantId);
  const partyTypes = activeKeys(configuration.customers.partyTypes);
  for (const item of data.parties) if (!partyTypes.has(item.kind)) throw new AppError("CONFIG_VALUE_NOT_ALLOWED", 409, `El tipo de cuenta ${item.kind} no está habilitado.`);

  const storedLocationsBeforeWrite = await prisma.transportLocation.findMany({ where: { tenantId, active: true }, select: { code: true } });
  const availableLocationCodes = new Set([...storedLocationsBeforeWrite.map((item) => item.code), ...data.locations.map((item) => item.code)]);
  for (const item of data.routes) {
    if (!availableLocationCodes.has(item.originCode) || !availableLocationCodes.has(item.destinationCode)) throw new AppError("ROUTE_LOCATION_NOT_FOUND", 409, `La ruta ${item.code} usa una ubicación que no existe.`);
    if (item.originCode === item.destinationCode) throw new AppError("SAME_LOCATION", 409, `La ruta ${item.code} debe tener origen y destino diferentes.`);
  }

  await runWriteBatches(data.parties, (item) => {
    const values = { documentType: item.documentType, legalName: item.legalName, tradeName: item.tradeName || null, contactName: item.contactName || null, phone: item.phone || null, email: item.email || null, address: item.address || null, active: true };
    return prisma.transportParty.upsert({ where: { tenantId_documentNo_kind: { tenantId, documentNo: item.documentNo, kind: item.kind } }, create: { tenantId, kind: item.kind, documentNo: item.documentNo, ...values }, update: values });
  });
  await runWriteBatches(data.locations, (item) => {
    const values = { name: item.name, address: item.address || null, district: item.district || null, province: item.province || null, department: item.department || null, latitude: item.latitude, longitude: item.longitude, active: true };
    return prisma.transportLocation.upsert({ where: { tenantId_code: { tenantId, code: item.code } }, create: { tenantId, code: item.code, ...values }, update: values });
  });
  const storedLocations = await prisma.transportLocation.findMany({ where: { tenantId, active: true }, select: { id: true, code: true } });
  const locationIds = new Map(storedLocations.map((item) => [item.code, item.id]));
  await runWriteBatches(data.routes, (item) => {
    const originId = locationIds.get(item.originCode)!;
    const destinationId = locationIds.get(item.destinationCode)!;
    const values = { name: item.name, originId, destinationId, distanceKm: item.distanceKm, estimatedMinutes: item.estimatedMinutes, tollEstimateCents: Math.round(item.tollEstimate * 100), baseFreightCents: Math.round(item.baseFreight * 100), active: true };
    return prisma.transportRoute.upsert({ where: { tenantId_code: { tenantId, code: item.code } }, create: { tenantId, code: item.code, ...values }, update: values });
  });
  return { parties: data.parties.length, locations: data.locations.length, routes: data.routes.length };
}

export async function persistTransportFleetMasterData(tenantId: string, raw: unknown) {
  const parsed = transportFleetMasterDataSchema.safeParse(raw);
  if (!parsed.success) throw new AppError("MASTER_DATA_INVALID", 400, "La carga maestra de vehículos o carretas contiene datos inválidos.", parsed.error.flatten());
  const data = parsed.data;
  assertUnique(data.vehicles.map((item) => item.plate), "La placa");
  assertUnique(data.trailers.map((item) => item.plate), "La placa de carreta");
  const configuration = await getTransportConfiguration(tenantId);
  const vehicleTypes = activeKeys(configuration.fleet.vehicleTypes);
  const trailerTypes = activeKeys(configuration.fleet.trailerTypes);
  const statuses = activeKeys(configuration.fleet.vehicleStatuses);
  for (const item of data.vehicles) {
    if (!vehicleTypes.has(item.type)) throw new AppError("CONFIG_VALUE_NOT_ALLOWED", 409, `El tipo de vehículo ${item.type} no está habilitado.`);
    if (!statuses.has(item.status)) throw new AppError("CONFIG_VALUE_NOT_ALLOWED", 409, `El estado de vehículo ${item.status} no está habilitado.`);
  }
  for (const item of data.trailers) {
    if (!trailerTypes.has(item.type)) throw new AppError("CONFIG_VALUE_NOT_ALLOWED", 409, `El tipo de carreta ${item.type} no está habilitado.`);
    if (!statuses.has(item.status)) throw new AppError("CONFIG_VALUE_NOT_ALLOWED", 409, `El estado de carreta ${item.status} no está habilitado.`);
  }
  await runWriteBatches(data.vehicles, (item) => {
    const values = { brand: item.brand, model: item.model, year: item.year, type: item.type, capacityKg: item.capacityKg, odometerKm: item.odometerKm, status: item.status, technicalDueAt: item.technicalDueAt, soatDueAt: item.soatDueAt, gpsDeviceId: item.gpsDeviceId || null, active: true };
    return prisma.transportVehicle.upsert({ where: { tenantId_plate: { tenantId, plate: item.plate } }, create: { tenantId, plate: item.plate, ...values }, update: values });
  });
  await runWriteBatches(data.trailers, (item) => {
    const values = { brand: item.brand || null, model: item.model || null, type: item.type, capacityKg: item.capacityKg, status: item.status, active: true };
    return prisma.transportTrailer.upsert({ where: { tenantId_plate: { tenantId, plate: item.plate } }, create: { tenantId, plate: item.plate, ...values }, update: values });
  });
  return { vehicles: data.vehicles.length, trailers: data.trailers.length };
}

export async function persistTransportDriverMasterData(tenantId: string, raw: unknown) {
  const parsed = transportDriverMasterDataSchema.safeParse(raw);
  if (!parsed.success) throw new AppError("MASTER_DATA_INVALID", 400, "La carga maestra de conductores contiene datos inválidos.", parsed.error.flatten());
  const data = parsed.data;
  assertUnique(data.drivers.map((item) => item.documentNo), "El documento");
  assertUnique(data.drivers.map((item) => item.licenseNo), "La licencia");
  const configuration = await getTransportConfiguration(tenantId);
  const driverTypes = activeKeys(configuration.drivers.driverTypes);
  const driverStatuses = activeKeys(configuration.drivers.driverStatuses);
  const licenseClasses = activeKeys(configuration.drivers.licenseClasses);
  const workRegimes = new Map(configuration.drivers.workRegimes.filter((item) => item.active).map((item) => [item.key, item]));
  for (const item of data.drivers) {
    if (!driverTypes.has(item.type)) throw new AppError("CONFIG_VALUE_NOT_ALLOWED", 409, `El tipo de conductor ${item.type} no está habilitado.`);
    if (!driverStatuses.has(item.status)) throw new AppError("CONFIG_VALUE_NOT_ALLOWED", 409, `El estado de conductor ${item.status} no está habilitado.`);
    if (!licenseClasses.has(item.licenseClass)) throw new AppError("CONFIG_VALUE_NOT_ALLOWED", 409, `La licencia ${item.licenseClass} no está habilitada.`);
    if (!workRegimes.has(item.workRegimeKey)) throw new AppError("CONFIG_VALUE_NOT_ALLOWED", 409, `El régimen ${item.workRegimeKey} no está habilitado.`);
  }
  const storedLicenses = await prisma.transportDriver.findMany({ where: { tenantId, licenseNo: { in: data.drivers.map((item) => item.licenseNo) } }, select: { licenseNo: true, documentNo: true } });
  const licenseOwners = new Map(storedLicenses.map((item) => [item.licenseNo, item.documentNo]));
  for (const item of data.drivers) {
    const ownerDocument = licenseOwners.get(item.licenseNo);
    if (ownerDocument && ownerDocument !== item.documentNo) throw new AppError("DRIVER_LICENSE_DUPLICATE", 409, `La licencia ${item.licenseNo} ya pertenece a otro conductor.`);
  }
  await runWriteBatches(data.drivers, (item) => {
    const regime = workRegimes.get(item.workRegimeKey)!;
    const values = { firstName: item.firstName, lastName: item.lastName, type: item.type, phone: item.phone || null, email: item.email || null, licenseNo: item.licenseNo, licenseClass: item.licenseClass, licenseDueAt: item.licenseDueAt, hireDate: item.hireDate, workRegimeName: regime.label, workDays: regime.workDays, restDays: regime.restDays, workCycleAnchor: item.workCycleAnchor, status: item.status, active: true };
    return prisma.transportDriver.upsert({ where: { tenantId_documentNo: { tenantId, documentNo: item.documentNo } }, create: { tenantId, documentNo: item.documentNo, ...values }, update: values });
  });
  return { drivers: data.drivers.length };
}
