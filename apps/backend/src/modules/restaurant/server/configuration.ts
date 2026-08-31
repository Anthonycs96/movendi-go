import "server-only";

import type { RestaurantCatalogOption, RestaurantConfiguration } from "@movendi/contracts";
import { z } from "zod";
import { audit } from "@/core/audit/audit";
import { AppError } from "@/core/auth/errors";
import type { TenantScope } from "@/core/auth/types";
import { prisma } from "@/core/database/prisma";

const option = (key: string, label: string): RestaurantCatalogOption => ({ key, label, active: true });
const status = (key: string, label: string, allowedNext: string[], terminal = false) => ({ ...option(key, label), allowedNext, terminal });

export const defaultRestaurantConfiguration: RestaurantConfiguration = {
  version: 1,
  general: { orderPrefix: "PED", salePrefix: "VTA", taxIncluded: true, taxRatePct: 18, serviceChargePct: 0, defaultLanguage: "es-PE" },
  orders: {
    sources: [option("DINE_IN", "Salón"), option("TAKEAWAY", "Para llevar"), option("DELIVERY", "Delivery")],
    statuses: [status("PLACED", "Enviado", ["PREPARING", "READY", "SERVED", "CANCELLED"]), status("PREPARING", "Preparando", ["READY", "SERVED", "CANCELLED"]), status("READY", "Listo", ["SERVED", "CANCELLED"]), status("SERVED", "Servido", ["COMPLETED", "CANCELLED"]), status("COMPLETED", "Completado", [], true), status("CANCELLED", "Cancelado", [], true)],
    cancellationReasons: [option("CUSTOMER_REQUEST", "Solicitud del cliente"), option("OUT_OF_STOCK", "Sin stock"), option("PREPARATION_ERROR", "Error de preparación"), option("DUPLICATE", "Pedido duplicado"), option("OTHER", "Otro")],
    requireCancellationReason: true,
    allowItemNotes: true,
    allowAddItemsAfterKitchen: true,
  },
  floor: { tableStatuses: [option("AVAILABLE", "Disponible"), option("RESERVED", "Reservada"), option("IN_SERVICE", "En atención"), option("CLEANING", "Limpieza")], defaultSeats: 4, reservationsEnabled: true, reservationLeadMinutes: 30, reservationToleranceMinutes: 15, cleaningRequired: true },
  menu: { productTypes: [option("FOOD", "Plato"), option("BEVERAGE", "Bebida"), option("ADDON", "Adicional"), option("COMBO", "Combo")], requireCost: true, allowOutOfStockSales: false, showDescription: true, addonsEnabled: true },
  kitchen: { ticketStatuses: [status("QUEUED", "En cola", ["PREPARING", "READY", "SERVED", "CANCELLED"]), status("PREPARING", "Preparando", ["READY", "SERVED", "CANCELLED"]), status("READY", "Listo", ["SERVED", "CANCELLED"]), status("SERVED", "Servido", [], true), status("CANCELLED", "Cancelado", [], true)], warningMinutes: 25, criticalMinutes: 45, autoQueue: true, allowKitchenCancellation: true, requirePreparationArea: false },
  sales: { paymentMethods: [option("CASH", "Efectivo"), option("CARD", "Tarjeta"), option("TRANSFER", "Transferencia"), option("YAPE", "Yape"), option("PLIN", "Plin"), option("OTHER", "Otro")], requireOpenCash: true, splitPaymentsEnabled: false, maxDiscountPct: 30, cashDifferenceToleranceCents: 1000, approvalRoleKeys: ["MANAGER"] },
  delivery: { enabled: true, statuses: [status("PENDING", "Pendiente", ["READY", "DISPATCHED", "CANCELLED"]), status("READY", "Listo para enviar", ["DISPATCHED", "CANCELLED"]), status("DISPATCHED", "En camino", ["DELIVERED", "CANCELLED"]), status("DELIVERED", "Entregado", [], true), status("CANCELLED", "Cancelado", [], true)], defaultFeeCents: 0, requireCustomer: true, requirePhone: true, requireAddress: true },
  customers: { documentTypes: [option("DNI", "DNI"), option("CE", "Carné de extranjería"), option("RUC", "RUC"), option("NONE", "Sin documento")], requireDocument: false, loyaltyEnabled: false, pointsPerCurrencyUnit: 1, segments: [option("NEW", "Nuevo"), option("FREQUENT", "Frecuente"), option("VIP", "VIP"), option("CORPORATE", "Corporativo")] },
  inventory: { units: [option("UND", "Unidad"), option("KG", "Kilogramo"), option("G", "Gramo"), option("L", "Litro"), option("ML", "Mililitro"), option("PORCION", "Porción")], preventNegativeStock: true, autoDeductRecipes: true, lowStockAlerts: true, wasteReasons: [option("EXPIRED", "Vencimiento"), option("PREPARATION", "Preparación"), option("DAMAGE", "Daño"), option("ADJUSTMENT", "Ajuste")] },
  promotions: { kinds: [option("PERCENT", "Porcentaje"), option("FIXED", "Monto fijo"), option("QUANTITY", "Por cantidad")], scopes: [option("ORDER", "Pedido"), option("CATEGORY", "Categoría"), option("PRODUCT", "Producto")], maxPercent: 100, requireManagerApproval: false },
  notifications: { rules: [
    { event: "KITCHEN_DELAY", label: "Demora en cocina", roleKeys: ["MANAGER", "KITCHEN"], channels: ["IN_APP"], active: true },
    { event: "LOW_STOCK", label: "Stock bajo", roleKeys: ["MANAGER"], channels: ["IN_APP", "EMAIL"], active: true },
    { event: "CASH_DIFFERENCE", label: "Diferencia de caja", roleKeys: ["MANAGER", "CASHIER"], channels: ["IN_APP"], active: true },
    { event: "DELIVERY_DELAY", label: "Delivery demorado", roleKeys: ["MANAGER", "WAITER"], channels: ["IN_APP"], active: true },
  ] },
  integrations: { sunatEnabled: false, sunatProvider: "NUBEFACT", sunatEnvironment: "BETA", sunatAutoIssue: false, sunatInvoiceSeries: "F001", sunatReceiptSeries: "B001", deliveryProvider: "", deliveryEnabled: false, reservationsProvider: "", reservationsIntegrationEnabled: false, accountingProvider: "", accountingEnabled: false, webhookUrl: "" },
  reports: { cutoffHour: 0, includeCancelledOrders: false, defaultPeriod: "30d" },
};

const catalogOptionSchema = z.object({ key: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]+$/).min(1).max(60), label: z.string().trim().min(1).max(100), active: z.boolean() });
const catalog = z.array(catalogOptionSchema).min(1).max(100);
const statusCatalog = z.array(catalogOptionSchema.extend({ terminal: z.boolean(), allowedNext: z.array(z.string().trim().toUpperCase().max(60)).max(30) })).min(1).max(50);
const sectionSchemas = {
  general: z.object({ orderPrefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{1,10}$/), salePrefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{1,10}$/), taxIncluded: z.boolean(), taxRatePct: z.coerce.number().min(0).max(100), serviceChargePct: z.coerce.number().min(0).max(100), defaultLanguage: z.string().trim().min(2).max(20) }),
  orders: z.object({ sources: catalog, statuses: statusCatalog, cancellationReasons: catalog, requireCancellationReason: z.boolean(), allowItemNotes: z.boolean(), allowAddItemsAfterKitchen: z.boolean() }),
  floor: z.object({ tableStatuses: catalog, defaultSeats: z.coerce.number().int().min(1).max(100), reservationsEnabled: z.boolean(), reservationLeadMinutes: z.coerce.number().int().min(0).max(10080), reservationToleranceMinutes: z.coerce.number().int().min(0).max(1440), cleaningRequired: z.boolean() }),
  menu: z.object({ productTypes: catalog, requireCost: z.boolean(), allowOutOfStockSales: z.boolean(), showDescription: z.boolean(), addonsEnabled: z.boolean() }),
  kitchen: z.object({ ticketStatuses: statusCatalog, warningMinutes: z.coerce.number().int().min(1).max(1440), criticalMinutes: z.coerce.number().int().min(1).max(1440), autoQueue: z.boolean(), allowKitchenCancellation: z.boolean(), requirePreparationArea: z.boolean() }),
  sales: z.object({ paymentMethods: catalog, requireOpenCash: z.boolean(), splitPaymentsEnabled: z.boolean(), maxDiscountPct: z.coerce.number().min(0).max(100), cashDifferenceToleranceCents: z.coerce.number().int().min(0).max(100_000_000), approvalRoleKeys: z.array(z.string().trim().toUpperCase().min(1).max(40)).max(30) }),
  delivery: z.object({ enabled: z.boolean(), statuses: statusCatalog, defaultFeeCents: z.coerce.number().int().min(0).max(100_000_000), requireCustomer: z.boolean(), requirePhone: z.boolean(), requireAddress: z.boolean() }),
  customers: z.object({ documentTypes: catalog, requireDocument: z.boolean(), loyaltyEnabled: z.boolean(), pointsPerCurrencyUnit: z.coerce.number().min(0).max(1000), segments: catalog }),
  inventory: z.object({ units: catalog, preventNegativeStock: z.boolean(), autoDeductRecipes: z.boolean(), lowStockAlerts: z.boolean(), wasteReasons: catalog }),
  promotions: z.object({ kinds: catalog, scopes: catalog, maxPercent: z.coerce.number().min(0).max(100), requireManagerApproval: z.boolean() }),
  notifications: z.object({ rules: z.array(z.object({ event: z.string().trim().toUpperCase().min(1).max(80), label: z.string().trim().min(1).max(120), roleKeys: z.array(z.string().trim().toUpperCase().min(1).max(40)).max(30), channels: z.array(z.enum(["IN_APP", "EMAIL", "SMS", "WEBHOOK"])).max(4), active: z.boolean() })).max(100) }),
  integrations: z.object({ sunatEnabled: z.boolean(), sunatProvider: z.literal("NUBEFACT"), sunatEnvironment: z.enum(["BETA", "PRODUCTION"]), sunatAutoIssue: z.boolean(), sunatInvoiceSeries: z.string().trim().toUpperCase().regex(/^F[A-Z0-9]{3}$/), sunatReceiptSeries: z.string().trim().toUpperCase().regex(/^B[A-Z0-9]{3}$/), deliveryProvider: z.string().trim().max(80), deliveryEnabled: z.boolean(), reservationsProvider: z.string().trim().max(80), reservationsIntegrationEnabled: z.boolean(), accountingProvider: z.string().trim().max(80), accountingEnabled: z.boolean(), webhookUrl: z.union([z.string().trim().url(), z.literal("")]) }),
  reports: z.object({ cutoffHour: z.coerce.number().int().min(0).max(23), includeCancelledOrders: z.boolean(), defaultPeriod: z.enum(["7d", "30d", "90d", "12m"]) }),
} satisfies Record<keyof Omit<RestaurantConfiguration, "version">, z.ZodTypeAny>;

export type RestaurantConfigurationSection = keyof typeof sectionSchemas;

export const branchRestaurantConfigurationSections = new Set<RestaurantConfigurationSection>([
  "orders", "floor", "menu", "kitchen", "sales", "delivery", "inventory", "promotions",
]);

export function restaurantConfigurationScope(section: RestaurantConfigurationSection) {
  return branchRestaurantConfigurationSections.has(section) ? "BRANCH" as const : "COMPANY" as const;
}

function mergeDefaults(value: unknown): RestaurantConfiguration {
  if (!value || typeof value !== "object" || Array.isArray(value)) return structuredClone(defaultRestaurantConfiguration);
  const incoming = value as Partial<RestaurantConfiguration>;
  const merged = structuredClone(defaultRestaurantConfiguration);
  if (Number.isInteger(incoming.version) && Number(incoming.version) > 0) merged.version = Number(incoming.version);
  for (const key of Object.keys(sectionSchemas) as RestaurantConfigurationSection[]) {
    const candidate = incoming[key];
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) (merged as unknown as Record<string, unknown>)[key] = { ...(merged as unknown as Record<string, Record<string, unknown>>)[key], ...candidate };
  }
  return merged;
}

export function parseRestaurantConfiguration(raw: string | null | undefined) {
  try { return mergeDefaults(JSON.parse(raw ?? "{}")); } catch { return structuredClone(defaultRestaurantConfiguration); }
}

export async function getRestaurantConfiguration(tenantId: string, branchId?: string) {
  const record = await prisma.restaurantConfiguration.findUnique({ where: { tenantId }, select: { settings: true } });
  const company = parseRestaurantConfiguration(record?.settings);
  if (!branchId) return company;
  const branch = await prisma.restaurantBranchConfiguration.findFirst({ where: { tenantId, branchId }, select: { settings: true } });
  if (!branch) return company;
  try {
    const overrides = JSON.parse(branch.settings) as Partial<RestaurantConfiguration>;
    const effective = structuredClone(company);
    for (const section of branchRestaurantConfigurationSections) {
      if (overrides[section] && typeof overrides[section] === "object") (effective as unknown as Record<string, unknown>)[section] = overrides[section];
    }
    if (Number.isInteger(overrides.version) && Number(overrides.version) > effective.version) effective.version = Number(overrides.version);
    return effective;
  } catch { return company; }
}

export async function hasStoredRestaurantConfiguration(tenantId: string) {
  const [company, branch] = await Promise.all([
    prisma.restaurantConfiguration.findUnique({ where: { tenantId }, select: { id: true } }),
    prisma.restaurantBranchConfiguration.findFirst({ where: { tenantId }, select: { id: true } }),
  ]);
  return Boolean(company || branch);
}

export function assertRestaurantConfigured(options: RestaurantCatalogOption[], value: string, label: string) {
  if (!options.some((item) => item.active && item.key === value)) throw new AppError("CONFIG_VALUE_NOT_ALLOWED", 400, `${label} no está habilitado en la configuración de este restaurante.`);
}

function validateStatusFlow(section: RestaurantConfigurationSection, value: unknown) {
  if (section !== "orders" && section !== "kitchen" && section !== "delivery") return;
  const statuses = section === "orders" ? (value as RestaurantConfiguration["orders"]).statuses : section === "kitchen" ? (value as RestaurantConfiguration["kitchen"]).ticketStatuses : (value as RestaurantConfiguration["delivery"]).statuses;
  const requiredBySection = { orders: ["PLACED", "PREPARING", "READY", "SERVED", "COMPLETED", "CANCELLED"], kitchen: ["QUEUED", "PREPARING", "READY", "SERVED", "CANCELLED"], delivery: ["PENDING", "READY", "DISPATCHED", "DELIVERED", "CANCELLED"] } as const;
  const keys = new Set(statuses.map((item) => item.key));
  const required = requiredBySection[section].filter((key) => !keys.has(key));
  const unknownTransitions = statuses.flatMap((item) => item.allowedNext.filter((key) => !keys.has(key)).map((key) => `${item.key} → ${key}`));
  if (required.length || unknownTransitions.length) throw new AppError("VALIDATION_ERROR", 400, "El flujo debe conservar los estados técnicos base y usar transiciones válidas.", { required, unknownTransitions });
}

export async function saveRestaurantConfigurationSection(tenantId: string, section: RestaurantConfigurationSection, raw: unknown, scope?: TenantScope) {
  const parsed = sectionSchemas[section].safeParse(raw);
  if (!parsed.success) throw new AppError("VALIDATION_ERROR", 400, "Revisa los parámetros de esta sección.", parsed.error.flatten());
  validateStatusFlow(section, parsed.data);
  if (section === "kitchen" && (parsed.data as RestaurantConfiguration["kitchen"]).criticalMinutes <= (parsed.data as RestaurantConfiguration["kitchen"]).warningMinutes) throw new AppError("VALIDATION_ERROR", 400, "El umbral crítico de cocina debe ser mayor que el preventivo.");
  const targetScope = restaurantConfigurationScope(section);
  const branchId = targetScope === "BRANCH" ? scope?.branchId : undefined;
  if (targetScope === "BRANCH" && !branchId) throw new AppError("BRANCH_REQUIRED", 400, "Selecciona una sede para guardar esta configuración operativa.");
  const current = await getRestaurantConfiguration(tenantId, branchId);
  const latestVersion = await prisma.restaurantConfigurationVersion.findFirst({ where: { tenantId }, orderBy: { version: "desc" }, select: { version: true } });
  const next = { ...current, version: Math.max(current.version, latestVersion?.version ?? 0) + 1, [section]: parsed.data } as RestaurantConfiguration;
  const storedBranch = branchId ? await prisma.restaurantBranchConfiguration.findUnique({ where: { branchId }, select: { settings: true } }) : null;
  let branchOverrides: Record<string, unknown> = {};
  try { branchOverrides = JSON.parse(storedBranch?.settings ?? "{}"); } catch { branchOverrides = {}; }
  const record = targetScope === "BRANCH"
    ? await prisma.restaurantBranchConfiguration.upsert({
      where: { branchId: branchId! },
      create: { tenantId, branchId: branchId!, settings: JSON.stringify({ version: next.version, [section]: parsed.data }) },
      update: { settings: JSON.stringify({ ...branchOverrides, version: next.version, [section]: parsed.data }) },
    })
    : await prisma.restaurantConfiguration.upsert({ where: { tenantId }, create: { tenantId, settings: JSON.stringify(next) }, update: { settings: JSON.stringify(next) } });
  await prisma.restaurantConfigurationVersion.create({ data: { tenantId, branchId, actorId: scope?.actorId, scope: targetScope, section, version: next.version, snapshot: JSON.stringify(parsed.data) } });
  if (scope) await audit(scope, "UPDATE_CONFIGURATION", targetScope === "BRANCH" ? "RestaurantBranchConfiguration" : "RestaurantConfiguration", record.id, { section, version: next.version, scope: targetScope });
  return targetScope === "COMPANY" && scope?.branchId ? getRestaurantConfiguration(tenantId, scope.branchId) : next;
}

export async function getRestaurantConfigurationHistory(scope: TenantScope) {
  const versions = await prisma.restaurantConfigurationVersion.findMany({
    where: { tenantId: scope.tenantId, OR: [{ scope: "COMPANY" }, { scope: "BRANCH", branchId: scope.branchId }] },
    orderBy: { createdAt: "desc" }, take: 100,
    include: { actor: { select: { name: true } }, branch: { select: { name: true } } },
  });
  return versions.map((item) => ({ id: item.id, section: item.section, scope: item.scope, version: item.version, actorName: item.actor?.name ?? "Sistema", branchName: item.branch?.name ?? null, createdAt: item.createdAt.toISOString() }));
}

export async function rollbackRestaurantConfiguration(versionId: string, scope: TenantScope) {
  const version = await prisma.restaurantConfigurationVersion.findFirst({ where: { id: versionId, tenantId: scope.tenantId, OR: [{ scope: "COMPANY" }, { scope: "BRANCH", branchId: scope.branchId }] } });
  if (!version || !(version.section in sectionSchemas)) throw new AppError("NOT_FOUND", 404, "La versión de configuración no existe para esta empresa o sede.");
  let snapshot: unknown;
  try { snapshot = JSON.parse(version.snapshot); } catch { throw new AppError("INVALID_VERSION", 409, "La versión guardada no se puede restaurar."); }
  return saveRestaurantConfigurationSection(scope.tenantId, version.section as RestaurantConfigurationSection, snapshot, scope);
}
