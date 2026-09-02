import "server-only";

import { AppError } from "@/core/auth/errors";
import { prisma } from "@/core/database/prisma";
import { getTransportConfiguration } from "@/modules/transport/server/configuration";
import type { TransportMasterWorkbookDraft } from "./transport-workbook";

function objectValue(value: string | null | undefined) {
  try {
    const parsed = JSON.parse(value ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch { return {}; }
}

function dateValue(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function savedMasterData(setupData: Record<string, unknown>) {
  const steps = ["TRANSPORT_CUSTOMERS", "TRANSPORT_FLEET", "TRANSPORT_DRIVERS"];
  const merged: Partial<TransportMasterWorkbookDraft> = {};
  for (const step of steps) {
    const snapshot = setupData[step];
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) continue;
    const masterData = (snapshot as { masterData?: unknown }).masterData;
    if (!masterData || typeof masterData !== "object" || Array.isArray(masterData)) continue;
    Object.assign(merged, masterData);
  }
  return merged;
}

export async function loadTransportMasterWorkbookContext(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, include: { setup: true, branches: { where: { active: true }, orderBy: { createdAt: "asc" }, take: 1 } } });
  if (!tenant) throw new AppError("TENANT_NOT_FOUND", 404, "El negocio no existe.");
  if (tenant.type !== "TRANSPORT") throw new AppError("INVALID_BUSINESS_TYPE", 409, "La plantilla maestra solo corresponde a empresas de Transporte.");
  if (!tenant.branches[0]) throw new AppError("BRANCH_NOT_FOUND", 409, "La empresa necesita una sede activa.");
  const setupData = objectValue(tenant.setup?.data);
  const saved = savedMasterData(setupData);
  const [configuration, roles, memberships, parties, locations, routes, vehicles, trailers, drivers] = await Promise.all([
    getTransportConfiguration(tenantId),
    prisma.role.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" }, select: { key: true, name: true } }),
    prisma.membership.findMany({ where: { tenantId, active: true }, orderBy: { createdAt: "asc" }, select: { user: { select: { name: true, email: true } }, role: { select: { key: true } } } }),
    prisma.transportParty.findMany({ where: { tenantId, active: true }, orderBy: { createdAt: "asc" } }),
    prisma.transportLocation.findMany({ where: { tenantId, active: true }, orderBy: { createdAt: "asc" } }),
    prisma.transportRoute.findMany({ where: { tenantId, active: true }, orderBy: { createdAt: "asc" }, include: { origin: { select: { code: true } }, destination: { select: { code: true } } } }),
    prisma.transportVehicle.findMany({ where: { tenantId, active: true }, orderBy: { createdAt: "asc" } }),
    prisma.transportTrailer.findMany({ where: { tenantId, active: true }, orderBy: { createdAt: "asc" } }),
    prisma.transportDriver.findMany({ where: { tenantId, active: true }, orderBy: { createdAt: "asc" } }),
  ]);
  const teamStep = setupData.TEAM && typeof setupData.TEAM === "object" && !Array.isArray(setupData.TEAM) ? setupData.TEAM as { roles?: Array<{ key: string; name: string }>; users?: TransportMasterWorkbookDraft["users"] } : null;
  const fallbackRoles = [{ key: "DISPATCH", name: "Despacho" }, { key: "DRIVER_MANAGER", name: "Coordinación de conductores" }, { key: "FINANCE", name: "Finanzas" }, { key: "MAINTENANCE", name: "Mantenimiento" }];
  const storedAndSuggestedRoles = [...roles, ...fallbackRoles.filter((suggestion) => !roles.some((role) => role.key === suggestion.key))];
  const workbookRoles = teamStep?.roles?.length ? teamStep.roles : storedAndSuggestedRoles;
  const database: TransportMasterWorkbookDraft = {
    users: teamStep?.users?.length ? teamStep.users : memberships.map((item) => ({ name: item.user.name, email: item.user.email, roleKey: item.role.key })),
    parties: parties.map((item) => ({ kind: item.kind, documentType: item.documentType as "RUC" | "DNI" | "CE" | "OTHER", documentNo: item.documentNo, legalName: item.legalName, tradeName: item.tradeName ?? "", contactName: item.contactName ?? "", phone: item.phone ?? "", email: item.email ?? "", address: item.address ?? "" })),
    locations: locations.map((item) => ({ code: item.code, name: item.name, address: item.address ?? "", district: item.district ?? "", province: item.province ?? "", department: item.department ?? "", latitude: item.latitude, longitude: item.longitude })),
    routes: routes.map((item) => ({ code: item.code, name: item.name, originCode: item.origin.code, destinationCode: item.destination.code, distanceKm: item.distanceKm, estimatedMinutes: item.estimatedMinutes, tollEstimate: item.tollEstimateCents / 100, baseFreight: item.baseFreightCents / 100 })),
    vehicles: vehicles.map((item) => ({ plate: item.plate, brand: item.brand, model: item.model, year: item.year, type: item.type, capacityKg: item.capacityKg, odometerKm: item.odometerKm, status: item.status, technicalDueAt: dateValue(item.technicalDueAt), soatDueAt: dateValue(item.soatDueAt), gpsDeviceId: item.gpsDeviceId ?? "" })),
    trailers: trailers.map((item) => ({ plate: item.plate, brand: item.brand ?? "", model: item.model ?? "", type: item.type, capacityKg: item.capacityKg, status: item.status })),
    drivers: drivers.map((item) => {
      const regime = configuration.drivers.workRegimes.find((candidate) => candidate.label === item.workRegimeName && candidate.workDays === item.workDays && candidate.restDays === item.restDays) ?? configuration.drivers.workRegimes[0];
      return { documentNo: item.documentNo, firstName: item.firstName, lastName: item.lastName, type: item.type, phone: item.phone ?? "", email: item.email ?? "", licenseNo: item.licenseNo, licenseClass: item.licenseClass, licenseDueAt: dateValue(item.licenseDueAt), hireDate: dateValue(item.hireDate), workRegimeKey: regime?.key ?? "6X1", workCycleAnchor: dateValue(item.workCycleAnchor), status: item.status };
    }),
  };
  const masterData = Object.fromEntries((Object.keys(database) as Array<keyof TransportMasterWorkbookDraft>).map((key) => [key, Array.isArray(saved[key]) && saved[key]!.length ? saved[key] : database[key]])) as TransportMasterWorkbookDraft;
  if (teamStep?.users?.length) masterData.users = teamStep.users;
  return {
    tenantId,
    tenantName: tenant.name,
    tenantSlug: tenant.slug,
    masterData,
    lists: {
      roles: workbookRoles,
      partyTypes: configuration.customers.partyTypes.filter((item) => item.active).map((item) => item.key),
      vehicleTypes: configuration.fleet.vehicleTypes.filter((item) => item.active).map((item) => item.key),
      trailerTypes: configuration.fleet.trailerTypes.filter((item) => item.active).map((item) => item.key),
      vehicleStatuses: configuration.fleet.vehicleStatuses.filter((item) => item.active).map((item) => item.key),
      driverTypes: configuration.drivers.driverTypes.filter((item) => item.active).map((item) => item.key),
      driverStatuses: configuration.drivers.driverStatuses.filter((item) => item.active).map((item) => item.key),
      licenseClasses: configuration.drivers.licenseClasses.filter((item) => item.active).map((item) => item.key),
      workRegimes: configuration.drivers.workRegimes.filter((item) => item.active).map((item) => item.key),
    },
  };
}
