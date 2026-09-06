import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/core/database/prisma";
import type { TenantScope } from "@/core/auth/types";
import type { TransportData } from "../types";
import { scheduledTypeAt } from "./schedule";
import { getTransportConfiguration } from "./configuration";
import { maintenanceDueState } from "./maintenance-planning";

const iso = (value: Date | null) => value?.toISOString() ?? null;

export type TransportDataSection = "all" | "dashboard" | "operations" | "fleet" | "drivers" | "documents" | "finance" | "fuel" | "maintenance" | "inventory" | "tires" | "reports" | "settings";

export type TransportQueryOptions = {
  page: number;
  pageSize: number;
  query: string;
  status: string | null;
};

type TransportDataDomain = "operations" | "parties" | "locations" | "routes" | "vehicles" | "trailers" | "drivers" | "trips" | "documents" | "expenses" | "settlements" | "payments" | "fuelLogs" | "maintenanceOrders" | "inventory" | "tires";

const allDomains: TransportDataDomain[] = ["operations", "parties", "locations", "routes", "vehicles", "trailers", "drivers", "trips", "documents", "expenses", "settlements", "payments", "fuelLogs", "maintenanceOrders", "inventory", "tires"];
const primaryDomainBySection: Partial<Record<TransportDataSection, TransportDataDomain>> = {
  operations: "trips",
  fleet: "vehicles",
  drivers: "drivers",
  documents: "documents",
  finance: "expenses",
  fuel: "fuelLogs",
  maintenance: "maintenanceOrders",
  tires: "tires",
  settings: "parties",
};
const domainsBySection: Record<TransportDataSection, TransportDataDomain[]> = {
  all: allDomains,
  dashboard: ["vehicles", "drivers", "trips", "documents", "expenses", "payments", "inventory"],
  operations: ["operations", "parties", "routes", "vehicles", "trailers", "drivers", "trips"],
  fleet: ["vehicles", "trailers"],
  drivers: ["drivers"],
  documents: ["documents", "drivers", "trailers", "trips", "vehicles"],
  finance: ["expenses", "trips"],
  fuel: ["fuelLogs", "trips", "vehicles"],
  maintenance: ["maintenanceOrders", "inventory", "vehicles"],
  inventory: ["inventory"],
  tires: ["tires", "vehicles"],
  reports: ["vehicles", "drivers", "trips", "documents", "expenses", "payments"],
  settings: ["parties", "locations", "routes"],
};

export function normalizeTransportDataSection(value: string | null): TransportDataSection {
  if (!value) return "all";
  return value in domainsBySection ? value as TransportDataSection : "dashboard";
}

export function normalizeTransportQuery(searchParams: URLSearchParams): TransportQueryOptions {
  const parsedPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const parsedPageSize = Number.parseInt(searchParams.get("pageSize") ?? "25", 10);
  const status = searchParams.get("status")?.trim().toUpperCase() || null;
  return {
    page: Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1,
    pageSize: Number.isFinite(parsedPageSize) ? Math.min(100, Math.max(10, parsedPageSize)) : 25,
    query: (searchParams.get("q") ?? "").trim().slice(0, 100),
    status,
  };
}

function loadIf<T>(enabled: boolean, loader: () => Promise<T[]>): Promise<T[]> {
  return enabled ? loader() : Promise.resolve([]);
}

export async function getTransportData(scope: TenantScope, section: TransportDataSection = "all", options: TransportQueryOptions = { page: 1, pageSize: 25, query: "", status: null }): Promise<TransportData> {
  const domains = new Set(domainsBySection[section]);
  const includes = (domain: TransportDataDomain) => domains.has(domain);
  const primaryDomain = primaryDomainBySection[section];
  const isPrimary = (domain: TransportDataDomain) => primaryDomain === domain;
  const pageArgs = (domain: TransportDataDomain, fallbackTake: number) => ({
    skip: isPrimary(domain) ? (options.page - 1) * options.pageSize : 0,
    take: isPrimary(domain) ? options.pageSize : fallbackTake,
  });
  const queryFor = (domain: TransportDataDomain) => isPrimary(domain) ? options.query : "";
  const statusFor = (domain: TransportDataDomain) => isPrimary(domain) ? options.status : null;

  const partyQuery = queryFor("parties");
  const partyStatus = statusFor("parties");
  const partyWhere: Prisma.TransportPartyWhereInput = { tenantId: scope.tenantId,
    ...(partyQuery ? { OR: [{ legalName: { contains: partyQuery } }, { tradeName: { contains: partyQuery } }, { documentNo: { contains: partyQuery } }, { contactName: { contains: partyQuery } }] } : {}),
    ...(partyStatus === "ACTIVE" ? { active: true } : partyStatus === "INACTIVE" ? { active: false } : {}),
  };
  const vehicleQuery = queryFor("vehicles");
  const vehicleStatus = statusFor("vehicles");
  const vehicleWhere: Prisma.TransportVehicleWhereInput = { tenantId: scope.tenantId,
    ...(vehicleQuery ? { OR: [{ plate: { contains: vehicleQuery } }, { brand: { contains: vehicleQuery } }, { model: { contains: vehicleQuery } }, { type: { contains: vehicleQuery } }] } : {}),
    ...(vehicleStatus ? { status: vehicleStatus } : {}),
  };
  const driverQuery = queryFor("drivers");
  const driverStatus = statusFor("drivers");
  const driverWhere: Prisma.TransportDriverWhereInput = { tenantId: scope.tenantId,
    ...(driverQuery ? { OR: [{ firstName: { contains: driverQuery } }, { lastName: { contains: driverQuery } }, { documentNo: { contains: driverQuery } }, { licenseNo: { contains: driverQuery } }] } : {}),
    ...(driverStatus ? { status: driverStatus } : {}),
  };
  const tripQuery = queryFor("trips");
  const tripStatus = statusFor("trips");
  const tripWhere: Prisma.TransportTripWhereInput = { tenantId: scope.tenantId, branchId: scope.branchId,
    ...(tripQuery ? { OR: [{ code: { contains: tripQuery } }, { cargoDescription: { contains: tripQuery } }, { referenceNo: { contains: tripQuery } }, { customer: { legalName: { contains: tripQuery } } }, { route: { name: { contains: tripQuery } } }, { customFieldValues: { some: { definition: { searchable: true }, normalizedValue: { contains: tripQuery.toUpperCase() } } } }] } : {}),
    ...(tripStatus ? { status: tripStatus } : {}),
  };
  const documentQuery = queryFor("documents");
  const documentStatus = statusFor("documents");
  const documentWhere: Prisma.TransportDocumentWhereInput = { tenantId: scope.tenantId,
    ...(documentQuery ? { OR: [{ type: { contains: documentQuery } }, { number: { contains: documentQuery } }, { ownerType: { contains: documentQuery } }] } : {}),
    ...(documentStatus ? { status: documentStatus } : {}),
  };
  const expenseQuery = queryFor("expenses");
  const expenseStatus = statusFor("expenses");
  const expenseWhere: Prisma.TransportExpenseWhereInput = { tenantId: scope.tenantId,
    ...(expenseQuery ? { OR: [{ description: { contains: expenseQuery } }, { category: { contains: expenseQuery } }, { receiptNo: { contains: expenseQuery } }, { trip: { code: { contains: expenseQuery } } }] } : {}),
    ...(expenseStatus ? { status: expenseStatus } : {}),
  };
  const fuelQuery = queryFor("fuelLogs");
  const fuelStatus = statusFor("fuelLogs");
  const fuelWhere: Prisma.TransportFuelLogWhereInput = { tenantId: scope.tenantId,
    ...(fuelQuery ? { OR: [{ station: { contains: fuelQuery } }, { invoiceNo: { contains: fuelQuery } }, { vehicle: { plate: { contains: fuelQuery } } }, { trip: { code: { contains: fuelQuery } } }] } : {}),
    ...(fuelStatus ? { status: fuelStatus } : {}),
  };
  const maintenanceQuery = queryFor("maintenanceOrders");
  const maintenanceStatus = statusFor("maintenanceOrders");
  const maintenanceWhere: Prisma.TransportMaintenanceOrderWhereInput = { tenantId: scope.tenantId,
    ...(maintenanceQuery ? { OR: [{ code: { contains: maintenanceQuery } }, { title: { contains: maintenanceQuery } }, { type: { contains: maintenanceQuery } }, { vehicle: { plate: { contains: maintenanceQuery } } }] } : {}),
    ...(maintenanceStatus ? { status: maintenanceStatus } : {}),
  };
  const tireQuery = queryFor("tires");
  const tireStatus = statusFor("tires");
  const tireWhere: Prisma.TransportTireWhereInput = { tenantId: scope.tenantId,
    ...(tireQuery ? { OR: [{ serialNo: { contains: tireQuery } }, { brand: { contains: tireQuery } }, { model: { contains: tireQuery } }, { size: { contains: tireQuery } }] } : {}),
    ...(tireStatus ? { status: tireStatus } : {}),
  };
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const configuration = await getTransportConfiguration(scope.tenantId);
  const documentLimit = new Date(Date.now() + configuration.documents.defaultAlertDays * 86_400_000);
  const [operations, parties, locations, routes, vehicles, trailers, drivers, trips, documents, expenses, settlements, payments, fuelLogs, maintenanceOrders, inventory, tires, maintenanceGroups, primaryTotal] = await Promise.all([
    loadIf(includes("operations"), () => prisma.transportOperation.findMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId }, orderBy: { plannedStartAt: "desc" }, take: 200, include: { customer: { select: { id: true, legalName: true } }, trips: { select: { status: true } } } })),
    loadIf(includes("parties"), () => prisma.transportParty.findMany({ where: partyWhere, orderBy: [{ active: "desc" }, { legalName: "asc" }], ...pageArgs("parties", 500) })),
    loadIf(includes("locations"), () => prisma.transportLocation.findMany({ where: { tenantId: scope.tenantId }, orderBy: [{ active: "desc" }, { name: "asc" }], take: 500 })),
    loadIf(includes("routes"), () => prisma.transportRoute.findMany({ where: { tenantId: scope.tenantId }, orderBy: [{ active: "desc" }, { name: "asc" }], take: 500, include: { origin: { select: { id: true, name: true } }, destination: { select: { id: true, name: true } } } })),
    loadIf(includes("vehicles"), () => prisma.transportVehicle.findMany({ where: vehicleWhere, orderBy: [{ active: "desc" }, { plate: "asc" }], ...pageArgs("vehicles", 500) })),
    loadIf(includes("trailers"), () => prisma.transportTrailer.findMany({ where: { tenantId: scope.tenantId }, orderBy: [{ active: "desc" }, { plate: "asc" }], take: 500, include: { fixedCoupling: { select: { id: true, code: true, name: true } } } })),
    loadIf(includes("drivers"), () => prisma.transportDriver.findMany({ where: driverWhere, orderBy: [{ active: "desc" }, { lastName: "asc" }], ...pageArgs("drivers", 500), include: { leaves: { orderBy: { startsAt: "desc" }, take: 20 }, workLogs: { orderBy: { workDate: "desc" }, take: 31 } } })),
    loadIf(includes("trips"), () => prisma.transportTrip.findMany({ where: tripWhere, orderBy: { scheduledStartAt: "desc" }, ...pageArgs("trips", 200), include: { operation: { select: { id: true, code: true, name: true } }, customer: { select: { id: true, legalName: true } }, route: { include: { origin: { select: { name: true } }, destination: { select: { name: true } } } }, workflowDefinition: { select: { id: true, code: true, name: true } }, workflowState: { select: { id: true, code: true, label: true, color: true } }, customFieldValues: { include: { definition: { select: { id: true, code: true, label: true, dataType: true, showInDispatch: true } } } }, events: { orderBy: { occurredAt: "desc" }, take: 100 }, assignments: { orderBy: { assignedAt: "desc" }, include: { driver: { select: { id: true, firstName: true, lastName: true } }, secondDriver: { select: { id: true, firstName: true, lastName: true } }, drivers: { orderBy: { position: "asc" }, include: { driver: { select: { id: true, firstName: true, lastName: true } } } }, vehicle: { select: { id: true, plate: true } }, trailer: { select: { id: true, plate: true } }, trailers: { orderBy: { position: "asc" }, include: { trailer: { select: { id: true, plate: true } } } } } }, trackingEvents: { orderBy: { recordedAt: "desc" }, take: 50 }, incidents: { orderBy: { occurredAt: "desc" }, take: 100 }, settlement: true } })),
    loadIf(includes("documents"), () => prisma.transportDocument.findMany({ where: documentWhere, orderBy: [{ status: "asc" }, { expiresAt: "asc" }], ...pageArgs("documents", 300), include: { storageObject: { select: { originalName: true, sizeBytes: true, scanStatus: true, status: true } } } })),
    loadIf(includes("expenses"), () => prisma.transportExpense.findMany({ where: expenseWhere, orderBy: { occurredAt: "desc" }, ...pageArgs("expenses", 300), include: { trip: { select: { code: true } } } })),
    loadIf(includes("settlements"), () => prisma.transportSettlement.findMany({ where: { tenantId: scope.tenantId }, orderBy: { updatedAt: "desc" }, take: 200, include: { trip: { select: { code: true } } } })),
    loadIf(includes("payments"), () => prisma.transportPayment.findMany({ where: { tenantId: scope.tenantId }, orderBy: { paidAt: "desc" }, take: 300, include: { trip: { select: { code: true } } } })),
    loadIf(includes("fuelLogs"), () => prisma.transportFuelLog.findMany({ where: fuelWhere, orderBy: { loadedAt: "desc" }, ...pageArgs("fuelLogs", 300), include: { vehicle: { select: { plate: true } }, trip: { select: { code: true } } } })),
    loadIf(includes("maintenanceOrders"), () => prisma.transportMaintenanceOrder.findMany({ where: maintenanceWhere, orderBy: [{ status: "asc" }, { scheduledAt: "asc" }], ...pageArgs("maintenanceOrders", 300), include: { vehicle: { select: { plate: true } } } })),
    loadIf(includes("inventory"), () => prisma.inventoryItem.findMany({ where: { tenantId: scope.tenantId, OR: [{ branchId: scope.branchId }, { branchId: null }] }, orderBy: [{ active: "desc" }, { name: "asc" }], take: 500 })),
    loadIf(includes("tires"), () => prisma.transportTire.findMany({ where: tireWhere, orderBy: [{ active: "desc" }, { serialNo: "asc" }], ...pageArgs("tires", 500), include: { events: { orderBy: { occurredAt: "desc" }, take: 20 } } })),
    includes("maintenanceOrders") ? prisma.transportMaintenanceOrder.groupBy({ by: ["vehicleId", "type", "status"], where: { tenantId: scope.tenantId }, _count: { _all: true }, _sum: { actualCents: true }, _max: { completedAt: true } }) : Promise.resolve([]),
    primaryDomain === "parties" ? prisma.transportParty.count({ where: partyWhere })
      : primaryDomain === "vehicles" ? prisma.transportVehicle.count({ where: vehicleWhere })
        : primaryDomain === "drivers" ? prisma.transportDriver.count({ where: driverWhere })
          : primaryDomain === "trips" ? prisma.transportTrip.count({ where: tripWhere })
            : primaryDomain === "documents" ? prisma.transportDocument.count({ where: documentWhere })
              : primaryDomain === "expenses" ? prisma.transportExpense.count({ where: expenseWhere })
                : primaryDomain === "fuelLogs" ? prisma.transportFuelLog.count({ where: fuelWhere })
                  : primaryDomain === "maintenanceOrders" ? prisma.transportMaintenanceOrder.count({ where: maintenanceWhere })
                    : primaryDomain === "tires" ? prisma.transportTire.count({ where: tireWhere })
                      : Promise.resolve(0),
  ]);

  const [customFields, workflows, resourcePresets, trailerCouplings, importProfiles, documentTemplates, dispatchViews, maintenancePlans, vehicleComponents, maintenanceSchedules, activeAssemblies, controlTowerTrips] = await Promise.all([
    prisma.transportCustomFieldDefinition.findMany({ where: { tenantId: scope.tenantId, entityType: "TRIP" }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }], include: { scopes: true, options: { orderBy: { sortOrder: "asc" } } } }),
    prisma.transportWorkflowDefinition.findMany({ where: { tenantId: scope.tenantId }, orderBy: [{ active: "desc" }, { name: "asc" }], include: { states: { orderBy: { sortOrder: "asc" } }, transitions: true } }),
    prisma.transportResourcePreset.findMany({ where: { tenantId: scope.tenantId }, orderBy: [{ active: "desc" }, { name: "asc" }], include: { vehicle: { select: { id: true, plate: true } }, trailers: { orderBy: { position: "asc" }, include: { trailer: { select: { id: true, plate: true } } } }, drivers: { orderBy: { position: "asc" }, include: { driver: { select: { id: true, firstName: true, lastName: true } } } } } }),
    includes("trailers") ? prisma.transportTrailerCoupling.findMany({ where: { tenantId: scope.tenantId }, orderBy: [{ active: "desc" }, { name: "asc" }], include: { trailers: { orderBy: { plate: "asc" }, select: { id: true, plate: true, type: true, status: true, active: true } } } }) : Promise.resolve([]),
    prisma.transportImportProfile.findMany({ where: { tenantId: scope.tenantId }, orderBy: [{ active: "desc" }, { name: "asc" }], include: { mappings: true } }),
    prisma.transportDocumentTemplate.findMany({ where: { tenantId: scope.tenantId }, orderBy: [{ active: "desc" }, { name: "asc" }] }),
    prisma.transportDispatchView.findMany({ where: { tenantId: scope.tenantId }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] }),
    includes("maintenanceOrders") ? prisma.transportMaintenancePlan.findMany({ where: { tenantId: scope.tenantId }, orderBy: [{ active: "desc" }, { name: "asc" }], include: { tasks: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }, _count: { select: { assignments: { where: { active: true } } } } } }) : Promise.resolve([]),
    includes("maintenanceOrders") ? prisma.transportVehicleComponent.findMany({ where: { tenantId: scope.tenantId }, orderBy: [{ active: "desc" }, { componentType: "asc" }], include: { vehicle: { select: { plate: true } } } }) : Promise.resolve([]),
    includes("maintenanceOrders") ? prisma.transportMaintenanceSchedule.findMany({ where: { tenantId: scope.tenantId, active: true }, orderBy: [{ nextDueAt: "asc" }], include: { vehicle: { select: { plate: true, odometerKm: true } }, task: { include: { plan: { select: { id: true, code: true, name: true } } } }, component: { select: { id: true, code: true, name: true, brand: true, model: true, serialNo: true } }, orders: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } }, select: { id: true }, take: 1 } } }) : Promise.resolve([]),
    section === "operations" ? prisma.transportAssignment.findMany({ where: { tenantId: scope.tenantId, status: "ACTIVE", trip: { branchId: scope.branchId } }, orderBy: { assignedAt: "desc" }, take: 500, include: { vehicle: { select: { id: true, plate: true } }, trailer: { select: { id: true, plate: true } }, trailers: { orderBy: { position: "asc" }, include: { trailer: { select: { id: true, plate: true } } } }, driver: { select: { id: true, firstName: true, lastName: true } }, secondDriver: { select: { id: true, firstName: true, lastName: true } }, drivers: { orderBy: { position: "asc" }, include: { driver: { select: { id: true, firstName: true, lastName: true } } } }, trip: { select: { id: true, code: true, status: true, route: { include: { origin: { select: { name: true } }, destination: { select: { name: true } } } } } } } }) : Promise.resolve([]),
    section === "operations" ? prisma.transportTrip.findMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId, status: { in: ["DRAFT", "PLANNED", "ASSIGNED", "IN_TRANSIT"] } }, orderBy: [{ scheduledStartAt: "asc" }, { code: "asc" }], take: 500, select: { id: true, code: true, operationId: true, scheduledStartAt: true, scheduledEndAt: true, status: true, priority: true, customer: { select: { id: true, legalName: true } }, route: { select: { origin: { select: { name: true } }, destination: { select: { name: true } } } } } }) : Promise.resolve([]),
  ]);

  const monthRevenueCents = payments.filter((item) => item.direction === "IN" && item.paidAt >= monthStart && item.status === "POSTED").reduce((sum, item) => sum + item.amountCents, 0);
  const monthExpenseCents = payments.filter((item) => item.direction === "OUT" && item.paidAt >= monthStart && item.status === "POSTED").reduce((sum, item) => sum + item.amountCents, 0)
    + expenses.filter((item) => item.occurredAt >= monthStart && item.status === "APPROVED").reduce((sum, item) => sum + item.amountCents, 0);
  const assignedVehicleIds = new Set(trips.filter((trip) => ["ASSIGNED", "IN_TRANSIT"].includes(trip.status)).flatMap((trip) => trip.assignments.filter((item) => item.status === "ACTIVE").map((item) => item.vehicleId)));
  const activeVehicles = vehicles.filter((item) => item.active).length;
  const maintenanceByVehicle = new Map<string, { preventive: number; corrective: number; inspections: number; completed: number; open: number; totalCostCents: number; lastCompletedAt: Date | null }>();
  for (const group of maintenanceGroups) {
    const summary = maintenanceByVehicle.get(group.vehicleId) ?? { preventive: 0, corrective: 0, inspections: 0, completed: 0, open: 0, totalCostCents: 0, lastCompletedAt: null };
    if (group.type === "PREVENTIVE") summary.preventive += group._count._all;
    else if (group.type === "CORRECTIVE") summary.corrective += group._count._all;
    else if (group.type === "INSPECTION") summary.inspections += group._count._all;
    if (group.status === "COMPLETED") summary.completed += group._count._all;
    else if (group.status !== "CANCELLED") summary.open += group._count._all;
    summary.totalCostCents += group._sum.actualCents ?? 0;
    const lastCompletedAt = group._max.completedAt;
    if (lastCompletedAt && (!summary.lastCompletedAt || lastCompletedAt > summary.lastCompletedAt)) summary.lastCompletedAt = lastCompletedAt;
    maintenanceByVehicle.set(group.vehicleId, summary);
  }

  return {
    configuration,
    customFields: customFields.map((field) => ({ id: field.id, code: field.code, label: field.label, description: field.description, dataType: field.dataType, required: field.required, uniqueValue: field.uniqueValue, duplicatePolicy: field.duplicatePolicy, showInDispatch: field.showInDispatch, searchable: field.searchable, filterable: field.filterable, importable: field.importable, active: field.active, sortOrder: field.sortOrder, scopes: field.scopes.map((item) => ({ scopeType: item.scopeType, scopeId: item.scopeId, required: item.required, sortOrder: item.sortOrder })), options: field.options.map((item) => ({ id: item.id, code: item.code, label: item.label, active: item.active, sortOrder: item.sortOrder })) })),
    workflows: workflows.map((workflow) => ({ id: workflow.id, code: workflow.code, name: workflow.name, scopeType: workflow.scopeType, scopeId: workflow.scopeId, active: workflow.active, isDefault: workflow.isDefault, states: workflow.states.map((state) => ({ id: state.id, code: state.code, label: state.label, color: state.color, sortOrder: state.sortOrder, initial: state.initial, terminal: state.terminal, active: state.active })), transitions: workflow.transitions.map((item) => ({ id: item.id, fromStateId: item.fromStateId, toStateId: item.toStateId, label: item.label, requiresReason: item.requiresReason, notifyClient: item.notifyClient, active: item.active })) })),
    resourcePresets: resourcePresets.map((preset) => ({ id: preset.id, code: preset.code, name: preset.name, scopeType: preset.scopeType, scopeId: preset.scopeId, active: preset.active, vehicle: preset.vehicle, trailers: preset.trailers.map((item) => item.trailer), drivers: preset.drivers.map((item) => ({ ...item.driver, role: item.role })) })),
    trailerCouplings,
    activeAssemblies: activeAssemblies.map((item) => ({ id: item.id, startsAt: item.startsAt.toISOString(), endsAt: item.endsAt.toISOString(), assignedAt: item.assignedAt.toISOString(), vehicle: item.vehicle, trailer: item.trailer, trailers: item.trailers.map((link) => link.trailer), driver: item.driver, secondDriver: item.secondDriver, drivers: item.drivers.map((link) => ({ ...link.driver, role: link.role })), trip: item.trip })),
    controlTowerTrips: controlTowerTrips.map((item) => ({ ...item, scheduledStartAt: item.scheduledStartAt.toISOString(), scheduledEndAt: item.scheduledEndAt.toISOString() })),
    importProfiles: importProfiles.map((profile) => ({ id: profile.id, code: profile.code, name: profile.name, scopeType: profile.scopeType, scopeId: profile.scopeId, worksheetName: profile.worksheetName, headerRow: profile.headerRow, identityStrategy: profile.identityStrategy, identityFieldId: profile.identityFieldId, active: profile.active, mappings: profile.mappings.map((item) => ({ sourceColumn: item.sourceColumn, targetType: item.targetType, targetKey: item.targetKey, fieldId: item.fieldId, required: item.required, defaultValue: item.defaultValue })) })),
    documentTemplates: documentTemplates.map((item) => ({ id: item.id, code: item.code, name: item.name, documentType: item.documentType, scopeType: item.scopeType, scopeId: item.scopeId, active: item.active })),
    dispatchViews: dispatchViews.map((item) => ({ id: item.id, code: item.code, name: item.name, scopeType: item.scopeType, scopeId: item.scopeId, columns: JSON.parse(item.columns) as string[], filters: JSON.parse(item.filters) as Record<string, unknown>, isDefault: item.isDefault, active: item.active })),
    operations: operations.map((item) => ({ id: item.id, code: item.code, name: item.name, plannedStartAt: item.plannedStartAt.toISOString(), plannedEndAt: item.plannedEndAt.toISOString(), status: item.status, description: item.description, notes: item.notes, customer: item.customer, tripCount: item.trips.length, pendingTrips: item.trips.filter((trip) => ["DRAFT", "PLANNED"].includes(trip.status)).length, activeTrips: item.trips.filter((trip) => ["ASSIGNED", "IN_TRANSIT"].includes(trip.status)).length, completedTrips: item.trips.filter((trip) => trip.status === "DELIVERED").length })),
    parties,
    locations,
    routes,
    vehicles: vehicles.map((item) => ({ ...item, technicalDueAt: iso(item.technicalDueAt), soatDueAt: iso(item.soatDueAt) })),
    trailers,
    drivers: drivers.map((item) => ({ ...item, fullName: `${item.firstName} ${item.lastName}`, licenseDueAt: item.licenseDueAt.toISOString(), hireDate: iso(item.hireDate), workCycleAnchor: item.workCycleAnchor.toISOString(), scheduleToday: scheduledTypeAt(item.workCycleAnchor, item.workDays, item.restDays, new Date()), leaves: item.leaves.map((leave) => ({ ...leave, startsAt: leave.startsAt.toISOString(), endsAt: leave.endsAt.toISOString(), createdAt: undefined, updatedAt: undefined })), workLogs: item.workLogs.map((log) => ({ id: log.id, workDate: log.workDate.toISOString(), scheduledType: log.scheduledType, clockInAt: iso(log.clockInAt), clockOutAt: iso(log.clockOutAt), status: log.status, notes: log.notes })) })),
    trips: trips.map((trip) => ({ id: trip.id, code: trip.code, version: trip.version, operationId: trip.operationId, operation: trip.operation, serviceType: trip.serviceType, cargoDescription: trip.cargoDescription, cargoWeightKg: trip.cargoWeightKg, scheduledStartAt: trip.scheduledStartAt.toISOString(), scheduledEndAt: trip.scheduledEndAt.toISOString(), appointmentStartAt: iso(trip.appointmentStartAt), appointmentEndAt: iso(trip.appointmentEndAt), appointmentStatus: trip.appointmentStatus, actualStartAt: iso(trip.actualStartAt), actualEndAt: iso(trip.actualEndAt), status: trip.status, workflow: trip.workflowDefinition, workflowState: trip.workflowState, priority: trip.priority, referenceNo: trip.referenceNo, notes: trip.notes, freightCents: trip.freightCents, budgetCents: trip.budgetCents, customer: trip.customer, route: { id: trip.route.id, name: trip.route.name, origin: trip.route.origin, destination: trip.route.destination }, customFields: trip.customFieldValues.map((value) => ({ definitionId: value.definitionId, code: value.definition.code, label: value.definition.label, dataType: value.definition.dataType, showInDispatch: value.definition.showInDispatch, value: value.textValue ?? value.numberValue ?? value.dateValue?.toISOString() ?? value.booleanValue })), events: trip.events.map((event) => ({ id: event.id, type: event.type, fromValue: event.fromValue, toValue: event.toValue, reason: event.reason, occurredAt: event.occurredAt.toISOString(), actorId: event.actorId })), assignments: trip.assignments.map((item) => ({ id: item.id, status: item.status, startsAt: item.startsAt.toISOString(), endsAt: item.endsAt.toISOString(), assignedAt: item.assignedAt.toISOString(), releasedAt: iso(item.releasedAt), reason: item.reason, driver: item.driver, secondDriver: item.secondDriver, drivers: item.drivers.map((link) => ({ ...link.driver, role: link.role })), vehicle: item.vehicle, trailer: item.trailer, trailers: item.trailers.map((link) => link.trailer) })), trackingEvents: trip.trackingEvents.map((item) => ({ id: item.id, type: item.type, recordedAt: item.recordedAt.toISOString(), latitude: item.latitude, longitude: item.longitude, odometerKm: item.odometerKm, description: item.description, source: item.source })), incidents: trip.incidents.map((item) => ({ id: item.id, type: item.type, severity: item.severity, status: item.status, occurredAt: item.occurredAt.toISOString(), description: item.description, resolution: item.resolution, resolvedAt: iso(item.resolvedAt) })), settlement: trip.settlement ? { id: trip.settlement.id, incomeCents: trip.settlement.incomeCents, expenseCents: trip.settlement.expenseCents, balanceCents: trip.settlement.balanceCents, status: trip.settlement.status, closedAt: iso(trip.settlement.closedAt) } : null })),
    documents: documents.map((item) => ({ id: item.id, ownerType: item.ownerType, ownerId: item.ownerId, type: item.type, number: item.number, issuedAt: iso(item.issuedAt), expiresAt: iso(item.expiresAt), status: item.status, fileUrl: item.storageObject?.status === "ACTIVE" || item.fileUrl ? `/api/transport/documents/${item.id}/file` : null, fileName: item.storageObject?.originalName ?? null, fileSizeBytes: item.storageObject?.sizeBytes ?? null, scanStatus: item.storageObject?.scanStatus ?? null, notes: item.notes })),
    expenses: expenses.map((item) => ({ id: item.id, tripId: item.tripId, category: item.category, description: item.description, amountCents: item.amountCents, occurredAt: item.occurredAt.toISOString(), status: item.status, receiptNo: item.receiptNo, trip: item.trip })),
    settlements: settlements.map((item) => ({ id: item.id, tripId: item.tripId, incomeCents: item.incomeCents, expenseCents: item.expenseCents, balanceCents: item.balanceCents, status: item.status, closedAt: iso(item.closedAt), notes: item.notes, trip: item.trip })),
    payments: payments.map((item) => ({ id: item.id, tripId: item.tripId, direction: item.direction, partyType: item.partyType, partyId: item.partyId, category: item.category, amountCents: item.amountCents, method: item.method, reference: item.reference, status: item.status, paidAt: item.paidAt.toISOString(), trip: item.trip })),
    fuelLogs: fuelLogs.map((item) => ({ id: item.id, tripId: item.tripId, vehicleId: item.vehicleId, loadedAt: item.loadedAt.toISOString(), station: item.station, liters: item.liters, priceCents: item.priceCents, totalCents: item.totalCents, odometerKm: item.odometerKm, invoiceNo: item.invoiceNo, status: item.status, vehicle: item.vehicle, trip: item.trip })),
    maintenanceOrders: maintenanceOrders.map((item) => ({ id: item.id, vehicleId: item.vehicleId, code: item.code, type: item.type, title: item.title, description: item.description, status: item.status, priority: item.priority, scheduledAt: iso(item.scheduledAt), completedAt: iso(item.completedAt), odometerKm: item.odometerKm, estimatedCents: item.estimatedCents, actualCents: item.actualCents, scheduleId: item.scheduleId, planTaskId: item.planTaskId, componentId: item.componentId, vehicle: item.vehicle })),
    maintenanceSummary: vehicles.map((vehicle) => { const summary = maintenanceByVehicle.get(vehicle.id) ?? { preventive: 0, corrective: 0, inspections: 0, completed: 0, open: 0, totalCostCents: 0, lastCompletedAt: null }; return { vehicleId: vehicle.id, plate: vehicle.plate, ...summary, lastCompletedAt: iso(summary.lastCompletedAt) }; }),
    maintenancePlans: maintenancePlans.map((plan) => ({ id: plan.id, code: plan.code, name: plan.name, brand: plan.brand, model: plan.model, yearFrom: plan.yearFrom, yearTo: plan.yearTo, vehicleType: plan.vehicleType, version: plan.version, active: plan.active, assignedVehicles: plan._count.assignments, tasks: plan.tasks.map((task) => ({ id: task.id, planId: task.planId, code: task.code, name: task.name, componentType: task.componentType, intervalKm: task.intervalKm, intervalDays: task.intervalDays, alertKmBefore: task.alertKmBefore, alertDaysBefore: task.alertDaysBefore, priority: task.priority, estimatedCents: task.estimatedCents, instructions: task.instructions, active: task.active, sortOrder: task.sortOrder })) })),
    vehicleComponents: vehicleComponents.map((item) => ({ id: item.id, vehicleId: item.vehicleId, code: item.code, componentType: item.componentType, name: item.name, brand: item.brand, model: item.model, serialNo: item.serialNo, installedAt: iso(item.installedAt), installedOdometerKm: item.installedOdometerKm, active: item.active, vehicle: item.vehicle })),
    maintenanceSchedules: maintenanceSchedules.map((item) => { const due = maintenanceDueState({ vehicleOdometerKm: item.vehicle.odometerKm, nextDueKm: item.nextDueKm, nextDueAt: item.nextDueAt, alertKmBefore: item.alertKmBefore, alertDaysBefore: item.alertDaysBefore, hasOpenOrder: item.orders.length > 0 }); return { id: item.id, vehicleId: item.vehicleId, taskId: item.taskId, componentId: item.componentId, intervalKm: item.intervalKm, intervalDays: item.intervalDays, alertKmBefore: item.alertKmBefore, alertDaysBefore: item.alertDaysBefore, lastServiceKm: item.lastServiceKm, lastServiceAt: iso(item.lastServiceAt), nextDueKm: item.nextDueKm, nextDueAt: iso(item.nextDueAt), dueState: due.state, dueReason: due.reason, vehicle: item.vehicle, task: { code: item.task.code, name: item.task.name, componentType: item.task.componentType, priority: item.task.priority, estimatedCents: item.task.estimatedCents, plan: item.task.plan }, component: item.component, openOrderId: item.orders[0]?.id ?? null }; }),
    inventory,
    tires: tires.map((item) => ({ id: item.id, serialNo: item.serialNo, brand: item.brand, model: item.model, size: item.size, purchaseAt: iso(item.purchaseAt), purchaseCents: item.purchaseCents, initialTreadMm: item.initialTreadMm, currentTreadMm: item.currentTreadMm, status: item.status, currentVehicleId: item.currentVehicleId, currentPosition: item.currentPosition, active: item.active, events: item.events.map((event) => ({ id: event.id, vehicleId: event.vehicleId, type: event.type, position: event.position, treadMm: event.treadMm, odometerKm: event.odometerKm, costCents: event.costCents, notes: event.notes, occurredAt: event.occurredAt.toISOString() })) })),
    metrics: { activeTrips: trips.filter((item) => ["ASSIGNED", "IN_TRANSIT"].includes(item.status)).length, availableVehicles: vehicles.filter((item) => item.active && item.status === "AVAILABLE").length, availableDrivers: drivers.filter((item) => item.active && item.status === "AVAILABLE" && scheduledTypeAt(item.workCycleAnchor, item.workDays, item.restDays, new Date()) === "WORK").length, openIncidents: trips.reduce((sum, item) => sum + item.incidents.filter((incident) => incident.status === "OPEN").length, 0), expiringDocuments: documents.filter((item) => item.status === "VALID" && item.expiresAt && item.expiresAt <= documentLimit).length, appointmentRisk: trips.filter((item) => item.appointmentStartAt && item.appointmentStartAt <= new Date(Date.now() + 2 * 3_600_000) && ["PENDING", "CONFIRMED", "REPROGRAMMED"].includes(item.appointmentStatus) && !["DELIVERED", "CANCELLED"].includes(item.status)).length, unassignedTrips: trips.filter((item) => item.scheduledStartAt <= new Date(Date.now() + 2 * 3_600_000) && ["DRAFT", "PLANNED"].includes(item.status) && !item.assignments.some((assignment) => assignment.status === "ACTIVE")).length, delayedTrips: trips.filter((item) => item.scheduledEndAt < new Date() && ["ASSIGNED", "IN_TRANSIT"].includes(item.status)).length, monthRevenueCents, monthExpenseCents, monthProfitCents: monthRevenueCents - monthExpenseCents, fleetUtilizationPct: activeVehicles ? Math.round(assignedVehicleIds.size * 100 / activeVehicles) : 0 },
    pagination: primaryDomain ? { section, resource: primaryDomain, page: options.page, pageSize: options.pageSize, total: primaryTotal, totalPages: Math.max(1, Math.ceil(primaryTotal / options.pageSize)), query: options.query, status: options.status } : null,
  };
}
