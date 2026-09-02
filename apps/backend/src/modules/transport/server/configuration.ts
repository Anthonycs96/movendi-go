import "server-only";

import type { TransportCatalogOption, TransportConfiguration } from "@movendi/contracts";
import { z } from "zod";
import { prisma } from "@/core/database/prisma";
import { AppError } from "@/core/auth/errors";
import type { TenantScope } from "@/core/auth/types";
import { audit } from "@/core/audit/audit";

const option = (key: string, label: string): TransportCatalogOption => ({ key, label, active: true });

export const defaultTransportConfiguration: TransportConfiguration = {
  version: 1,
  general: { operationPrefix: "OP", tripPrefix: "VJ", maintenancePrefix: "OT", distanceUnit: "KM", weightUnit: "KG", volumeUnit: "L", automaticNumbering: true },
  operations: {
    serviceTypes: [option("LOCAL", "Local"), option("PROVINCE", "Provincia"), option("DISTRIBUTION", "Reparto"), option("TRANSFER", "Traslado"), option("RETURN", "Retorno"), option("BITRAIN", "Bitren")],
    tripStatuses: [
      { ...option("DRAFT", "Borrador"), terminal: false, allowedNext: ["PLANNED", "CANCELLED"] },
      { ...option("PLANNED", "Planificado"), terminal: false, allowedNext: ["ASSIGNED", "CANCELLED"] },
      { ...option("ASSIGNED", "Asignado"), terminal: false, allowedNext: ["IN_TRANSIT", "PLANNED", "CANCELLED"] },
      { ...option("IN_TRANSIT", "En tránsito"), terminal: false, allowedNext: ["DELIVERED"] },
      { ...option("DELIVERED", "Entregado"), terminal: true, allowedNext: [] },
      { ...option("CANCELLED", "Cancelado"), terminal: true, allowedNext: [] },
    ],
    priorities: [option("LOW", "Baja"), option("NORMAL", "Normal"), option("HIGH", "Alta"), option("URGENT", "Urgente")],
    trackingEvents: [option("DEPARTURE", "Salida"), option("POSITION", "Posición"), option("ARRIVAL", "Arribo"), option("DELIVERY", "Entrega"), option("DELAY", "Retraso"), option("NOTE", "Nota")],
    requireRoute: true,
    requireCustomer: true,
  },
  customers: {
    partyTypes: [option("CUSTOMER", "Cliente"), option("PROVIDER", "Proveedor"), option("CARRIER", "Transportista tercero")],
    locationTypes: [option("DISTRIBUTION_CENTER", "Centro de distribución"), option("PLANT", "Planta"), option("DESTINATION", "Destino"), option("WAREHOUSE", "Almacén")],
    operationConditions: [option("STANDARD", "Estándar"), option("APPOINTMENT", "Con cita"), option("CONTROLLED_TEMPERATURE", "Temperatura controlada"), option("SECURED", "Custodia")],
    requireDistributionCenter: false,
    requireCostCenter: false,
  },
  fleet: {
    vehicleTypes: [option("TRACTOR", "Tracto"), option("TRUCK", "Camión"), option("VAN", "Furgón"), option("LIGHT", "Unidad liviana")],
    trailerTypes: [option("DRY_VAN", "Furgón seco"), option("FLATBED", "Plataforma"), option("REEFER", "Refrigerada"), option("TANK", "Cisterna"), option("BITRAIN_A", "Bitren A"), option("BITRAIN_B", "Bitren B")],
    vehicleStatuses: [option("AVAILABLE", "Disponible"), option("ASSIGNED", "Asignado"), option("MAINTENANCE", "Mantenimiento"), option("OUT_OF_SERVICE", "Fuera de servicio")],
    assemblyRules: [
      { tractorType: "TRACTOR", trailerTypes: ["DRY_VAN", "FLATBED", "REEFER", "TANK", "BITRAIN_A"], maxTrailers: 1, active: true },
      { tractorType: "TRUCK", trailerTypes: [], maxTrailers: 0, active: true },
    ],
    preventDuplicateAssignments: true,
    requireCompatibleAssembly: true,
    requireCapacityCheck: true,
  },
  drivers: {
    driverTypes: [option("PAYROLL", "Planilla"), option("THIRD_PARTY", "Tercero"), option("RELIEF", "Relevo")],
    driverStatuses: [option("AVAILABLE", "Disponible"), option("ASSIGNED", "Asignado"), option("SUSPENDED", "Suspendido"), option("INACTIVE", "Inactivo")],
    licenseClasses: [option("AIIA", "A-IIa"), option("AIIB", "A-IIb"), option("AIIIA", "A-IIIa"), option("AIIIB", "A-IIIb"), option("AIIIC", "A-IIIc")],
    workRegimes: [{ key: "6X1", label: "6x1", workDays: 6, restDays: 1, active: true }, { key: "14X7", label: "14x7", workDays: 14, restDays: 7, active: true }, { key: "20X10", label: "20x10", workDays: 20, restDays: 10, active: true }],
    expiryAlertDays: 30,
  },
  finance: {
    expenseCategories: [option("TOLL", "Peaje"), option("FUEL", "Combustible"), option("FOOD", "Alimentación"), option("LODGING", "Hospedaje"), option("REPAIR", "Reparación"), option("PARKING", "Estacionamiento"), option("OTHER", "Otro")],
    expenseStatuses: [option("PENDING", "Pendiente"), option("APPROVED", "Aprobado"), option("REJECTED", "Rechazado")],
    paymentMethods: [option("CASH", "Efectivo"), option("TRANSFER", "Transferencia"), option("CARD", "Tarjeta"), option("YAPE", "Yape"), option("PLIN", "Plin"), option("OTHER", "Otro")],
    approvalLimitCents: 100000,
    requireReceiptAboveCents: 10000,
    advancesEnabled: true,
    approvalRoleKeys: ["ADMIN", "FINANCE"],
  },
  maintenance: {
    maintenanceTypes: [option("PREVENTIVE", "Preventivo"), option("CORRECTIVE", "Correctivo"), option("INSPECTION", "Inspección")],
    maintenanceStatuses: [option("OPEN", "Abierta"), option("IN_PROGRESS", "En proceso"), option("COMPLETED", "Completada"), option("CANCELLED", "Cancelada")],
    inspectionTypes: [option("PRE_TRIP", "Preoperacional"), option("TECHNICAL", "Técnica"), option("SAFETY", "Seguridad")],
    preventiveEveryKm: 10000,
    alertKmBefore: 1000,
    alertDaysBefore: 15,
  },
  documents: {
    requirements: [
      { ...option("DRIVER_LICENSE", "Licencia de conducir"), ownerType: "DRIVER", required: true, expires: true, alertDays: 30 },
      { ...option("SOAT", "SOAT"), ownerType: "VEHICLE", required: true, expires: true, alertDays: 30 },
      { ...option("TECHNICAL_REVIEW", "Revisión técnica"), ownerType: "VEHICLE", required: true, expires: true, alertDays: 30 },
      { ...option("PROPERTY_CARD", "Tarjeta de propiedad"), ownerType: "VEHICLE", required: true, expires: false, alertDays: 0 },
      { ...option("TRAILER_PROPERTY", "Tarjeta de propiedad"), ownerType: "TRAILER", required: true, expires: false, alertDays: 0 },
    ],
    blockAssignmentsWithExpiredDocuments: true,
    defaultAlertDays: 30,
  },
  safety: {
    maxSpeedKph: 90,
    maxContinuousDrivingHours: 5,
    minRestHours: 8,
    incidentTypes: [option("BREAKDOWN", "Avería"), option("DELAY", "Retraso"), option("ACCIDENT", "Accidente"), option("SECURITY", "Seguridad"), option("CARGO", "Carga")],
    severities: [option("LOW", "Baja"), option("MEDIUM", "Media"), option("HIGH", "Alta"), option("CRITICAL", "Crítica")],
    requireIncidentObservation: true,
  },
  notifications: {
    rules: [
      { event: "DOCUMENT_EXPIRING", label: "Documento por vencer", roleKeys: ["ADMIN", "DRIVER_MANAGER"], channels: ["IN_APP", "EMAIL"], active: true },
      { event: "CRITICAL_INCIDENT", label: "Incidencia crítica", roleKeys: ["ADMIN", "DISPATCH"], channels: ["IN_APP", "EMAIL"], active: true },
      { event: "MAINTENANCE_DUE", label: "Mantenimiento próximo", roleKeys: ["ADMIN"], channels: ["IN_APP"], active: true },
      { event: "EXPENSE_APPROVAL", label: "Gasto pendiente de aprobación", roleKeys: ["ADMIN", "FINANCE"], channels: ["IN_APP"], active: true },
      { event: "APPOINTMENT_RISK", label: "Cita próxima o vencida", roleKeys: ["ADMIN", "DISPATCH"], channels: ["IN_APP"], active: true },
      { event: "TRIP_UNASSIGNED", label: "Viaje sin unidad asignada", roleKeys: ["ADMIN", "DISPATCH"], channels: ["IN_APP"], active: true },
      { event: "TRIP_DELAY", label: "Viaje demorado", roleKeys: ["ADMIN", "DISPATCH"], channels: ["IN_APP"], active: true },
      { event: "DUPLICATE_EXTERNAL_KEY", label: "Referencia externa duplicada", roleKeys: ["ADMIN", "DISPATCH"], channels: ["IN_APP"], active: true },
    ],
  },
  integrations: { gpsProvider: "", gpsEnabled: false, sapEnabled: false, sunatGreEnabled: false, mapsProvider: "GOOGLE_MAPS", mapsEnabled: false, webhookUrl: "" },
  modules: {
    fuel: { targetKmPerLiter: 2.5, requireInvoice: true, allowedVariancePct: 15 },
    tires: { minTreadMm: 1.6, alertTreadMm: 3, positions: [option("FRONT_LEFT", "Delantera izquierda"), option("FRONT_RIGHT", "Delantera derecha"), option("REAR_LEFT", "Posterior izquierda"), option("REAR_RIGHT", "Posterior derecha")] },
    inventory: { units: [option("UND", "Unidad"), option("L", "Litro"), option("KG", "Kilogramo"), option("KIT", "Kit")], lowStockAlerts: true },
    reports: { cutoffHour: 0, includeDraftTrips: false },
  },
};

const catalogOptionSchema = z.object({ key: z.string().trim().toUpperCase().regex(/^[A-Z0-9_\-]+$/).min(1).max(60), label: z.string().trim().min(1).max(100), active: z.boolean().default(true) });
const catalog = z.array(catalogOptionSchema).min(1).max(100);
const statusCatalog = z.array(catalogOptionSchema.extend({ terminal: z.boolean().default(false), allowedNext: z.array(z.string().trim().toUpperCase().max(60)).max(30).default([]) })).min(1).max(50);
const sectionSchemas = {
  general: z.object({ operationPrefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{1,10}$/), tripPrefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{1,10}$/), maintenancePrefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{1,10}$/), distanceUnit: z.string().trim().toUpperCase().min(1).max(10), weightUnit: z.string().trim().toUpperCase().min(1).max(10), volumeUnit: z.string().trim().toUpperCase().min(1).max(10), automaticNumbering: z.boolean() }),
  operations: z.object({ serviceTypes: catalog, tripStatuses: statusCatalog, priorities: catalog, trackingEvents: catalog, requireRoute: z.boolean(), requireCustomer: z.boolean() }),
  customers: z.object({ partyTypes: catalog, locationTypes: catalog, operationConditions: catalog, requireDistributionCenter: z.boolean(), requireCostCenter: z.boolean() }),
  fleet: z.object({ vehicleTypes: catalog, trailerTypes: catalog, vehicleStatuses: catalog, assemblyRules: z.array(z.object({ tractorType: z.string().trim().toUpperCase().min(1).max(60), trailerTypes: z.array(z.string().trim().toUpperCase().min(1).max(60)).max(30), maxTrailers: z.coerce.number().int().min(0).max(3), active: z.boolean() })).max(100), preventDuplicateAssignments: z.boolean(), requireCompatibleAssembly: z.boolean(), requireCapacityCheck: z.boolean() }),
  drivers: z.object({ driverTypes: catalog, driverStatuses: catalog, licenseClasses: catalog, workRegimes: z.array(z.object({ key: z.string().trim().toUpperCase().min(1).max(30), label: z.string().trim().min(1).max(80), workDays: z.coerce.number().int().min(1).max(60), restDays: z.coerce.number().int().min(1).max(60), active: z.boolean() })).min(1).max(30), expiryAlertDays: z.coerce.number().int().min(0).max(365) }),
  finance: z.object({ expenseCategories: catalog, expenseStatuses: catalog, paymentMethods: catalog, approvalLimitCents: z.coerce.number().int().min(0).max(1_000_000_000), requireReceiptAboveCents: z.coerce.number().int().min(0).max(1_000_000_000), advancesEnabled: z.boolean(), approvalRoleKeys: z.array(z.string().trim().toUpperCase().min(1).max(30)).max(30) }),
  maintenance: z.object({ maintenanceTypes: catalog, maintenanceStatuses: catalog, inspectionTypes: catalog, preventiveEveryKm: z.coerce.number().min(0).max(1_000_000), alertKmBefore: z.coerce.number().min(0).max(1_000_000), alertDaysBefore: z.coerce.number().int().min(0).max(365) }),
  documents: z.object({ requirements: z.array(catalogOptionSchema.extend({ ownerType: z.enum(["DRIVER", "VEHICLE", "TRAILER", "TRIP", "COMPANY"]), required: z.boolean(), expires: z.boolean(), alertDays: z.coerce.number().int().min(0).max(365) })).max(200), blockAssignmentsWithExpiredDocuments: z.boolean(), defaultAlertDays: z.coerce.number().int().min(0).max(365) }),
  safety: z.object({ maxSpeedKph: z.coerce.number().min(1).max(250), maxContinuousDrivingHours: z.coerce.number().min(0.5).max(24), minRestHours: z.coerce.number().min(0).max(48), incidentTypes: catalog, severities: catalog, requireIncidentObservation: z.boolean() }),
  notifications: z.object({ rules: z.array(z.object({ event: z.string().trim().toUpperCase().min(1).max(80), label: z.string().trim().min(1).max(120), roleKeys: z.array(z.string().trim().toUpperCase().min(1).max(30)).max(30), channels: z.array(z.enum(["IN_APP", "EMAIL", "SMS", "WEBHOOK"])).max(4), active: z.boolean() })).max(100) }),
  integrations: z.object({ gpsProvider: z.string().trim().max(80), gpsEnabled: z.boolean(), sapEnabled: z.boolean(), sunatGreEnabled: z.boolean(), mapsProvider: z.string().trim().max(80), mapsEnabled: z.boolean(), webhookUrl: z.union([z.string().trim().url(), z.literal("")]) }),
  modules: z.object({ fuel: z.object({ targetKmPerLiter: z.coerce.number().min(0).max(100), requireInvoice: z.boolean(), allowedVariancePct: z.coerce.number().min(0).max(100) }), tires: z.object({ minTreadMm: z.coerce.number().min(0).max(100), alertTreadMm: z.coerce.number().min(0).max(100), positions: catalog }), inventory: z.object({ units: catalog, lowStockAlerts: z.boolean() }), reports: z.object({ cutoffHour: z.coerce.number().int().min(0).max(23), includeDraftTrips: z.boolean() }) }),
} satisfies Record<keyof Omit<TransportConfiguration, "version">, z.ZodTypeAny>;

export type TransportConfigurationSection = keyof typeof sectionSchemas;

function mergeDefaults(value: unknown): TransportConfiguration {
  if (!value || typeof value !== "object" || Array.isArray(value)) return structuredClone(defaultTransportConfiguration);
  const incoming = value as Partial<TransportConfiguration>;
  const merged = structuredClone(defaultTransportConfiguration);
  if (Number.isInteger(incoming.version) && Number(incoming.version) > 0) merged.version = Number(incoming.version);
  for (const key of Object.keys(sectionSchemas) as TransportConfigurationSection[]) {
    const candidate = incoming[key];
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) (merged as unknown as Record<string, unknown>)[key] = { ...(merged as unknown as Record<string, Record<string, unknown>>)[key], ...candidate };
  }
  return merged;
}

export function parseTransportConfiguration(raw: string | null | undefined): TransportConfiguration {
  try { return mergeDefaults(JSON.parse(raw ?? "{}")); } catch { return structuredClone(defaultTransportConfiguration); }
}

export async function getTransportConfiguration(tenantId: string): Promise<TransportConfiguration> {
  const record = await prisma.transportConfiguration.findUnique({ where: { tenantId }, select: { settings: true } });
  return parseTransportConfiguration(record?.settings);
}

export async function hasStoredTransportConfiguration(tenantId: string) {
  return Boolean(await prisma.transportConfiguration.findUnique({ where: { tenantId }, select: { id: true } }));
}

export async function saveTransportConfigurationSection(tenantId: string, section: TransportConfigurationSection, raw: unknown, scope?: TenantScope) {
  const schema = sectionSchemas[section];
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new AppError("VALIDATION_ERROR", 400, "Revisa los parámetros de esta sección.", parsed.error.flatten());
  if (section === "operations") {
    const statuses = (parsed.data as TransportConfiguration["operations"]).tripStatuses;
    const keys = new Set(statuses.map((item) => item.key));
    const required = ["DRAFT", "PLANNED", "ASSIGNED", "IN_TRANSIT", "DELIVERED", "CANCELLED"].filter((key) => !keys.has(key));
    const unknownTransitions = statuses.flatMap((item) => item.allowedNext.filter((key) => !keys.has(key)).map((key) => `${item.key} → ${key}`));
    if (required.length || unknownTransitions.length) {
      throw new AppError("VALIDATION_ERROR", 400, "El flujo debe conservar los estados operativos base y todas sus transiciones deben apuntar a estados existentes.", { required, unknownTransitions });
    }
  }
  const current = await getTransportConfiguration(tenantId);
  const next = { ...current, version: current.version + 1, [section]: parsed.data } as TransportConfiguration;
  const record = await prisma.transportConfiguration.upsert({ where: { tenantId }, create: { tenantId, settings: JSON.stringify(next) }, update: { settings: JSON.stringify(next) } });
  if (scope) await audit(scope, "UPDATE_CONFIGURATION", "TransportConfiguration", record.id, { section, version: next.version });
  return next;
}

export function activeKeys(options: TransportCatalogOption[]) {
  return new Set(options.filter((item) => item.active).map((item) => item.key));
}

export function assertConfigured(options: TransportCatalogOption[], value: string, label: string) {
  if (!activeKeys(options).has(value)) throw new AppError("CONFIG_VALUE_NOT_ALLOWED", 400, `${label} no está habilitado en la configuración de esta empresa.`);
}

export async function assertTenantConfigured(tenantId: string, options: TransportCatalogOption[], value: string, label: string) {
  if (await hasStoredTransportConfiguration(tenantId)) assertConfigured(options, value, label);
}

export async function assertRequiredTransportDocuments(tenantId: string, ownerType: "DRIVER" | "VEHICLE" | "TRAILER" | "TRIP" | "COMPANY", ownerId: string, at: Date, configuration: TransportConfiguration) {
  const requirements = configuration.documents.requirements.filter((item) => item.active && item.required && item.ownerType === ownerType);
  if (!requirements.length) return;
  const documents = await prisma.transportDocument.findMany({ where: { tenantId, ownerType, ownerId, status: { not: "CANCELLED" } }, select: { type: true, status: true, expiresAt: true } });
  for (const requirement of requirements) {
    const document = documents.find((item) => item.type === requirement.key);
    if (!document) throw new AppError("REQUIRED_DOCUMENT_MISSING", 409, `Falta el documento obligatorio ${requirement.label}.`);
    if (requirement.expires && (!document.expiresAt || document.expiresAt < at || document.status === "EXPIRED")) throw new AppError("REQUIRED_DOCUMENT_EXPIRED", 409, `${requirement.label} no estará vigente para la operación.`);
  }
}
