import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/core/database/prisma";
import { AppError } from "@/core/auth/errors";
import type { AuthSession } from "@/core/auth/types";
import { defaultTransportConfiguration, saveTransportConfigurationSection, type TransportConfigurationSection } from "@/modules/transport/server/configuration";
import { defaultRestaurantConfiguration, saveRestaurantConfigurationSection, type RestaurantConfigurationSection } from "@/modules/restaurant/server/configuration";
import { getRestaurantReadiness } from "@/modules/restaurant/server/readiness";
import { persistRestaurantControlMasterData, persistRestaurantSalesMasterData } from "./restaurant-master-data";
import { detectRestaurantAreas, normalizeRestaurantArea, normalizeRestaurantCatalogLabel, type DetectedRestaurantArea } from "@movendi/contracts";
import { existingPreparationAreasByKey, reconcilePreparationAreas, type PreparationAreaInput } from "@/modules/restaurant/server/areas";

const moduleKeys = {
  RESTAURANT: ["dashboard", "floor", "orders", "kitchen", "clients", "menu", "inventory", "promotions", "checkout", "reports", "settings"],
  BARBERSHOP: ["dashboard", "appointments", "clients", "team", "services", "inventory", "checkout", "settings"],
  TRANSPORT: ["dashboard", "operations", "fleet", "drivers", "documents", "finance", "fuel", "maintenance", "inventory", "tires", "reports", "settings"],
} as const;

export const setupTemplates = [
  { key: "RESTAURANT_SIMPLE", type: "RESTAURANT", name: "Restaurante esencial configurable", description: "Implementación guiada de salón, pedidos, cocina, carta, caja y reglas operativas.", modules: ["dashboard", "floor", "orders", "kitchen", "menu", "checkout", "settings"], preparationAreas: ["Cocina"], diningArea: "Salón", roles: ["WAITER", "KITCHEN", "CASHIER"], restaurantConfiguration: defaultRestaurantConfiguration },
  { key: "RESTAURANT_COMPLETE", type: "RESTAURANT", name: "Restaurante completo configurable", description: "Operación completa con inventario, promociones, reportes, clientes e integraciones.", modules: [...moduleKeys.RESTAURANT], preparationAreas: ["Cocina", "Bar", "Postres"], diningArea: "Salón principal", roles: ["WAITER", "KITCHEN", "CASHIER", "MANAGER"], restaurantConfiguration: defaultRestaurantConfiguration },
  { key: "BARBERSHOP_STANDARD", type: "BARBERSHOP", name: "Barbería estándar", description: "Agenda, equipo, servicios, clientes, inventario y caja.", modules: [...moduleKeys.BARBERSHOP], preparationAreas: [], diningArea: null, roles: ["RECEPTION", "PROFESSIONAL", "CASHIER"] },
  { key: "TRANSPORT_STANDARD", type: "TRANSPORT", name: "Transporte configurable", description: "Implementación completa: operación, clientes, flota, conductores, reglas, finanzas, mantenimiento, seguridad e integraciones.", modules: [...moduleKeys.TRANSPORT], preparationAreas: [], diningArea: null, roles: ["DISPATCH", "DRIVER_MANAGER", "FINANCE"], transportConfiguration: defaultTransportConfiguration },
] as const;

type StepKey = "BUSINESS" | "MODULES" | "CATALOG" | "TEAM" | "OPERATIONS" | "TABLES" | "PRINTING" | "RESTAURANT_OPERATION" | "RESTAURANT_KITCHEN" | "RESTAURANT_SALES" | "RESTAURANT_CONTROL" | "RESTAURANT_INTEGRATIONS" | "TRANSPORT_OPERATION" | "TRANSPORT_CUSTOMERS" | "TRANSPORT_FLEET" | "TRANSPORT_DRIVERS" | "TRANSPORT_RULES" | "TRANSPORT_FINANCE" | "TRANSPORT_MAINTENANCE" | "TRANSPORT_SAFETY" | "TRANSPORT_INTEGRATIONS" | "REVIEW";
const text = z.string().trim().max(160);
const draftField = { draft: z.boolean().optional().default(false) };
const businessStep = z.object({ step: z.literal("BUSINESS"), name: text.min(2), shortName: text.min(2).max(40), branchName: text.min(2).max(100), email: z.string().trim().email().or(z.literal("")), phone: text.optional().default(""), address: text.optional().default(""), country: text.min(2).max(3), currency: text.min(3).max(3), timezone: text.min(3).max(80), ...draftField });
const modulesStep = z.object({ step: z.literal("MODULES"), enabledModules: z.array(z.string().trim().min(1).max(40)).min(1).max(30), ...draftField });
const catalogStep = z.object({
  step: z.literal("CATALOG"), skip: z.boolean().optional().default(false),
  categories: z.array(z.object({ name: text.min(2).max(100), preparationArea: text.optional().default("") })).max(100).default([]),
  products: z.array(z.object({ name: text.min(2).max(140), category: text.min(2).max(100), description: z.string().trim().max(400).optional().default(""), price: z.coerce.number().min(0).max(100000), cost: z.coerce.number().min(0).max(100000).default(0), preparationArea: text.optional().default("") })).max(500).default([]),
  addons: z.array(z.object({ name: text.min(2).max(140), price: z.coerce.number().min(0).max(100000), cost: z.coerce.number().min(0).max(100000).default(0), preparationArea: text.optional().default(""), areaAssignmentMode: z.enum(["INHERIT_FROM_PRODUCT", "SPECIFIC_AREA"]).default("INHERIT_FROM_PRODUCT") })).max(200).default([]),
  services: z.array(z.object({ name: text.min(2).max(120), category: text.optional().default(""), durationMinutes: z.coerce.number().int().min(5).max(720), price: z.coerce.number().positive().max(100000) })).max(300).default([]),
  masterData: z.unknown().optional(), importedUsers: z.unknown().optional(), importedZones: z.unknown().optional(),
  ...draftField,
});
const teamStep = z.object({
  step: z.literal("TEAM"),
  roles: z.array(z.object({ key: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]+$/).min(2).max(30), name: text.min(2).max(80), permissions: z.array(z.string().trim().min(1).max(80)).max(100) })).max(30).default([]),
  users: z.array(z.object({ name: text.min(2).max(120), email: z.string().trim().toLowerCase().email(), roleKey: z.string().trim().toUpperCase().min(2).max(30), password: z.string().min(8).max(100).optional().or(z.literal("")) })).max(100).default([]),
  ...draftField,
});
const preparationAreaInput = z.union([
  text.min(2).max(80).transform((name) => ({ name, enabled: true })),
  z.object({ name: text.min(2).max(80), normalizedKey: z.string().trim().max(80).optional(), type: z.enum(["KITCHEN", "BAR", "GRILL", "DESSERT", "BEVERAGE", "CUSTOM"]).optional(), source: z.enum(["TEMPLATE", "ONBOARDING", "MANUAL"]).optional(), dispatchMode: z.enum(["KDS", "PRINTER", "NONE"]).optional(), enabled: z.boolean().optional().default(true) }),
]);
const operationsStep = z.object({ step: z.literal("OPERATIONS"), preparationAreas: z.array(preparationAreaInput).max(30).default([]), paymentMethods: z.array(z.enum(["CASH", "CARD", "TRANSFER", "YAPE", "PLIN", "OTHER"])).min(1), hours: z.array(z.object({ weekday: z.number().int().min(0).max(6), open: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), close: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), closed: z.boolean() })).length(7), ...draftField });
const tablesStep = z.object({ step: z.literal("TABLES"), skip: z.boolean().optional().default(false), zones: z.array(z.object({ name: text.min(2).max(80), prefix: text.min(1).max(20), count: z.coerce.number().int().min(1).max(200), seats: z.coerce.number().int().min(1).max(50) })).max(20).default([]), ...draftField });
const printingStep = z.object({ step: z.literal("PRINTING"), skip: z.boolean().optional().default(false), mode: z.enum(["SIMPLE", "ADVANCED"]).default("SIMPLE"), automatic: z.boolean().default(true), areaDestinations: z.array(z.object({ areaName: text.min(2).max(80), dispatchMode: z.enum(["KDS", "PRINTER", "NONE"]) })).max(30).default([]), printers: z.array(z.object({ name: text.min(2).max(100), connectionType: z.enum(["BROWSER", "LOCAL_AGENT"]), paperWidthMm: z.union([z.literal(58), z.literal(80)]), copies: z.coerce.number().int().min(1).max(5), areas: z.array(text.min(2).max(80)).max(30) })).max(20).default([]), ...draftField });
const transportStep = <TStep extends Exclude<StepKey, "BUSINESS" | "MODULES" | "CATALOG" | "TEAM" | "OPERATIONS" | "TABLES" | "PRINTING" | "REVIEW">>(step: TStep) => z.object({ step: z.literal(step), sections: z.record(z.string(), z.unknown()), masterData: z.unknown().optional(), ...draftField });
const restaurantOperationStep = transportStep("RESTAURANT_OPERATION");
const restaurantKitchenStep = transportStep("RESTAURANT_KITCHEN");
const restaurantSalesStep = transportStep("RESTAURANT_SALES");
const restaurantControlStep = transportStep("RESTAURANT_CONTROL");
const restaurantIntegrationsStep = transportStep("RESTAURANT_INTEGRATIONS");
const transportOperationStep = transportStep("TRANSPORT_OPERATION");
const transportCustomersStep = transportStep("TRANSPORT_CUSTOMERS");
const transportFleetStep = transportStep("TRANSPORT_FLEET");
const transportDriversStep = transportStep("TRANSPORT_DRIVERS");
const transportRulesStep = transportStep("TRANSPORT_RULES");
const transportFinanceStep = transportStep("TRANSPORT_FINANCE");
const transportMaintenanceStep = transportStep("TRANSPORT_MAINTENANCE");
const transportSafetyStep = transportStep("TRANSPORT_SAFETY");
const transportIntegrationsStep = transportStep("TRANSPORT_INTEGRATIONS");
const reviewStep = z.object({ step: z.literal("REVIEW"), ready: z.literal(true), ...draftField });

export const setupStepSchema = z.discriminatedUnion("step", [businessStep, modulesStep, catalogStep, teamStep, operationsStep, tablesStep, printingStep, restaurantOperationStep, restaurantKitchenStep, restaurantSalesStep, restaurantControlStep, restaurantIntegrationsStep, transportOperationStep, transportCustomersStep, transportFleetStep, transportDriversStep, transportRulesStep, transportFinanceStep, transportMaintenanceStep, transportSafetyStep, transportIntegrationsStep, reviewStep]);
export type SetupStepInput = z.infer<typeof setupStepSchema>;

const defaultPermissions: Record<string, string[]> = {
  WAITER: ["dashboard:read", "restaurant:floor:read", "restaurant:floor:write", "restaurant:orders:read", "restaurant:orders:write", "restaurant:menu:read", "restaurant:promotions:read", "customers:read"],
  KITCHEN: ["dashboard:read", "restaurant:kitchen:read", "restaurant:kitchen:write", "restaurant:orders:read"],
  CASHIER: ["dashboard:read", "restaurant:orders:read", "restaurant:cash:write", "customers:read"],
  MANAGER: ["*"], RECEPTION: ["dashboard:read", "barbershop:appointments:read", "barbershop:appointments:write", "customers:read", "customers:write", "services:read"],
  PROFESSIONAL: ["dashboard:read", "barbershop:appointments:read", "barbershop:team:read", "customers:read", "services:read"],
  DISPATCH: ["dashboard:read", "transport:operations:read", "transport:operations:write", "transport:fleet:read", "transport:drivers:read"],
  DRIVER_MANAGER: ["dashboard:read", "transport:drivers:read", "transport:drivers:write", "transport:documents:read"],
  FINANCE: ["dashboard:read", "transport:finance:read", "transport:finance:write", "transport:reports:read"],
};

function roleName(key: string) {
  const names: Record<string, string> = { WAITER: "Mesero", KITCHEN: "Cocina", CASHIER: "Caja", MANAGER: "Administrador de local", RECEPTION: "Recepción", PROFESSIONAL: "Profesional", DISPATCH: "Despacho", DRIVER_MANAGER: "Coordinación de conductores", FINANCE: "Finanzas" };
  return names[key] ?? key;
}

function parseStringArray(value: string | null | undefined) {
  try { const parsed = JSON.parse(value ?? "[]"); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []; } catch { return []; }
}

function parseObject(value: string | null | undefined) {
  try { const parsed = JSON.parse(value ?? "{}"); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}; } catch { return {}; }
}

type RestaurantCatalogInput = Extract<SetupStepInput, { step: "CATALOG" }>;

function detectedAreasForCatalog(input: RestaurantCatalogInput): DetectedRestaurantArea[] {
  return detectRestaurantAreas([
    ...input.categories.map((item) => item.preparationArea),
    ...input.products.map((item) => item.preparationArea),
    ...input.addons.filter((item) => item.areaAssignmentMode === "SPECIFIC_AREA").map((item) => item.preparationArea),
  ]);
}

async function runInBatches<T>(items: T[], callback: (item: T) => Promise<unknown>, size = 40) {
  for (let index = 0; index < items.length; index += size) await Promise.all(items.slice(index, index + size).map(callback));
}

async function persistRestaurantCatalog(tenantId: string, branchId: string, input: RestaurantCatalogInput) {
  const existingAreas = await existingPreparationAreasByKey(tenantId, branchId);
  const areaReference = (name: string, context: string, optional = false) => {
    if (!name.trim() && optional) return { key: null, areaId: null };
    const normalized = normalizeRestaurantArea(name);
    const area = normalized ? existingAreas.get(normalized.key) : null;
    if (!normalized || !area) throw new AppError("CATALOG_AREA_NOT_CONFIGURED", 409, `${context} debe seleccionar un área operativa activa. Configura las áreas antes de la carta.`);
    return { key: normalized.key, areaId: area.id };
  };
  if (!input.categories.length) throw new AppError("CATALOG_CATEGORY_REQUIRED", 409, "Crea al menos una categoría antes de agregar productos.");
  if (!input.products.length) throw new AppError("CATALOG_PRODUCT_REQUIRED", 409, "Agrega al menos un producto o marca la carta para completarla después.");

  const categories = new Map<string, { name: string; preparationArea: string }>();
  for (const category of input.categories) {
    const normalized = normalizeRestaurantCatalogLabel(category.name);
    const previous = categories.get(normalized.key);
    if (previous && normalizeRestaurantArea(previous.preparationArea)?.key !== normalizeRestaurantArea(category.preparationArea)?.key) throw new AppError("CATALOG_CATEGORY_DUPLICATE", 409, `La categoría “${normalized.name}” está repetida con áreas diferentes.`);
    categories.set(normalized.key, { name: normalized.name, preparationArea: category.preparationArea });
  }
  for (const product of input.products) {
    const categoryKey = normalizeRestaurantCatalogLabel(product.category).key;
    if (!categories.has(categoryKey)) throw new AppError("CATALOG_CATEGORY_UNRESOLVED", 409, `Selecciona una categoría existente para “${product.name}”.`);
  }
  if (input.addons.length) categories.set(normalizeRestaurantCatalogLabel("Adicionales").key, { name: "Adicionales", preparationArea: "" });

  const itemKeys = new Set<string>();
  for (const item of [...input.products, ...input.addons]) {
    const normalized = normalizeRestaurantCatalogLabel(item.name);
    if (itemKeys.has(normalized.key)) throw new AppError("CATALOG_ITEM_DUPLICATE", 409, `El producto o adicional “${normalized.name}” está repetido.`);
    itemKeys.add(normalized.key);
  }

  const products = [
    ...input.products.map((product) => ({ ...product, productType: "FOOD", areaAssignmentMode: "SPECIFIC_AREA" as const })),
    ...input.addons.map((addon) => ({ ...addon, category: "Adicionales", description: "Adicional", productType: "ADDON", areaAssignmentMode: addon.areaAssignmentMode })),
  ];
  await prisma.$transaction(async (tx) => {
    const storedBefore = await tx.category.findMany({ where: { tenantId, branchId }, select: { id: true, name: true } });
    await runInBatches([...categories.values()], async (category) => {
      const reference = category.name === "Adicionales" ? { key: null, areaId: null } : areaReference(category.preparationArea, `La categoría “${category.name}”`);
      const existing = storedBefore.find((item) => normalizeRestaurantCatalogLabel(item.name).key === normalizeRestaurantCatalogLabel(category.name).key);
      if (existing) await tx.category.update({ where: { id: existing.id }, data: { name: category.name, active: true, detectedAreaKey: reference.key, preparationAreaId: reference.areaId } });
      else await tx.category.create({ data: { tenantId, branchId, name: category.name, detectedAreaKey: reference.key, preparationAreaId: reference.areaId } });
    });

    const storedCategories = await tx.category.findMany({ where: { tenantId, branchId, active: true }, select: { id: true, name: true } });
    const categoryIds = new Map(storedCategories.map((category) => [normalizeRestaurantCatalogLabel(category.name).key, category.id]));
    const storedProducts = await tx.product.findMany({ where: { tenantId, branchId }, select: { id: true, name: true } });
    await runInBatches(products, async (product) => {
      const categoryId = categoryIds.get(normalizeRestaurantCatalogLabel(product.category).key);
      if (!categoryId) throw new AppError("CATALOG_CATEGORY_UNRESOLVED", 409, `No se pudo resolver la categoría “${product.category}”.`);
      const reference = product.areaAssignmentMode === "INHERIT_FROM_PRODUCT" ? { key: null, areaId: null } : areaReference(product.preparationArea, `“${product.name}”`, product.productType !== "ADDON" || !product.preparationArea.trim());
      const data = { categoryId, description: product.description || null, priceCents: Math.round(product.price * 100), costCents: Math.round(product.cost * 100), productType: product.productType, areaAssignmentMode: product.areaAssignmentMode, detectedAreaKey: reference.key, preparationAreaId: reference.areaId, active: true };
      const existing = storedProducts.find((item) => normalizeRestaurantCatalogLabel(item.name).key === normalizeRestaurantCatalogLabel(product.name).key);
      if (existing) await tx.product.update({ where: { id: existing.id }, data: { ...data, name: normalizeRestaurantCatalogLabel(product.name).name } });
      else await tx.product.create({ data: { tenantId, branchId, name: normalizeRestaurantCatalogLabel(product.name).name, ...data } });
    });
  }, { maxWait: 10_000, timeout: 60_000 });
  return detectedAreasForCatalog(input);
}

async function resolveCatalogPreparationAreas(tenantId: string, branchId: string, areaIds: Map<string, { id: string }>) {
  const categories = await prisma.category.findMany({ where: { tenantId, branchId, detectedAreaKey: { not: null } }, select: { id: true, detectedAreaKey: true } });
  const products = await prisma.product.findMany({ where: { tenantId, branchId, detectedAreaKey: { not: null }, areaAssignmentMode: "SPECIFIC_AREA" }, select: { id: true, detectedAreaKey: true } });
  await runInBatches(categories, (category) => prisma.category.update({ where: { id: category.id }, data: { preparationAreaId: category.detectedAreaKey ? areaIds.get(category.detectedAreaKey)?.id ?? null : null } }));
  await runInBatches(products, (product) => prisma.product.update({ where: { id: product.id }, data: { preparationAreaId: product.detectedAreaKey ? areaIds.get(product.detectedAreaKey)?.id ?? null : null } }));
  return {
    categories: categories.filter((item) => !item.detectedAreaKey || !areaIds.has(item.detectedAreaKey)).length,
    products: products.filter((item) => !item.detectedAreaKey || !areaIds.has(item.detectedAreaKey)).length,
  };
}

async function markStep(tenantId: string, step: StepKey, nextStep: StepKey, session: AuthSession, snapshot: unknown, ready = false) {
  const current = await prisma.businessSetup.findUnique({ where: { tenantId } });
  const completed = new Set(parseStringArray(current?.completedSteps));
  completed.add(step);
  const data = { ...parseObject(current?.data), [step]: snapshot };
  return prisma.businessSetup.upsert({
    where: { tenantId },
    create: { tenantId, status: ready ? "READY" : "DRAFT", currentStep: nextStep, completedSteps: JSON.stringify([...completed]), data: JSON.stringify(data), updatedById: session.userId, completedAt: ready ? new Date() : null },
    update: { status: ready ? "READY" : "DRAFT", currentStep: nextStep, completedSteps: JSON.stringify([...completed]), data: JSON.stringify(data), updatedById: session.userId, completedAt: ready ? new Date() : null },
  });
}

async function saveDraft(tenantId: string, step: StepKey, session: AuthSession, snapshot: unknown) {
  const current = await prisma.businessSetup.findUnique({ where: { tenantId } });
  const data = { ...parseObject(current?.data), [step]: snapshot };
  return prisma.businessSetup.upsert({
    where: { tenantId },
    create: { tenantId, currentStep: step, data: JSON.stringify(data), updatedById: session.userId },
    update: { currentStep: step, data: JSON.stringify(data), updatedById: session.userId },
  });
}

export async function initializeBusinessSetup(tenantId: string, branchId: string, tenantType: "RESTAURANT" | "BARBERSHOP" | "TRANSPORT", templateKey: string | undefined, actorId: string) {
  const template = setupTemplates.find((item) => item.key === templateKey && item.type === tenantType) ?? setupTemplates.find((item) => item.type === tenantType)!;
  await prisma.$transaction(async (tx) => {
    await tx.tenant.update({ where: { id: tenantId }, data: { enabledModules: JSON.stringify(template.modules) } });
    // En Restaurante la plantilla propone roles, áreas y ambientes dentro del
    // asistente. No crea entidades operativas antes de que el administrador las confirme.
    if (tenantType !== "RESTAURANT") {
      for (const key of template.roles) await tx.role.upsert({ where: { tenantId_key: { tenantId, key } }, create: { tenantId, key, name: roleName(key), permissions: JSON.stringify(defaultPermissions[key] ?? []) }, update: {} });
      if (template.diningArea) await tx.diningArea.upsert({ where: { tenantId_branchId_name: { tenantId, branchId, name: template.diningArea } }, create: { tenantId, branchId, name: template.diningArea }, update: { active: true } });
    }
    if (tenantType === "RESTAURANT") {
      await tx.restaurantPrintSettings.upsert({ where: { branchId }, create: { tenantId, branchId, mode: "SIMPLE", automatic: true }, update: {} });
      await tx.restaurantConfiguration.upsert({ where: { tenantId }, create: { tenantId, settings: JSON.stringify(defaultRestaurantConfiguration) }, update: {} });
    }
    if (tenantType === "TRANSPORT") await tx.transportConfiguration.upsert({ where: { tenantId }, create: { tenantId, settings: JSON.stringify(defaultTransportConfiguration) }, update: {} });
    const preparationAreas = template.preparationAreas.flatMap((name) => { const normalized = normalizeRestaurantArea(name); return normalized ? [{ name: normalized.name, normalizedKey: normalized.key, type: normalized.type, source: "TEMPLATE", dispatchMode: "KDS", enabled: true }] : []; });
    await tx.businessSetup.create({ data: { tenantId, templateKey: template.key, currentStep: "BUSINESS", completedSteps: JSON.stringify(["MODULES"]), data: JSON.stringify({ MODULES: { enabledModules: template.modules }, ...(tenantType === "RESTAURANT" ? { OPERATIONS: { preparationAreas }, TABLES: { zones: template.diningArea ? [{ name: template.diningArea, prefix: "Mesa", count: 10, seats: 4 }] : [] } } : {}) }), updatedById: actorId } });
  });
  return template;
}

export async function saveBusinessSetupStep(tenantId: string, raw: unknown, session: AuthSession) {
  const draft = z.object({ step: z.enum(["BUSINESS", "MODULES", "CATALOG", "TEAM", "OPERATIONS", "TABLES", "PRINTING", "RESTAURANT_OPERATION", "RESTAURANT_KITCHEN", "RESTAURANT_SALES", "RESTAURANT_CONTROL", "RESTAURANT_INTEGRATIONS", "TRANSPORT_OPERATION", "TRANSPORT_CUSTOMERS", "TRANSPORT_FLEET", "TRANSPORT_DRIVERS", "TRANSPORT_RULES", "TRANSPORT_FINANCE", "TRANSPORT_MAINTENANCE", "TRANSPORT_SAFETY", "TRANSPORT_INTEGRATIONS", "REVIEW"]), draft: z.literal(true) }).passthrough().safeParse(raw);
  if (draft.success) {
    if (JSON.stringify(raw).length > 200_000) throw new AppError("VALIDATION_ERROR", 400, "El borrador supera el tamaño permitido.");
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, include: { branches: { where: { active: true }, orderBy: { createdAt: "asc" }, take: 1 } } });
    if (!tenant) throw new AppError("TENANT_NOT_FOUND", 404, "El negocio no existe.");
    const branch = tenant.branches[0];
    if (!branch) throw new AppError("BRANCH_NOT_FOUND", 409, "El negocio necesita una sede activa.");
    const setup = await saveDraft(tenantId, draft.data.step, session, raw);
    await prisma.auditLog.create({ data: { tenantId, branchId: branch.id, userId: session.userId, action: "PLATFORM_SETUP_DRAFT", entityType: "BusinessSetup", entityId: setup.id, metadata: JSON.stringify({ step: draft.data.step }) } });
    return { ok: true, step: draft.data.step, credentials: [], printerTokens: [], draft: true, message: "Borrador guardado. Puedes continuar la implementación cuando quieras." };
  }
  const parsed = setupStepSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
    const isCatalog = raw && typeof raw === "object" && "step" in raw && raw.step === "CATALOG";
    const first = issues[0];
    throw new AppError("VALIDATION_ERROR", 400, isCatalog
      ? `No se pudo guardar la carta: ${issues.length} dato${issues.length === 1 ? " necesita" : "s necesitan"} revisión${first ? ` (${first.path}: ${first.message})` : ""}.`
      : "Revisa la información de este paso.", { issues });
  }
  const input = parsed.data;
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, include: { branches: { where: { active: true }, orderBy: { createdAt: "asc" }, take: 1 }, setup: true } });
  if (!tenant) throw new AppError("TENANT_NOT_FOUND", 404, "El negocio no existe.");
  const branch = tenant.branches[0];
  if (!branch) throw new AppError("BRANCH_NOT_FOUND", 409, "El negocio necesita una sede activa.");
  const credentials: Array<{ name: string; email: string; password: string }> = [];
  const printerTokens: Array<{ name: string; token: string }> = [];
  let completionMessage = "Paso guardado correctamente. Puedes continuar ahora o retomarlo después.";

  if (input.step === "BUSINESS") {
    await prisma.$transaction([prisma.tenant.update({ where: { id: tenantId }, data: { name: input.name, shortName: input.shortName, email: input.email || null, phone: input.phone || null, address: input.address || null, country: input.country, currency: input.currency, timezone: input.timezone } }), prisma.branch.update({ where: { id: branch.id }, data: { name: input.branchName, address: input.address || null, phone: input.phone || null } })]);
    await markStep(tenantId, input.step, "MODULES", session, input);
  } else if (input.step === "MODULES") {
    const allowed = new Set(moduleKeys[tenant.type as keyof typeof moduleKeys] ?? []);
    const enabled = [...new Set(input.enabledModules.filter((item) => allowed.has(item as never)))];
    if (!enabled.includes("dashboard")) enabled.unshift("dashboard");
    if (!enabled.includes("settings")) enabled.push("settings");
    await prisma.tenant.update({ where: { id: tenantId }, data: { enabledModules: JSON.stringify(enabled) } });
    await markStep(tenantId, input.step, tenant.type === "TRANSPORT" ? "TRANSPORT_OPERATION" : tenant.type === "RESTAURANT" ? "RESTAURANT_OPERATION" : "CATALOG", session, { enabledModules: enabled });
  } else if (input.step === "CATALOG") {
    let detectedAreas: DetectedRestaurantArea[] = [];
    if (!input.skip && tenant.type === "RESTAURANT") {
      detectedAreas = await persistRestaurantCatalog(tenantId, branch.id, input);
    } else if (!input.skip && tenant.type === "BARBERSHOP") {
      for (const service of input.services) await prisma.service.upsert({ where: { tenantId_branchId_name: { tenantId, branchId: branch.id, name: service.name } }, create: { tenantId, branchId: branch.id, name: service.name, category: service.category || null, durationMinutes: service.durationMinutes, priceCents: Math.round(service.price * 100) }, update: { category: service.category || null, durationMinutes: service.durationMinutes, priceCents: Math.round(service.price * 100), active: true } });
    }
    await markStep(tenantId, input.step, "TEAM", session, tenant.type === "RESTAURANT" ? { ...input, detectedAreas } : input);
  } else if (input.step === "TEAM") {
    await prisma.$transaction(async (tx) => {
      for (const role of input.roles) await tx.role.upsert({ where: { tenantId_key: { tenantId, key: role.key } }, create: { tenantId, key: role.key, name: role.name, permissions: JSON.stringify(role.permissions) }, update: { name: role.name, permissions: JSON.stringify(role.permissions) } });
      for (const person of input.users) {
        const role = await tx.role.findUnique({ where: { tenantId_key: { tenantId, key: person.roleKey } } });
        if (!role) throw new AppError("ROLE_NOT_FOUND", 409, `El rol ${person.roleKey} no está configurado.`);
        let user = await tx.user.findFirst({ where: { email: person.email, platformRole: null } });
        const generated = person.password || `Movendi-${randomBytes(6).toString("base64url")}!`;
        const isNewUser = !user;
        if (!user) user = await tx.user.create({ data: { name: person.name, email: person.email, passwordHash: await hash(generated, 12), mustChangePassword: true } });
        await tx.membership.upsert({ where: { tenantId_userId: { tenantId, userId: user.id } }, create: { tenantId, userId: user.id, roleId: role.id, branchId: branch.id }, update: { roleId: role.id, branchId: branch.id, active: true } });
        if (isNewUser) credentials.push({ name: person.name, email: person.email, password: generated });
      }
    });
    await markStep(tenantId, input.step, tenant.type === "TRANSPORT" ? "TRANSPORT_RULES" : tenant.type === "RESTAURANT" ? "TABLES" : "OPERATIONS", session, { roles: input.roles, users: input.users.map((person) => ({ name: person.name, email: person.email, roleKey: person.roleKey })) });
  } else if (input.step === "OPERATIONS") {
    let unresolved = { categories: 0, products: 0 };
    if (tenant.type === "RESTAURANT") {
      const enabledAreaKeys = new Set((input.preparationAreas as PreparationAreaInput[]).filter((area) => area.enabled !== false).map((area) => normalizeRestaurantArea(area.name)?.key).filter((key): key is string => Boolean(key)));
      if (!enabledAreaKeys.size) throw new AppError("PREPARATION_AREA_REQUIRED", 409, "Confirma al menos un área operativa antes de configurar la carta.");
      const areas = await reconcilePreparationAreas(tenantId, branch.id, input.preparationAreas as PreparationAreaInput[]);
      unresolved = await resolveCatalogPreparationAreas(tenantId, branch.id, areas);
      if (unresolved.categories || unresolved.products) completionMessage = `La operación se guardó, pero quedaron rutas pendientes en ${unresolved.categories} categoría${unresolved.categories === 1 ? "" : "s"} y ${unresolved.products} producto${unresolved.products === 1 ? "" : "s"}. Confirma el área descartada o reasigna la carta antes de finalizar.`;
    }
    await prisma.tenant.update({ where: { id: tenantId }, data: { paymentMethods: JSON.stringify(input.paymentMethods), businessHours: JSON.stringify(input.hours) } });
    await markStep(tenantId, input.step, tenant.type === "RESTAURANT" ? "CATALOG" : "REVIEW", session, { ...input, unresolved });
  } else if (input.step.startsWith("RESTAURANT_")) {
    if (tenant.type !== "RESTAURANT") throw new AppError("INVALID_SETUP_STEP", 400, "Este paso solo corresponde a restaurantes.");
    const restaurantInput = input as { step: string; sections: Record<string, unknown>; masterData?: unknown };
    const routing: Record<string, { sections: RestaurantConfigurationSection[]; next: StepKey }> = {
      RESTAURANT_OPERATION: { sections: ["general", "orders", "delivery"], next: "OPERATIONS" },
      RESTAURANT_KITCHEN: { sections: ["kitchen"], next: "RESTAURANT_SALES" },
      RESTAURANT_SALES: { sections: ["sales", "promotions"], next: "RESTAURANT_CONTROL" },
      RESTAURANT_CONTROL: { sections: ["floor", "menu", "customers", "inventory", "notifications", "reports"], next: "PRINTING" },
      RESTAURANT_INTEGRATIONS: { sections: ["integrations"], next: "REVIEW" },
    };
    const route = routing[restaurantInput.step];
    if (!route) throw new AppError("INVALID_SETUP_STEP", 400, "Paso de Restaurante no reconocido.");
    for (const section of route.sections) {
      if (!(section in restaurantInput.sections)) throw new AppError("VALIDATION_ERROR", 400, `Falta la configuración ${section}.`);
      await saveRestaurantConfigurationSection(tenantId, section, restaurantInput.sections[section], { tenantId, branchId: branch.id, actorId: session.userId, permissions: session.permissions });
    }
    if (restaurantInput.step === "RESTAURANT_SALES" && restaurantInput.masterData) await persistRestaurantSalesMasterData(tenantId, branch.id, restaurantInput.masterData);
    if (restaurantInput.step === "RESTAURANT_CONTROL" && restaurantInput.masterData) await persistRestaurantControlMasterData(tenantId, branch.id, session.userId, restaurantInput.masterData);
    await markStep(tenantId, input.step, route.next, session, input);
  } else if (input.step.startsWith("TRANSPORT_")) {
    if (tenant.type !== "TRANSPORT") throw new AppError("INVALID_SETUP_STEP", 400, "Este paso solo corresponde a empresas de Transporte.");
    const transportInput = input as { step: string; sections: Record<string, unknown> };
    const routing: Record<string, { sections: TransportConfigurationSection[]; next: StepKey }> = {
      TRANSPORT_OPERATION: { sections: ["general", "operations"], next: "TRANSPORT_CUSTOMERS" },
      TRANSPORT_CUSTOMERS: { sections: ["customers"], next: "TRANSPORT_FLEET" },
      TRANSPORT_FLEET: { sections: ["fleet"], next: "TRANSPORT_DRIVERS" },
      TRANSPORT_DRIVERS: { sections: ["drivers", "documents"], next: "TEAM" },
      TRANSPORT_RULES: { sections: ["notifications"], next: "TRANSPORT_FINANCE" },
      TRANSPORT_FINANCE: { sections: ["finance"], next: "TRANSPORT_MAINTENANCE" },
      TRANSPORT_MAINTENANCE: { sections: ["maintenance", "modules"], next: "TRANSPORT_SAFETY" },
      TRANSPORT_SAFETY: { sections: ["safety"], next: "TRANSPORT_INTEGRATIONS" },
      TRANSPORT_INTEGRATIONS: { sections: ["integrations"], next: "REVIEW" },
    };
    const route = routing[transportInput.step];
    if (!route) throw new AppError("INVALID_SETUP_STEP", 400, "Paso de Transporte no reconocido.");
    for (const section of route.sections) {
      if (!(section in transportInput.sections)) throw new AppError("VALIDATION_ERROR", 400, `Falta la configuración ${section}.`);
      await saveTransportConfigurationSection(tenantId, section, transportInput.sections[section]);
    }
    await markStep(tenantId, input.step, route.next, session, input);
  } else if (input.step === "TABLES") {
    if (!input.skip && tenant.type === "RESTAURANT") for (const zone of input.zones) { const area = await prisma.diningArea.upsert({ where: { tenantId_branchId_name: { tenantId, branchId: branch.id, name: zone.name } }, create: { tenantId, branchId: branch.id, name: zone.name }, update: { active: true } }); for (let index = 1; index <= zone.count; index += 1) { const name = `${zone.prefix} ${index}`; await prisma.diningTable.upsert({ where: { tenantId_branchId_name: { tenantId, branchId: branch.id, name } }, create: { tenantId, branchId: branch.id, areaId: area.id, name, seats: zone.seats }, update: { areaId: area.id, seats: zone.seats, active: true } }); } }
    await markStep(tenantId, input.step, tenant.type === "RESTAURANT" ? "RESTAURANT_KITCHEN" : "PRINTING", session, input);
  } else if (input.step === "PRINTING") {
    if (!input.skip && tenant.type === "RESTAURANT") {
      const areasByKey = await existingPreparationAreasByKey(tenantId, branch.id);
      const printerAreas = new Set(input.printers.flatMap((printer) => printer.areas).map((name) => normalizeRestaurantArea(name)?.key).filter(Boolean));
      const missingPrinter = input.areaDestinations.filter((destination) => destination.dispatchMode === "PRINTER" && !printerAreas.has(normalizeRestaurantArea(destination.areaName)?.key));
      if (missingPrinter.length) throw new AppError("PRINT_DESTINATION_MISSING", 409, `Asigna una impresora a: ${missingPrinter.map((item) => item.areaName).join(", ")}.`);
      for (const destination of input.areaDestinations) {
        const normalized = normalizeRestaurantArea(destination.areaName);
        const area = normalized ? areasByKey.get(normalized.key) : null;
        if (!area) throw new AppError("PREPARATION_AREA_UNRESOLVED", 409, `El área “${destination.areaName}” todavía no existe. Confírmala primero en Operación.`);
        await prisma.preparationArea.update({ where: { id: area.id }, data: { dispatchMode: destination.dispatchMode } });
      }
      let defaultPrinterId: string | null = null;
      for (const item of input.printers) {
        const token = randomBytes(32).toString("base64url");
        const tokenHash = createHash("sha256").update(token).digest("hex");
        const tokenHint = token.slice(-6);
        const printer = await prisma.printDevice.upsert({
          where: { tenantId_branchId_name: { tenantId, branchId: branch.id, name: item.name } },
          create: { tenantId, branchId: branch.id, name: item.name, connectionType: item.connectionType, paperWidthMm: item.paperWidthMm, automatic: input.automatic, tokenHash: item.connectionType === "LOCAL_AGENT" ? tokenHash : null, tokenHint: item.connectionType === "LOCAL_AGENT" ? tokenHint : null },
          update: { connectionType: item.connectionType, paperWidthMm: item.paperWidthMm, automatic: input.automatic, active: true, tokenHash: item.connectionType === "LOCAL_AGENT" ? tokenHash : null, tokenHint: item.connectionType === "LOCAL_AGENT" ? tokenHint : null },
        });
        defaultPrinterId ??= printer.id;
        if (printer.connectionType === "LOCAL_AGENT") printerTokens.push({ name: printer.name, token });
        for (const areaName of item.areas) {
          const normalized = normalizeRestaurantArea(areaName);
          const area = normalized ? areasByKey.get(normalized.key) : null;
          if (!area) throw new AppError("PREPARATION_AREA_UNRESOLVED", 409, `El área “${areaName}” todavía no existe. Confírmala primero en Operación.`);
          await prisma.preparationAreaPrinter.upsert({ where: { areaId_printerId: { areaId: area.id, printerId: printer.id } }, create: { tenantId, branchId: branch.id, areaId: area.id, printerId: printer.id, copies: item.copies }, update: { copies: item.copies, active: true } });
        }
      }
      await prisma.restaurantPrintSettings.upsert({ where: { branchId: branch.id }, create: { tenantId, branchId: branch.id, mode: input.mode, automatic: input.automatic, defaultPrinterId }, update: { mode: input.mode, automatic: input.automatic, defaultPrinterId } });
    }
    await markStep(tenantId, input.step, tenant.type === "RESTAURANT" ? "RESTAURANT_INTEGRATIONS" : "REVIEW", session, input);
  } else {
    const setup = await prisma.businessSetup.findUnique({ where: { tenantId } });
    const required = tenant.type === "RESTAURANT" ? ["BUSINESS", "MODULES", "RESTAURANT_OPERATION", "CATALOG", "TABLES", "RESTAURANT_KITCHEN", "OPERATIONS", "TEAM", "RESTAURANT_SALES", "RESTAURANT_CONTROL", "PRINTING", "RESTAURANT_INTEGRATIONS"] : tenant.type === "TRANSPORT" ? ["BUSINESS", "MODULES", "TRANSPORT_OPERATION", "TRANSPORT_CUSTOMERS", "TRANSPORT_FLEET", "TRANSPORT_DRIVERS", "TEAM", "TRANSPORT_RULES", "TRANSPORT_FINANCE", "TRANSPORT_MAINTENANCE", "TRANSPORT_SAFETY", "TRANSPORT_INTEGRATIONS"] : ["BUSINESS", "MODULES", "CATALOG", "TEAM", "OPERATIONS"];
    const completed = new Set(parseStringArray(setup?.completedSteps));
    const missing = required.filter((step) => !completed.has(step));
    if (missing.length) throw new AppError("SETUP_INCOMPLETE", 409, "Completa o marca como omitidos los pasos pendientes antes de finalizar.", { missing });
    if (tenant.type === "RESTAURANT") {
      const [unresolvedCategories, unresolvedProducts] = await Promise.all([
        prisma.category.count({ where: { tenantId, branchId: branch.id, active: true, detectedAreaKey: { not: null }, preparationAreaId: null } }),
        prisma.product.count({ where: { tenantId, branchId: branch.id, active: true, detectedAreaKey: { not: null }, preparationAreaId: null, areaAssignmentMode: "SPECIFIC_AREA" } }),
      ]);
      if (unresolvedCategories || unresolvedProducts) throw new AppError("PREPARATION_AREAS_PENDING", 409, `No se puede finalizar: quedaron rutas pendientes en ${unresolvedCategories} categoría${unresolvedCategories === 1 ? "" : "s"} y ${unresolvedProducts} producto${unresolvedProducts === 1 ? "" : "s"}. Confirma las áreas en Operación o revisa la carta.`, { unresolvedCategories, unresolvedProducts, actions: ["REVIEW_PRODUCTS", "CONFIRM_AREAS"] });
      const readiness = await getRestaurantReadiness({ tenantId, branchId: branch.id });
      if (!readiness.ready) throw new AppError("RESTAURANT_NOT_READY", 409, "El restaurante todavía tiene configuraciones operativas obligatorias pendientes.", { score: readiness.score, blockers: readiness.blockers });
    }
    await markStep(tenantId, input.step, "REVIEW", session, input, true);
  }

  await prisma.auditLog.create({ data: { tenantId, branchId: branch.id, userId: session.userId, action: input.step === "REVIEW" ? "PLATFORM_SETUP_COMPLETE" : "PLATFORM_SETUP_STEP", entityType: "BusinessSetup", entityId: tenant.setup?.id, metadata: JSON.stringify({ step: input.step }) } });
  return { ok: true, step: input.step, credentials, printerTokens, message: input.step === "REVIEW" ? "Negocio marcado como listo para operar." : completionMessage };
}
