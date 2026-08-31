"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Circle, Copy, Plus, Rocket, Save, Trash2, WandSparkles } from "lucide-react";
import { Button, Dialog, Field, Input, Select, StatusBadge } from "@/shared/components/ui";
import type { PlatformBusinessView, PlatformPlanView, PlatformSetupTemplate } from "../types";
import { detectRestaurantAreas, normalizeRestaurantArea, normalizeRestaurantCatalogLabel, type DetectedRestaurantArea, type RestaurantAreaAssignmentMode, type RestaurantAreaDispatchMode, type RestaurantConfiguration, type TransportConfiguration } from "@movendi/contracts";
import { TransportWizardStep } from "./TransportSetupSteps";
import { RestaurantWizardStep, type RestaurantSetupStep } from "./RestaurantSetupSteps";

type BusinessType = PlatformBusinessView["type"];
type StepKey = "BUSINESS" | "MODULES" | "CATALOG" | "TEAM" | "OPERATIONS" | "TABLES" | "PRINTING" | "RESTAURANT_OPERATION" | "RESTAURANT_KITCHEN" | "RESTAURANT_SALES" | "RESTAURANT_CONTROL" | "RESTAURANT_INTEGRATIONS" | "TRANSPORT_OPERATION" | "TRANSPORT_CUSTOMERS" | "TRANSPORT_FLEET" | "TRANSPORT_DRIVERS" | "TRANSPORT_RULES" | "TRANSPORT_FINANCE" | "TRANSPORT_MAINTENANCE" | "TRANSPORT_SAFETY" | "TRANSPORT_INTEGRATIONS" | "REVIEW";
type LocalBusiness = Pick<PlatformBusinessView, "id" | "slug" | "name" | "shortName" | "type" | "country" | "currency" | "timezone" | "email" | "phone" | "address" | "branchName" | "enabledModules" | "setup">;
type GeneralDraft = { name: string; shortName: string; branchName: string; email: string; phone: string; address: string; country: string; currency: string; timezone: string };
type CatalogDraft = { skip: boolean; categories: Array<{ name: string; preparationArea: string }>; products: Array<{ name: string; category: string; description: string; price: number; cost: number; preparationArea: string }>; addons: Array<{ name: string; price: number; cost: number; preparationArea: string; areaAssignmentMode: RestaurantAreaAssignmentMode }>; services: Array<{ name: string; category: string; durationMinutes: number; price: number }> };
type TeamDraft = { roles: Array<{ key: string; name: string; permissions: string[] }>; users: Array<{ name: string; email: string; roleKey: string; password: string }> };
type PreparationAreaDraft = { name: string; normalizedKey: string; type: string; source: string; dispatchMode: RestaurantAreaDispatchMode; enabled: boolean };
type OperationsDraft = { preparationAreas: Array<string | PreparationAreaDraft>; paymentMethods: string[]; hours: Array<{ weekday: number; open: string; close: string; closed: boolean }> };
type TablesDraft = { skip: boolean; zones: Array<{ name: string; prefix: string; count: number; seats: number }> };
type PrintingDraft = { skip: boolean; mode: "SIMPLE" | "ADVANCED"; automatic: boolean; areaDestinations: Array<{ areaName: string; dispatchMode: RestaurantAreaDispatchMode }>; printers: Array<{ name: string; connectionType: "LOCAL_AGENT" | "BROWSER"; paperWidthMm: 58 | 80; copies: number; areas: string[] }> };

function preparationAreaDraft(value: string | PreparationAreaDraft): PreparationAreaDraft | null {
  if (typeof value !== "string") return value;
  const normalized = normalizeRestaurantArea(value);
  return normalized ? { name: normalized.name, normalizedKey: normalized.key, type: normalized.type, source: "ONBOARDING", dispatchMode: "KDS", enabled: true } : null;
}

function savedStep<T extends object>(business: PlatformBusinessView | undefined, step: StepKey): Partial<T> {
  const value = business?.setup.data?.[step];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Partial<T> : {};
}

const allSteps: Array<{ key: StepKey; label: string; help: string }> = [
  { key: "BUSINESS", label: "Negocio y sede", help: "Datos generales y ubicación" },
  { key: "MODULES", label: "Módulos", help: "Qué utilizará el cliente" },
  { key: "CATALOG", label: "Oferta y precios", help: "Carta, productos o servicios" },
  { key: "TEAM", label: "Equipo", help: "Usuarios y roles" },
  { key: "OPERATIONS", label: "Operación", help: "Áreas, horarios y pagos" },
  { key: "TABLES", label: "Mesas y zonas", help: "Distribución del salón" },
  { key: "PRINTING", label: "Impresión", help: "Comandas por estación" },
  { key: "REVIEW", label: "Revisión", help: "Listo para operar" },
];

const transportSteps: Array<{ key: StepKey; label: string; help: string }> = [
  { key: "BUSINESS", label: "Empresa y sede", help: "Identidad, formatos y ubicación" },
  { key: "MODULES", label: "Módulos", help: "Capacidades que utilizará" },
  { key: "TRANSPORT_OPERATION", label: "Operación", help: "Servicios, estados y numeración" },
  { key: "TRANSPORT_CUSTOMERS", label: "Clientes", help: "Cuentas, plantas y destinos" },
  { key: "TRANSPORT_FLEET", label: "Flota", help: "Unidades, carretas y ensambles" },
  { key: "TRANSPORT_DRIVERS", label: "Conductores", help: "Tipos, licencias y documentos" },
  { key: "TEAM", label: "Usuarios y roles", help: "Permisos granulares" },
  { key: "TRANSPORT_RULES", label: "Reglas operativas", help: "Alertas y responsables" },
  { key: "TRANSPORT_FINANCE", label: "Gastos", help: "Límites, adelantos y aprobación" },
  { key: "TRANSPORT_MAINTENANCE", label: "Mantenimiento", help: "Prevención y módulos auxiliares" },
  { key: "TRANSPORT_SAFETY", label: "Seguridad", help: "Velocidad, descansos e incidencias" },
  { key: "TRANSPORT_INTEGRATIONS", label: "Integraciones", help: "GPS, SAP, GRE y mapas" },
  { key: "REVIEW", label: "Validación final", help: "Listo para operar" },
];

const restaurantSteps: Array<{ key: StepKey; label: string; help: string }> = [
  { key: "BUSINESS", label: "Empresa y sede", help: "Identidad, ubicación y formatos" },
  { key: "MODULES", label: "Módulos", help: "Capacidades que utilizará" },
  { key: "RESTAURANT_OPERATION", label: "Operación", help: "Pedidos, delivery y numeración" },
  { key: "OPERATIONS", label: "Áreas y horarios", help: "Estaciones, horarios y pagos" },
  { key: "CATALOG", label: "Carta", help: "Categorías, productos y costos" },
  { key: "TEAM", label: "Usuarios y roles", help: "Permisos y roles sugeridos" },
  { key: "TABLES", label: "Salón", help: "Ambientes, mesas y capacidad" },
  { key: "RESTAURANT_KITCHEN", label: "Cocina", help: "Comandas, estados y tiempos" },
  { key: "RESTAURANT_SALES", label: "Caja y promociones", help: "Cobros, límites y descuentos" },
  { key: "RESTAURANT_CONTROL", label: "Reglas por módulo", help: "Clientes, inventario y alertas" },
  { key: "PRINTING", label: "Impresión", help: "Comandas por estación" },
  { key: "RESTAURANT_INTEGRATIONS", label: "Integraciones", help: "SUNAT, delivery y contabilidad" },
  { key: "REVIEW", label: "Validación final", help: "Listo para operar" },
];

const modulesByType: Record<BusinessType, Array<{ key: string; label: string; required?: boolean }>> = {
  RESTAURANT: [
    { key: "dashboard", label: "Resumen", required: true }, { key: "floor", label: "Salón y mesas" }, { key: "orders", label: "Pedidos" }, { key: "kitchen", label: "Cocina" }, { key: "clients", label: "Clientes" }, { key: "menu", label: "Carta" }, { key: "inventory", label: "Inventario" }, { key: "promotions", label: "Promociones" }, { key: "checkout", label: "Caja y ventas" }, { key: "reports", label: "Reportes" }, { key: "settings", label: "Configuración", required: true },
  ],
  BARBERSHOP: [
    { key: "dashboard", label: "Resumen", required: true }, { key: "appointments", label: "Agenda" }, { key: "clients", label: "Clientes" }, { key: "team", label: "Equipo" }, { key: "services", label: "Servicios" }, { key: "inventory", label: "Inventario" }, { key: "checkout", label: "Caja y ventas" }, { key: "settings", label: "Configuración", required: true },
  ],
  TRANSPORT: [
    { key: "dashboard", label: "Centro operativo", required: true }, { key: "operations", label: "Operaciones" }, { key: "fleet", label: "Flota" }, { key: "drivers", label: "Conductores" }, { key: "documents", label: "Documentos" }, { key: "finance", label: "Finanzas" }, { key: "fuel", label: "Combustible" }, { key: "maintenance", label: "Mantenimiento" }, { key: "inventory", label: "Inventario" }, { key: "tires", label: "Neumáticos" }, { key: "reports", label: "Reportes" }, { key: "settings", label: "Configuración", required: true },
  ],
};

const rolesByType: Record<BusinessType, Array<{ key: string; label: string }>> = {
  RESTAURANT: [{ key: "WAITER", label: "Mesero" }, { key: "KITCHEN", label: "Cocina" }, { key: "CASHIER", label: "Caja" }, { key: "MANAGER", label: "Administrador de local" }],
  BARBERSHOP: [{ key: "RECEPTION", label: "Recepción" }, { key: "PROFESSIONAL", label: "Profesional" }, { key: "CASHIER", label: "Caja" }],
  TRANSPORT: [{ key: "DISPATCH", label: "Despacho" }, { key: "DRIVER_MANAGER", label: "Coordinación de conductores" }, { key: "FINANCE", label: "Finanzas" }],
};

const weekdayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const nextStep: Partial<Record<StepKey, StepKey>> = { BUSINESS: "MODULES", MODULES: "CATALOG", CATALOG: "TEAM", TEAM: "OPERATIONS", OPERATIONS: "TABLES", TABLES: "PRINTING", PRINTING: "REVIEW", REVIEW: "REVIEW" };
const transportNextStep: Partial<Record<StepKey, StepKey>> = { BUSINESS: "MODULES", MODULES: "TRANSPORT_OPERATION", TRANSPORT_OPERATION: "TRANSPORT_CUSTOMERS", TRANSPORT_CUSTOMERS: "TRANSPORT_FLEET", TRANSPORT_FLEET: "TRANSPORT_DRIVERS", TRANSPORT_DRIVERS: "TEAM", TEAM: "TRANSPORT_RULES", TRANSPORT_RULES: "TRANSPORT_FINANCE", TRANSPORT_FINANCE: "TRANSPORT_MAINTENANCE", TRANSPORT_MAINTENANCE: "TRANSPORT_SAFETY", TRANSPORT_SAFETY: "TRANSPORT_INTEGRATIONS", TRANSPORT_INTEGRATIONS: "REVIEW", REVIEW: "REVIEW" };
const restaurantNextStep: Partial<Record<StepKey, StepKey>> = { BUSINESS: "MODULES", MODULES: "RESTAURANT_OPERATION", RESTAURANT_OPERATION: "OPERATIONS", OPERATIONS: "CATALOG", CATALOG: "TEAM", TEAM: "TABLES", TABLES: "RESTAURANT_KITCHEN", RESTAURANT_KITCHEN: "RESTAURANT_SALES", RESTAURANT_SALES: "RESTAURANT_CONTROL", RESTAURANT_CONTROL: "PRINTING", PRINTING: "RESTAURANT_INTEGRATIONS", RESTAURANT_INTEGRATIONS: "REVIEW", REVIEW: "REVIEW" };

const transportPermissions = [
  ["dashboard:read", "Ver centro operativo"], ["transport:operations:read", "Ver operaciones"], ["transport:operations:write", "Administrar operaciones"], ["transport:masters:read", "Ver clientes y maestros"], ["transport:masters:write", "Administrar clientes y maestros"], ["transport:fleet:read", "Ver flota"], ["transport:fleet:write", "Administrar flota"], ["transport:drivers:read", "Ver conductores"], ["transport:drivers:write", "Administrar conductores"], ["transport:documents:read", "Ver documentos"], ["transport:documents:write", "Administrar documentos"], ["transport:finance:read", "Ver finanzas"], ["transport:finance:write", "Administrar finanzas"], ["transport:fuel:read", "Ver combustible"], ["transport:fuel:write", "Administrar combustible"], ["transport:maintenance:read", "Ver mantenimiento"], ["transport:maintenance:write", "Administrar mantenimiento"], ["transport:tires:read", "Ver neumáticos"], ["transport:tires:write", "Administrar neumáticos"], ["inventory:read", "Ver inventario"], ["inventory:write", "Administrar inventario"], ["settings:write", "Administrar configuración"],
] as const;

const defaultTransportRoles = [
  { key: "DISPATCH", name: "Despacho", permissions: ["dashboard:read", "transport:operations:read", "transport:operations:write", "transport:masters:read", "transport:fleet:read", "transport:drivers:read"] },
  { key: "DRIVER_MANAGER", name: "Coordinación de conductores", permissions: ["dashboard:read", "transport:drivers:read", "transport:drivers:write", "transport:documents:read", "transport:documents:write"] },
  { key: "FINANCE", name: "Finanzas", permissions: ["dashboard:read", "transport:finance:read", "transport:finance:write", "transport:fuel:read"] },
  { key: "MAINTENANCE", name: "Mantenimiento", permissions: ["dashboard:read", "transport:fleet:read", "transport:maintenance:read", "transport:maintenance:write", "transport:tires:read", "transport:tires:write", "inventory:read", "inventory:write"] },
];

const restaurantPermissions = [
  ["dashboard:read", "Ver resumen"], ["restaurant:floor:read", "Ver salón"], ["restaurant:floor:write", "Administrar salón"], ["restaurant:orders:read", "Ver pedidos"], ["restaurant:orders:write", "Administrar pedidos"], ["restaurant:kitchen:read", "Ver cocina"], ["restaurant:kitchen:write", "Administrar cocina"], ["restaurant:menu:read", "Ver carta"], ["restaurant:menu:write", "Administrar carta"], ["restaurant:promotions:read", "Ver promociones"], ["restaurant:promotions:write", "Administrar promociones"], ["restaurant:promotions:approve", "Aprobar descuentos"], ["restaurant:reports:read", "Ver reportes"], ["restaurant:printing:read", "Ver impresión"], ["restaurant:printing:write", "Administrar impresión"], ["restaurant:configuration:read", "Ver configuración operativa"], ["restaurant:configuration:write", "Administrar configuración operativa"], ["restaurant:sunat:read", "Ver comprobantes SUNAT"], ["restaurant:sunat:write", "Emitir y configurar SUNAT"], ["restaurant:cash:write", "Cobrar y administrar caja"], ["restaurant:cash:approve", "Aprobar retiros y diferencias"], ["customers:read", "Ver clientes"], ["customers:write", "Administrar clientes"], ["inventory:read", "Ver inventario"], ["inventory:write", "Administrar inventario"], ["settings:write", "Administrar usuarios, roles y empresa"],
] as const;

const defaultRestaurantRoles = [
  { key: "WAITER", name: "Mesero", permissions: ["dashboard:read", "restaurant:floor:read", "restaurant:floor:write", "restaurant:orders:read", "restaurant:orders:write", "restaurant:menu:read", "restaurant:promotions:read", "customers:read"] },
  { key: "KITCHEN", name: "Cocina", permissions: ["dashboard:read", "restaurant:kitchen:read", "restaurant:kitchen:write", "restaurant:orders:read"] },
  { key: "CASHIER", name: "Caja", permissions: ["dashboard:read", "restaurant:orders:read", "restaurant:cash:write", "customers:read"] },
  { key: "MANAGER", name: "Administrador de local", permissions: restaurantPermissions.map(([permission]) => permission) },
];

function mergeTransportSetup(template: TransportConfiguration, business?: PlatformBusinessView) {
  const result = structuredClone(template);
  for (const value of Object.values(business?.setup.data ?? {})) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const sections = (value as { sections?: Record<string, unknown> }).sections;
    if (!sections) continue;
    for (const [key, section] of Object.entries(sections)) if (key in result) (result as unknown as Record<string, unknown>)[key] = section;
  }
  return result;
}

function mergeRestaurantSetup(template: RestaurantConfiguration, business?: PlatformBusinessView) {
  const result = structuredClone(template);
  for (const value of Object.values(business?.setup.data ?? {})) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const sections = (value as { sections?: Record<string, unknown> }).sections;
    if (!sections) continue;
    for (const [key, section] of Object.entries(sections)) if (key in result) (result as unknown as Record<string, unknown>)[key] = section;
  }
  return result;
}

function passwordValue() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const values = crypto.getRandomValues(new Uint8Array(10));
  return `Movendi-${[...values].map((value) => alphabet[value % alphabet.length]).join("")}!`;
}

function duplicateLabel(values: string[]) {
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = normalizeRestaurantCatalogLabel(value);
    if (!normalized.key) continue;
    if (seen.has(normalized.key)) return normalized.name;
    seen.add(normalized.key);
  }
  return null;
}

function validateRestaurantOperations(areas: PreparationAreaDraft[], paymentMethods: string[]) {
  const enabled = areas.filter((area) => area.enabled);
  if (!enabled.length) return "Confirma al menos un área operativa antes de continuar.";
  if (enabled.some((area) => area.name.trim().length < 2)) return "Completa el nombre de cada área operativa activa.";
  const normalized = enabled.map((area) => normalizeRestaurantArea(area.name));
  if (normalized.some((area) => !area)) return "Revisa los nombres de las áreas operativas.";
  const keys = normalized.map((area) => area!.key);
  if (new Set(keys).size !== keys.length) return "Hay áreas equivalentes repetidas. Cocina y Cocinas, por ejemplo, representan la misma área.";
  if (!paymentMethods.length) return "Selecciona al menos un método de pago.";
  return "";
}

function validateRestaurantCatalog(catalog: Pick<CatalogDraft, "skip" | "categories" | "products" | "addons">, areas: PreparationAreaDraft[]) {
  if (catalog.skip) return "";
  const activeAreaKeys = new Set(areas.filter((area) => area.enabled).map((area) => normalizeRestaurantArea(area.name)?.key).filter((key): key is string => Boolean(key)));
  if (!activeAreaKeys.size) return "Primero configura y confirma las áreas operativas.";
  const categoryRows = catalog.categories.filter((category) => category.name.trim() || category.preparationArea.trim());
  if (!categoryRows.length) return "Crea al menos una categoría antes de agregar productos.";
  if (categoryRows.some((category) => category.name.trim().length < 2 || !category.preparationArea.trim())) return "Cada categoría debe tener nombre y área operativa.";
  const repeatedCategory = duplicateLabel(categoryRows.map((category) => category.name));
  if (repeatedCategory) return `La categoría “${repeatedCategory}” está repetida.`;
  if (categoryRows.some((category) => !activeAreaKeys.has(normalizeRestaurantArea(category.preparationArea)?.key ?? ""))) return "Una categoría usa un área que ya no está activa. Vuelve a seleccionarla.";
  const categoryKeys = new Set(categoryRows.map((category) => normalizeRestaurantCatalogLabel(category.name).key));
  const productRows = catalog.products.filter((product) => product.name.trim() || product.category.trim() || product.preparationArea.trim());
  if (!productRows.length) return "Agrega al menos un producto o marca que completarás la carta después.";
  if (productRows.some((product) => product.name.trim().length < 2 || !product.category.trim())) return "Cada producto debe tener nombre y categoría.";
  if (productRows.some((product) => !categoryKeys.has(normalizeRestaurantCatalogLabel(product.category).key))) return "Un producto usa una categoría que ya no existe. Vuelve a seleccionarla.";
  if (productRows.some((product) => product.preparationArea && !activeAreaKeys.has(normalizeRestaurantArea(product.preparationArea)?.key ?? ""))) return "Un producto usa un área que ya no está activa. Vuelve a seleccionarla.";
  const addonRows = catalog.addons.filter((addon) => addon.name.trim() || addon.preparationArea.trim());
  if (addonRows.some((addon) => addon.name.trim().length < 2)) return "Completa el nombre de cada adicional agregado.";
  if (addonRows.some((addon) => addon.areaAssignmentMode === "SPECIFIC_AREA" && !activeAreaKeys.has(normalizeRestaurantArea(addon.preparationArea)?.key ?? ""))) return "Cada adicional con destino específico debe seleccionar un área activa.";
  const repeatedItem = duplicateLabel([...productRows.map((product) => product.name), ...addonRows.map((addon) => addon.name)]);
  if (repeatedItem) return `El producto o adicional “${repeatedItem}” está repetido.`;
  return "";
}

export function BusinessSetupWizard({ plans, templates, business, triggerLabel = business ? "Configurar" : "Nuevo negocio" }: { plans: PlatformPlanView[]; templates: PlatformSetupTemplate[]; business?: PlatformBusinessView; triggerLabel?: string }) {
  const generalDraft = savedStep<GeneralDraft>(business, "BUSINESS");
  const modulesDraft = savedStep<{ enabledModules: string[] }>(business, "MODULES");
  const catalogDraft = savedStep<CatalogDraft>(business, "CATALOG");
  const teamDraft = savedStep<TeamDraft>(business, "TEAM");
  const operationsDraft = savedStep<OperationsDraft>(business, "OPERATIONS");
  const tablesDraft = savedStep<TablesDraft>(business, "TABLES");
  const printingDraft = savedStep<PrintingDraft>(business, "PRINTING");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [activeStep, setActiveStep] = useState<StepKey>(business?.setup.currentStep as StepKey || "BUSINESS");
  const [completed, setCompleted] = useState<string[]>(business?.setup.completedSteps ?? []);
  const [current, setCurrent] = useState<LocalBusiness | null>(business ?? null);
  const [created, setCreated] = useState(Boolean(business));
  const [secrets, setSecrets] = useState<Array<{ label: string; value: string }>>([]);
  const defaultType: BusinessType = business?.type ?? "RESTAURANT";
  const initialTemplate = templates.find((item) => item.type === defaultType)?.key ?? "";
  const initialTransportTemplate = templates.find((item) => item.type === "TRANSPORT")?.transportConfiguration;
  const initialRestaurantTemplate = templates.find((item) => item.type === "RESTAURANT")?.restaurantConfiguration;
  const [create, setCreate] = useState({ name: "", shortName: "", slug: "", type: defaultType, planId: plans.find((item) => item.active)?.id ?? "", subscriptionStatus: "TRIAL", branchName: "Sede principal", country: "PE", currency: "PEN", email: "", phone: "", address: "", adminName: "", adminEmail: "", adminPassword: "", templateKey: initialTemplate });
  const [general, setGeneral] = useState({ name: generalDraft.name ?? business?.name ?? "", shortName: generalDraft.shortName ?? business?.shortName ?? "", branchName: generalDraft.branchName ?? business?.branchName ?? "Sede principal", email: generalDraft.email ?? business?.email ?? "", phone: generalDraft.phone ?? business?.phone ?? "", address: generalDraft.address ?? business?.address ?? "", country: generalDraft.country ?? business?.country ?? "PE", currency: generalDraft.currency ?? business?.currency ?? "PEN", timezone: generalDraft.timezone ?? business?.timezone ?? "America/Lima" });
  const selectedTemplate = templates.find((item) => item.key === create.templateKey);
  const [enabledModules, setEnabledModules] = useState<string[]>(modulesDraft.enabledModules?.length ? modulesDraft.enabledModules : business?.enabledModules.length ? business.enabledModules : selectedTemplate?.modules ?? modulesByType[defaultType].map((item) => item.key));
  const [categories, setCategories] = useState(catalogDraft.categories?.length ? catalogDraft.categories : [{ name: "", preparationArea: "" }]);
  const [products, setProducts] = useState(catalogDraft.products?.length ? catalogDraft.products : []);
  const [addons, setAddons] = useState(catalogDraft.addons?.length ? catalogDraft.addons.map((addon) => ({ ...addon, areaAssignmentMode: addon.areaAssignmentMode ?? "INHERIT_FROM_PRODUCT" as RestaurantAreaAssignmentMode })) : []);
  const [services, setServices] = useState(catalogDraft.services?.length ? catalogDraft.services : [{ name: "", category: "", durationMinutes: 30, price: 0 }]);
  const [skipCatalog, setSkipCatalog] = useState(catalogDraft.skip ?? false);
  const [users, setUsers] = useState(teamDraft.users?.length ? teamDraft.users.map((user) => ({ ...user, password: "" })) : [{ name: "", email: "", roleKey: rolesByType[defaultType][0].key, password: "" }]);
  const [transportRoles, setTransportRoles] = useState(teamDraft.roles?.length ? teamDraft.roles : defaultTransportRoles);
  const [restaurantRoles, setRestaurantRoles] = useState(teamDraft.roles?.length ? teamDraft.roles : defaultRestaurantRoles);
  const [restaurantConfiguration, setRestaurantConfiguration] = useState<RestaurantConfiguration>(() => {
    if (!initialRestaurantTemplate) throw new Error("La plantilla de Restaurante no incluye configuración inicial.");
    return mergeRestaurantSetup(initialRestaurantTemplate, business);
  });
  const [transportConfiguration, setTransportConfiguration] = useState<TransportConfiguration>(() => {
    if (!initialTransportTemplate) throw new Error("La plantilla de Transporte no incluye configuración inicial.");
    return mergeTransportSetup(initialTransportTemplate, business);
  });
  const [preparationAreas, setPreparationAreas] = useState<PreparationAreaDraft[]>(() => {
    const savedAreas = (operationsDraft.preparationAreas ?? []).map(preparationAreaDraft).filter((area): area is PreparationAreaDraft => Boolean(area));
    if (savedAreas.length) return savedAreas;
    return (selectedTemplate?.preparationAreaSuggestions ?? []).map(preparationAreaDraft).filter((area): area is PreparationAreaDraft => Boolean(area)).map((area) => ({ ...area, source: "TEMPLATE" }));
  });
  const [paymentMethods, setPaymentMethods] = useState(operationsDraft.paymentMethods?.length ? operationsDraft.paymentMethods : ["CASH", "CARD", "YAPE", "PLIN"]);
  const [hours, setHours] = useState(operationsDraft.hours?.length === 7 ? operationsDraft.hours : weekdayNames.map((_, weekday) => ({ weekday, open: "09:00", close: "22:00", closed: false })));
  const [zones, setZones] = useState(tablesDraft.zones?.length ? tablesDraft.zones : [{ name: "Salón principal", prefix: "Mesa", count: 10, seats: 4 }]);
  const [skipTables, setSkipTables] = useState(tablesDraft.skip ?? false);
  const [skipPrinting, setSkipPrinting] = useState(printingDraft.skip ?? false);
  const [printMode, setPrintMode] = useState<"SIMPLE" | "ADVANCED">(printingDraft.mode ?? "SIMPLE");
  const [automaticPrint, setAutomaticPrint] = useState(printingDraft.automatic ?? true);
  const [areaDestinations, setAreaDestinations] = useState<Array<{ areaName: string; dispatchMode: RestaurantAreaDispatchMode }>>(printingDraft.areaDestinations ?? []);
  const [printers, setPrinters] = useState(printingDraft.printers?.length ? printingDraft.printers : [{ name: "Impresora principal", connectionType: "LOCAL_AGENT" as "LOCAL_AGENT" | "BROWSER", paperWidthMm: 80 as 58 | 80, copies: 1, areas: [] }]);
  const type = current?.type ?? create.type;
  const detectedAreas = useMemo(() => detectRestaurantAreas([
    ...categories.map((item) => item.preparationArea),
    ...products.map((item) => item.preparationArea),
    ...addons.filter((item) => item.areaAssignmentMode === "SPECIFIC_AREA").map((item) => item.preparationArea),
  ]), [addons, categories, products]);
  const enabledPreparationAreas = useMemo(() => preparationAreas.filter((area) => area.enabled && normalizeRestaurantArea(area.name)), [preparationAreas]);
  const visibleSteps = useMemo(() => type === "TRANSPORT" ? transportSteps : type === "RESTAURANT" ? restaurantSteps : allSteps.filter((step) => !["TABLES", "PRINTING"].includes(step.key)), [type]);
  const reviewIssues = useMemo(() => {
    if (type !== "RESTAURANT") return [] as string[];
    const issues: string[] = [];
    const catalogError = validateRestaurantCatalog({ skip: false, categories, products, addons }, preparationAreas);
    if (skipCatalog || catalogError) issues.push(skipCatalog ? "Completa una carta mínima antes de habilitar ventas." : catalogError);
    if (restaurantConfiguration.orders.sources.some((source) => source.active && source.key === "DINE_IN") && (skipTables || !zones.some((zone) => zone.name.trim() && zone.count > 0))) issues.push("El canal Salón requiere al menos una zona con mesas.");
    const roleKeys = new Set(restaurantRoles.map((role) => role.key));
    const missingApprovalRoles = restaurantConfiguration.sales.approvalRoleKeys.filter((role) => !roleKeys.has(role));
    if (missingApprovalRoles.length) issues.push(`Crea o selecciona los roles aprobadores: ${missingApprovalRoles.join(", ")}.`);
    const printerAreas = new Set(printers.flatMap((printer) => printer.areas).map((name) => normalizeRestaurantArea(name)?.key));
    const areasWithoutPrinter = areaDestinations.filter((destination) => destination.dispatchMode === "PRINTER" && !printerAreas.has(normalizeRestaurantArea(destination.areaName)?.key));
    if (!skipPrinting && areasWithoutPrinter.length) issues.push(`Asigna impresora a: ${areasWithoutPrinter.map((area) => area.areaName).join(", ")}.`);
    return issues;
  }, [addons, areaDestinations, categories, preparationAreas, printers, products, restaurantConfiguration.orders.sources, restaurantConfiguration.sales.approvalRoleKeys, restaurantRoles, skipCatalog, skipPrinting, skipTables, type, zones]);
  const stepValidation = useMemo(() => {
    if (type !== "RESTAURANT") return "";
    if (activeStep === "OPERATIONS") return validateRestaurantOperations(preparationAreas, paymentMethods);
    if (activeStep === "CATALOG") return validateRestaurantCatalog({ skip: skipCatalog, categories, products, addons }, preparationAreas);
    if (activeStep === "REVIEW") return reviewIssues[0] ?? "";
    return "";
  }, [activeStep, addons, categories, paymentMethods, preparationAreas, products, reviewIssues, skipCatalog, type]);

  function resetForType(value: BusinessType) {
    const template = templates.find((item) => item.type === value);
    setCreate((state) => ({ ...state, type: value, templateKey: template?.key ?? "" }));
    setEnabledModules(template?.modules ?? modulesByType[value].map((item) => item.key));
    setUsers([{ name: "", email: "", roleKey: rolesByType[value][0].key, password: "" }]);
    if (value === "TRANSPORT" && template?.transportConfiguration) setTransportConfiguration(structuredClone(template.transportConfiguration));
    if (value === "TRANSPORT") setTransportRoles(defaultTransportRoles);
    if (value === "RESTAURANT" && template?.restaurantConfiguration) setRestaurantConfiguration(structuredClone(template.restaurantConfiguration));
    if (value === "RESTAURANT") setRestaurantRoles(defaultRestaurantRoles);
    setPreparationAreas((template?.preparationAreaSuggestions ?? []).map(preparationAreaDraft).filter((area): area is PreparationAreaDraft => Boolean(area)).map((area) => ({ ...area, source: "TEMPLATE" })));
  }

  async function request(url: string, method: "POST" | "PATCH", body: unknown) {
    setPending(true); setError(""); setMessage("");
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const blockers = Array.isArray(result.error?.details?.blockers) ? result.error.details.blockers.map((item: { label?: string; detail?: string }) => `${item.label ?? "Pendiente"}: ${item.detail ?? "Requiere configuración"}`).join(" · ") : "";
        throw new Error(`${result.error?.message ?? "No pudimos guardar la configuración."}${blockers ? ` ${blockers}` : ""}`);
      }
      return result;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No pudimos conectar con el servidor.");
      return null;
    } finally { setPending(false); }
  }

  async function createBusiness() {
    const result = await request("/api/operations/platform/tenants", "POST", { ...create, startOnboarding: true });
    if (!result) return;
    const tenant = result.tenant as { id: string; slug: string; name: string; shortName: string; type: BusinessType };
    const template = templates.find((item) => item.key === create.templateKey);
    const templateAreas = (template?.preparationAreaSuggestions ?? []).map(preparationAreaDraft).filter((area): area is PreparationAreaDraft => Boolean(area)).map((area) => ({ ...area, source: "TEMPLATE" }));
    const setup = { status: "DRAFT" as const, currentStep: "BUSINESS", completedSteps: ["MODULES"], progress: 14, templateKey: create.templateKey, updatedAt: new Date().toISOString(), data: { MODULES: { enabledModules: template?.modules ?? [] }, ...(create.type === "RESTAURANT" ? { OPERATIONS: { preparationAreas: templateAreas }, TABLES: { zones: [{ name: "Salón principal", prefix: "Mesa", count: 10, seats: 4 }] } } : {}) } };
    setPreparationAreas(templateAreas);
    setCurrent({ ...tenant, country: create.country, currency: create.currency, timezone: "America/Lima", email: create.email || null, phone: create.phone || null, address: create.address || null, branchName: create.branchName, enabledModules: template?.modules ?? [], setup });
    setGeneral({ name: create.name, shortName: create.shortName, branchName: create.branchName, email: create.email, phone: create.phone, address: create.address, country: create.country, currency: create.currency, timezone: "America/Lima" });
    setCompleted(["MODULES"]); setCreated(true); setActiveStep("BUSINESS"); setMessage(result.message);
  }

  function payloadFor(step: StepKey, preserveIncomplete = false) {
    if (step === "BUSINESS") return { step, ...general };
    if (step === "MODULES") return { step, enabledModules };
    if (step === "CATALOG") return { step, skip: skipCatalog, categories: preserveIncomplete ? categories : categories.filter((item) => item.name.trim()), products: preserveIncomplete ? products : products.filter((item) => item.name.trim() && item.category.trim()), addons: preserveIncomplete ? addons : addons.filter((item) => item.name.trim()), services: preserveIncomplete ? services : services.filter((item) => item.name.trim() && item.price >= 0) };
    if (step === "TEAM") return { step, roles: type === "TRANSPORT" ? transportRoles.filter((role) => role.key.trim() && role.name.trim() && role.permissions.length) : type === "RESTAURANT" ? restaurantRoles.filter((role) => role.key.trim() && role.name.trim() && role.permissions.length) : [], users: preserveIncomplete ? users : users.filter((item) => item.name.trim() && item.email.trim()) };
    if (step === "OPERATIONS") {
      const normalizedAreas = new Map<string, PreparationAreaDraft>();
      for (const area of preparationAreas.filter((item) => item.name.trim())) {
        const normalized = normalizeRestaurantArea(area.name);
        if (normalized) normalizedAreas.set(normalized.key, { ...area, name: normalized.name, normalizedKey: normalized.key, type: normalized.type });
      }
      return { step, preparationAreas: [...normalizedAreas.values()], paymentMethods, hours };
    }
    if (step === "TABLES") return { step, skip: skipTables, zones: preserveIncomplete ? zones : zones.filter((item) => item.name.trim() && item.prefix.trim()) };
    if (step === "PRINTING") return { step, skip: skipPrinting, mode: printMode, automatic: automaticPrint, areaDestinations, printers: preserveIncomplete ? printers : printers.filter((item) => item.name.trim()) };
    if (step === "RESTAURANT_OPERATION") return { step, sections: { general: restaurantConfiguration.general, orders: restaurantConfiguration.orders, delivery: restaurantConfiguration.delivery } };
    if (step === "RESTAURANT_KITCHEN") return { step, sections: { kitchen: restaurantConfiguration.kitchen } };
    if (step === "RESTAURANT_SALES") return { step, sections: { sales: restaurantConfiguration.sales, promotions: restaurantConfiguration.promotions } };
    if (step === "RESTAURANT_CONTROL") return { step, sections: { floor: restaurantConfiguration.floor, menu: restaurantConfiguration.menu, customers: restaurantConfiguration.customers, inventory: restaurantConfiguration.inventory, notifications: restaurantConfiguration.notifications, reports: restaurantConfiguration.reports } };
    if (step === "RESTAURANT_INTEGRATIONS") return { step, sections: { integrations: restaurantConfiguration.integrations } };
    if (step === "TRANSPORT_OPERATION") return { step, sections: { general: transportConfiguration.general, operations: transportConfiguration.operations } };
    if (step === "TRANSPORT_CUSTOMERS") return { step, sections: { customers: transportConfiguration.customers } };
    if (step === "TRANSPORT_FLEET") return { step, sections: { fleet: transportConfiguration.fleet } };
    if (step === "TRANSPORT_DRIVERS") return { step, sections: { drivers: transportConfiguration.drivers, documents: transportConfiguration.documents } };
    if (step === "TRANSPORT_RULES") return { step, sections: { notifications: transportConfiguration.notifications } };
    if (step === "TRANSPORT_FINANCE") return { step, sections: { finance: transportConfiguration.finance } };
    if (step === "TRANSPORT_MAINTENANCE") return { step, sections: { maintenance: transportConfiguration.maintenance, modules: transportConfiguration.modules } };
    if (step === "TRANSPORT_SAFETY") return { step, sections: { safety: transportConfiguration.safety } };
    if (step === "TRANSPORT_INTEGRATIONS") return { step, sections: { integrations: transportConfiguration.integrations } };
    return { step, ready: true };
  }

  async function saveStep(step: StepKey) {
    if (!current) return;
    if (step === activeStep && stepValidation) { setError(stepValidation); return; }
    const result = await request(`/api/operations/platform/onboarding/${current.id}`, "PATCH", payloadFor(step));
    if (!result) return;
    const newSecrets = [
      ...(result.credentials ?? []).map((item: { name: string; email: string; password: string }) => ({ label: `${item.name} · ${item.email}`, value: item.password })),
      ...(result.printerTokens ?? []).map((item: { name: string; token: string }) => ({ label: `Token · ${item.name}`, value: item.token })),
    ];
    if (newSecrets.length) setSecrets((values) => [...values, ...newSecrets]);
    if (step === "OPERATIONS" && type === "RESTAURANT") {
      setAreaDestinations((currentDestinations) => {
        const byName = new Map(currentDestinations.map((item) => [normalizeRestaurantArea(item.areaName)?.key, item]));
        return preparationAreas.filter((area) => area.enabled).map((area) => byName.get(area.normalizedKey) ?? { areaName: area.name, dispatchMode: area.dispatchMode });
      });
    }
    setCompleted((values) => [...new Set([...values, step])]);
    setMessage(result.message);
    if (step === "REVIEW") { router.refresh(); return; }
    const target = type === "TRANSPORT" ? transportNextStep[step] : type === "RESTAURANT" ? restaurantNextStep[step] : step === "OPERATIONS" ? "REVIEW" : nextStep[step];
    if (target) setActiveStep(target);
    router.refresh();
  }

  async function saveDraftAndClose() {
    if (!current) return;
    const result = await request(`/api/operations/platform/onboarding/${current.id}`, "PATCH", { ...payloadFor(activeStep, true), draft: true });
    if (!result) return;
    router.refresh();
    setOpen(false);
  }

  function copy(value: string) { void navigator.clipboard.writeText(value); }
  const progress = Math.round((visibleSteps.filter((step) => step.key !== "REVIEW" && completed.includes(step.key)).length / Math.max(1, visibleSteps.length - 1)) * 100);

  return <>
    <Button type="button" size="sm" variant={business?.setup.status === "READY" ? "ghost" : "primary"} onClick={() => setOpen(true)}><WandSparkles size={15} />{triggerLabel}</Button>
    <Dialog open={open} title={created ? `Implementación · ${current?.shortName}` : "Nuevo negocio guiado"} description={created ? "Guarda cada paso y retoma la implementación cuando tengas la información pendiente." : "Crea el negocio y aplica una plantilla inicial en pocos minutos."} className="business-setup-dialog" onClose={() => { if (!pending) setOpen(false); }}>
      {!created ? <form className="business-create-step" onSubmit={(event) => { event.preventDefault(); void createBusiness(); }}>
        <div className="setup-intro"><WandSparkles size={24} /><div><strong>Crear la base del negocio</strong><span>Empresa, sede, plan, administrador y plantilla inicial en un solo paso.</span></div></div>
        <div className="form-grid">
          <Field label="Nombre comercial"><Input value={create.name} onChange={(event) => setCreate((state) => ({ ...state, name: event.target.value }))} required /></Field>
          <Field label="Nombre corto"><Input value={create.shortName} onChange={(event) => setCreate((state) => ({ ...state, shortName: event.target.value }))} required /></Field>
          <Field label="Identificador URL"><Input value={create.slug} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" onChange={(event) => setCreate((state) => ({ ...state, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))} required /></Field>
          <Field label="Rubro"><Select value={create.type} onChange={(event) => resetForType(event.target.value as BusinessType)}><option value="RESTAURANT">Restaurante</option><option value="BARBERSHOP">Barbería y salón</option><option value="TRANSPORT">Transporte y logística</option></Select></Field>
          <Field label="Plantilla inicial"><Select value={create.templateKey} onChange={(event) => { const key = event.target.value; const template = templates.find((item) => item.key === key); setCreate((state) => ({ ...state, templateKey: key })); if (template) { setEnabledModules(template.modules); setPreparationAreas((template.preparationAreaSuggestions ?? []).map(preparationAreaDraft).filter((area): area is PreparationAreaDraft => Boolean(area)).map((area) => ({ ...area, source: "TEMPLATE" }))); if (template.restaurantConfiguration) setRestaurantConfiguration(structuredClone(template.restaurantConfiguration)); if (template.transportConfiguration) setTransportConfiguration(structuredClone(template.transportConfiguration)); } }}>{templates.filter((item) => item.type === create.type).map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}</Select></Field>
          <Field label="Plan"><Select value={create.planId} onChange={(event) => setCreate((state) => ({ ...state, planId: event.target.value }))} required><option value="">Selecciona un plan</option>{plans.filter((item) => item.active).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</Select></Field>
          <Field label="Primera sede"><Input value={create.branchName} onChange={(event) => setCreate((state) => ({ ...state, branchName: event.target.value }))} required /></Field>
          <Field label="País"><Select value={create.country} onChange={(event) => setCreate((state) => ({ ...state, country: event.target.value }))}><option value="PE">Perú</option><option value="CO">Colombia</option><option value="MX">México</option><option value="CL">Chile</option></Select></Field>
          <Field label="Administrador"><Input value={create.adminName} onChange={(event) => setCreate((state) => ({ ...state, adminName: event.target.value }))} required /></Field>
          <Field label="Correo del administrador"><Input type="email" value={create.adminEmail} onChange={(event) => setCreate((state) => ({ ...state, adminEmail: event.target.value }))} required /></Field>
          <Field label="Clave temporal"><div className="setup-password"><Input type="text" minLength={8} value={create.adminPassword} onChange={(event) => setCreate((state) => ({ ...state, adminPassword: event.target.value }))} required /><Button type="button" variant="secondary" onClick={() => setCreate((state) => ({ ...state, adminPassword: passwordValue() }))}>Generar</Button></div></Field>
          <Field label="Estado inicial"><Select value={create.subscriptionStatus} onChange={(event) => setCreate((state) => ({ ...state, subscriptionStatus: event.target.value }))}><option value="TRIAL">Prueba de 14 días</option><option value="ACTIVE">Activo</option></Select></Field>
        </div>
        {selectedTemplate ? <div className="setup-template-summary"><strong>{selectedTemplate.name}</strong><span>{selectedTemplate.description}</span></div> : null}
        <Button type="submit" size="lg" loading={pending}>Crear y continuar <ArrowRight size={17} /></Button>
      </form> : <div className="business-setup-layout">
        <aside className="setup-sidebar">
          <div className="setup-progress"><span><strong>{progress}%</strong><small>configurado</small></span><i><b style={{ width: `${progress}%` }} /></i></div>
          <nav>{visibleSteps.map((step) => { const done = completed.includes(step.key) || (step.key === "REVIEW" && current?.setup.status === "READY"); const active = activeStep === step.key; return <button type="button" key={step.key} className={active ? "active" : ""} onClick={() => { if (done || active || completed.includes(visibleSteps[Math.max(0, visibleSteps.indexOf(step) - 1)]?.key)) setActiveStep(step.key); }}><span>{done ? <Check size={14} /> : active ? <Circle size={14} /> : visibleSteps.indexOf(step) + 1}</span><div><strong>{step.label}</strong><small>{step.help}</small></div></button>; })}</nav>
          <small className="setup-autosave"><Save size={13} /> Cada paso queda guardado</small>
        </aside>
        <section className="setup-content">
          <header><div><span className="section-kicker">PASO {visibleSteps.findIndex((item) => item.key === activeStep) + 1} DE {visibleSteps.length}</span><h3>{visibleSteps.find((item) => item.key === activeStep)?.label}</h3></div>{completed.includes(activeStep) ? <StatusBadge tone="success" dot>Completo</StatusBadge> : <StatusBadge tone="warning" dot>Pendiente</StatusBadge>}</header>
          {activeStep === "BUSINESS" ? <div className="form-grid"><Field label="Nombre comercial"><Input value={general.name} onChange={(event) => setGeneral((state) => ({ ...state, name: event.target.value }))} /></Field><Field label="Nombre corto"><Input value={general.shortName} onChange={(event) => setGeneral((state) => ({ ...state, shortName: event.target.value }))} /></Field><Field label="Sede principal"><Input value={general.branchName} onChange={(event) => setGeneral((state) => ({ ...state, branchName: event.target.value }))} /></Field><Field label="Correo comercial"><Input type="email" value={general.email} onChange={(event) => setGeneral((state) => ({ ...state, email: event.target.value }))} /></Field><Field label="Teléfono"><Input value={general.phone} onChange={(event) => setGeneral((state) => ({ ...state, phone: event.target.value }))} /></Field><Field label="Dirección"><Input value={general.address} onChange={(event) => setGeneral((state) => ({ ...state, address: event.target.value }))} /></Field><Field label="Moneda"><Select value={general.currency} onChange={(event) => setGeneral((state) => ({ ...state, currency: event.target.value }))}><option value="PEN">Sol peruano</option><option value="USD">Dólar</option><option value="COP">Peso colombiano</option><option value="MXN">Peso mexicano</option></Select></Field><Field label="Zona horaria"><Input value={general.timezone} onChange={(event) => setGeneral((state) => ({ ...state, timezone: event.target.value }))} /></Field></div> : null}
          {activeStep === "MODULES" ? <div className="setup-module-grid">{modulesByType[type].map((module) => <label key={module.key} className={enabledModules.includes(module.key) ? "selected" : ""}><input type="checkbox" checked={enabledModules.includes(module.key)} disabled={module.required} onChange={(event) => setEnabledModules((values) => event.target.checked ? [...new Set([...values, module.key])] : values.filter((item) => item !== module.key))} /><span>{enabledModules.includes(module.key) ? <CheckCircle2 size={18} /> : <Circle size={18} />}<strong>{module.label}</strong>{module.required ? <small>Esencial</small> : null}</span></label>)}</div> : null}
          {activeStep === "CATALOG" ? <CatalogStep type={type} skip={skipCatalog} setSkip={setSkipCatalog} categories={categories} setCategories={setCategories} products={products} setProducts={setProducts} addons={addons} setAddons={setAddons} services={services} setServices={setServices} areas={enabledPreparationAreas} /> : null}
          {activeStep === "TEAM" ? <TeamStep type={type} users={users} setUsers={setUsers} transportRoles={transportRoles} setTransportRoles={setTransportRoles} restaurantRoles={restaurantRoles} setRestaurantRoles={setRestaurantRoles} detectedAreas={detectedAreas} /> : null}
          {activeStep === "OPERATIONS" ? <OperationsStep type={type} areas={preparationAreas} setAreas={setPreparationAreas} methods={paymentMethods} setMethods={setPaymentMethods} hours={hours} setHours={setHours} /> : null}
          {activeStep === "TABLES" ? <TablesStep skip={skipTables} setSkip={setSkipTables} zones={zones} setZones={setZones} /> : null}
          {activeStep === "PRINTING" ? <PrintingStep skip={skipPrinting} setSkip={setSkipPrinting} mode={printMode} setMode={setPrintMode} automatic={automaticPrint} setAutomatic={setAutomaticPrint} printers={printers} setPrinters={setPrinters} areas={preparationAreas.filter((area) => area.enabled).map((area) => area.name)} areaDestinations={areaDestinations} setAreaDestinations={setAreaDestinations} /> : null}
          {activeStep.startsWith("TRANSPORT_") ? <TransportWizardStep step={activeStep} configuration={transportConfiguration} setConfiguration={setTransportConfiguration} /> : null}
          {activeStep.startsWith("RESTAURANT_") ? <RestaurantWizardStep step={activeStep as RestaurantSetupStep} configuration={restaurantConfiguration} setConfiguration={setRestaurantConfiguration} roleKeys={restaurantRoles.map((role) => role.key)} /> : null}
          {activeStep === "REVIEW" ? <div className="setup-review"><Rocket size={36} /><h3>{progress === 100 && !reviewIssues.length ? "Todo está configurado" : "Revisa los puntos pendientes"}</h3><p>La validación confirma dependencias reales, no solo que se haya visitado cada paso.</p>{reviewIssues.length ? <section className="setup-review-issues" aria-label="Bloqueos operativos">{reviewIssues.map((issue) => <span key={issue}><Circle size={15} /><strong>{issue}</strong></span>)}</section> : null}<div>{visibleSteps.filter((item) => item.key !== "REVIEW").map((step) => <span key={step.key}>{completed.includes(step.key) ? <CheckCircle2 size={17} /> : <Circle size={17} />}<strong>{step.label}</strong><small>{completed.includes(step.key) ? "Completo" : "Pendiente"}</small></span>)}</div></div> : null}
          {secrets.length ? <div className="setup-secrets"><strong>Guarda estas credenciales ahora</strong><small>Las claves y tokens se muestran una sola vez.</small>{secrets.map((item, index) => <span key={`${item.label}-${index}`}><div><b>{item.label}</b><code>{item.value}</code></div><button type="button" onClick={() => copy(item.value)} aria-label={`Copiar ${item.label}`}><Copy size={15} /></button></span>)}</div> : null}
          {stepValidation ? <p className="setup-validation" role="alert">{stepValidation}</p> : null}
          {error ? <p className="auth-error" role="alert">{error}</p> : null}{message ? <p className="composer-message" role="status"><CheckCircle2 size={16} />{message}</p> : null}
          <footer className="setup-actions"><Button type="button" variant="ghost" onClick={() => { const index = visibleSteps.findIndex((item) => item.key === activeStep); if (index > 0) setActiveStep(visibleSteps[index - 1].key); }} disabled={visibleSteps[0].key === activeStep}><ArrowLeft size={16} />Anterior</Button><span /><Button type="button" variant="secondary" onClick={() => void saveDraftAndClose()} disabled={pending}><Save size={16} />Guardar y continuar después</Button><Button type="button" loading={pending} disabled={Boolean(stepValidation)} onClick={() => void saveStep(activeStep)}>{activeStep === "REVIEW" ? <><Rocket size={16} />Marcar listo para operar</> : <>Guardar y continuar<ArrowRight size={16} /></>}</Button></footer>
        </section>
      </div>}
    </Dialog>
  </>;
}

type Setter<T> = React.Dispatch<React.SetStateAction<T>>;
function CatalogStep({ type, skip, setSkip, categories, setCategories, products, setProducts, addons, setAddons, services, setServices, areas }: { type: BusinessType; skip: boolean; setSkip: (value: boolean) => void; categories: Array<{ name: string; preparationArea: string }>; setCategories: Setter<Array<{ name: string; preparationArea: string }>>; products: Array<{ name: string; category: string; description: string; price: number; cost: number; preparationArea: string }>; setProducts: Setter<Array<{ name: string; category: string; description: string; price: number; cost: number; preparationArea: string }>>; addons: Array<{ name: string; price: number; cost: number; preparationArea: string; areaAssignmentMode: RestaurantAreaAssignmentMode }>; setAddons: Setter<Array<{ name: string; price: number; cost: number; preparationArea: string; areaAssignmentMode: RestaurantAreaAssignmentMode }>>; services: Array<{ name: string; category: string; durationMinutes: number; price: number }>; setServices: Setter<Array<{ name: string; category: string; durationMinutes: number; price: number }>>; areas: PreparationAreaDraft[] }) {
  if (type === "TRANSPORT") return <div className="setup-empty-step"><CheckCircle2 size={28} /><strong>Sin catálogo inicial obligatorio</strong><span>Los maestros de transporte se completan según contratos, flota y rutas del cliente.</span></div>;
  const areaOptions = areas.map((area) => ({ value: area.name, label: area.name }));
  const categoryOptions = categories.filter((category) => category.name.trim() && category.preparationArea).map((category) => ({ value: category.name, label: category.name }));
  const changeCategory = (index: number, key: keyof CatalogDraft["categories"][number], rawValue: string | number) => {
    const value = String(rawValue);
    const previous = categories[index];
    setCategories((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
    if (key === "name" && previous?.name) setProducts((items) => items.map((item) => item.category === previous.name ? { ...item, category: value } : item));
  };
  const removeCategory = (index: number) => {
    const removed = categories[index]?.name;
    setCategories((items) => items.filter((_, itemIndex) => itemIndex !== index));
    if (removed) setProducts((items) => items.map((item) => item.category === removed ? { ...item, category: "" } : item));
  };
  return <div className="setup-stack">
    <label className="platform-check"><input type="checkbox" checked={skip} onChange={(event) => setSkip(event.target.checked)} /><span><strong>Completar esta información después</strong><small>El progreso quedará guardado como paso omitido.</small></span></label>
    {!skip && type === "RESTAURANT" ? <>
      <section className="setup-catalog-foundation"><strong>1. Áreas operativas confirmadas</strong><small>La carta solo puede usar estas áreas. Así evitamos variantes como Cocina, cocinas o COCINA.</small><div>{areas.map((area) => <span key={area.normalizedKey || area.name}>{area.name}</span>)}</div></section>
      <SetupRows title="2. Categorías" addLabel="Agregar categoría" rows={categories} setRows={setCategories} empty={{ name: "", preparationArea: "" }} fields={[{ key: "name", label: "Categoría" }, { key: "preparationArea", label: "Área operativa", options: areaOptions, placeholder: "Selecciona un área" }]} onFieldChange={changeCategory} onRemove={removeCategory} />
      <SetupRows title="3. Productos y precios" addLabel="Agregar producto" addDisabled={!categoryOptions.length} rows={products} setRows={setProducts} empty={{ name: "", category: "", description: "", price: 0, cost: 0, preparationArea: "" }} fields={[{ key: "name", label: "Producto" }, { key: "category", label: "Categoría", options: categoryOptions, placeholder: "Selecciona una categoría" }, { key: "price", label: "Precio", type: "number" }, { key: "cost", label: "Costo", type: "number" }, { key: "preparationArea", label: "Área", options: areaOptions, placeholder: "Heredar de la categoría" }]} />
      {products.some((item) => item.name.trim() && item.price === 0) ? <p className="setup-warning">Los productos con precio 0 se guardarán sin descartarse. Revísalos antes de abrir ventas si no son cortesías.</p> : null}
      <section className="setup-row-section">
        <header><strong>4. Adicionales</strong><Button type="button" size="sm" variant="secondary" onClick={() => setAddons((items) => [...items, { name: "", price: 0, cost: 0, preparationArea: "", areaAssignmentMode: "INHERIT_FROM_PRODUCT" }])}><Plus size={14} />Agregar adicional</Button></header>
        <div>{addons.map((addon, index) => <div className="setup-data-row setup-addon-row" key={index}>
          <label><span>Adicional</span><Input value={addon.name} onChange={(event) => setAddons((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} /></label>
          <label><span>Precio</span><Input type="number" min={0} step="0.01" value={addon.price} onChange={(event) => setAddons((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, price: Number(event.target.value) } : item))} /></label>
          <label><span>Costo</span><Input type="number" min={0} step="0.01" value={addon.cost} onChange={(event) => setAddons((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, cost: Number(event.target.value) } : item))} /></label>
          <label><span>Destino</span><Select value={addon.areaAssignmentMode} onChange={(event) => setAddons((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, areaAssignmentMode: event.target.value as RestaurantAreaAssignmentMode, preparationArea: event.target.value === "INHERIT_FROM_PRODUCT" ? "" : item.preparationArea } : item))}><option value="INHERIT_FROM_PRODUCT">Heredar del producto</option><option value="SPECIFIC_AREA">Área específica</option></Select></label>
          <label><span>Área específica</span><Select disabled={addon.areaAssignmentMode === "INHERIT_FROM_PRODUCT"} value={addon.preparationArea} onChange={(event) => setAddons((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, preparationArea: event.target.value } : item))}><option value="">Selecciona un área</option>{areaOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</Select></label>
          <button type="button" className="remove-setup-row" onClick={() => setAddons((items) => items.filter((_, itemIndex) => itemIndex !== index))} aria-label="Eliminar adicional"><Trash2 size={15} /></button>
        </div>)}</div>
      </section>
    </> : null}
    {!skip && type === "BARBERSHOP" ? <SetupRows title="Servicios" addLabel="Agregar servicio" rows={services} setRows={setServices} empty={{ name: "", category: "", durationMinutes: 30, price: 0 }} fields={[{ key: "name", label: "Servicio" }, { key: "category", label: "Categoría" }, { key: "durationMinutes", label: "Minutos", type: "number" }, { key: "price", label: "Precio", type: "number" }]} /> : null}
  </div>;
}

function SetupRows<T extends Record<string, string | number>>({ title, addLabel, addDisabled = false, rows, setRows, empty, fields, onFieldChange, onRemove }: { title: string; addLabel: string; addDisabled?: boolean; rows: T[]; setRows: Setter<T[]>; empty: T; fields: Array<{ key: keyof T; label: string; type?: string; options?: Array<{ value: string; label: string }>; placeholder?: string }>; onFieldChange?: (index: number, key: keyof T, value: string | number) => void; onRemove?: (index: number) => void }) {
  const update = (index: number, key: keyof T, value: string | number) => {
    if (onFieldChange) { onFieldChange(index, key, value); return; }
    setRows((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  };
  return <section className="setup-row-section" aria-label={title}>
    <header><strong>{title}</strong><Button type="button" size="sm" variant="secondary" disabled={addDisabled} title={addDisabled ? "Completa primero una categoría" : undefined} onClick={() => setRows((items) => [...items, { ...empty }])}><Plus size={14} />{addLabel}</Button></header>
    <div>{rows.map((row, index) => <div className="setup-data-row" key={index}>{fields.map((field) => <label key={String(field.key)}><span>{field.label}</span>{field.options ? <Select value={String(row[field.key])} onChange={(event) => update(index, field.key, event.target.value)}><option value="">{field.placeholder ?? "Selecciona una opción"}</option>{field.options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</Select> : <Input type={field.type ?? "text"} min={field.type === "number" ? 0 : undefined} step={field.type === "number" ? "0.01" : undefined} value={row[field.key]} onChange={(event) => update(index, field.key, field.type === "number" ? Number(event.target.value) : event.target.value)} />}</label>)}<button type="button" className="remove-setup-row" onClick={() => onRemove ? onRemove(index) : setRows((items) => items.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Eliminar fila de ${title}`}><Trash2 size={15} /></button></div>)}</div>
  </section>;
}

function TeamStep({ type, users, setUsers, transportRoles, setTransportRoles, restaurantRoles, setRestaurantRoles, detectedAreas }: { type: BusinessType; users: Array<{ name: string; email: string; roleKey: string; password: string }>; setUsers: Setter<Array<{ name: string; email: string; roleKey: string; password: string }>>; transportRoles: Array<{ key: string; name: string; permissions: string[] }>; setTransportRoles: Setter<Array<{ key: string; name: string; permissions: string[] }>>; restaurantRoles: Array<{ key: string; name: string; permissions: string[] }>; setRestaurantRoles: Setter<Array<{ key: string; name: string; permissions: string[] }>>; detectedAreas: DetectedRestaurantArea[] }) {
  const customRoles = type === "TRANSPORT" ? transportRoles : restaurantRoles;
  const setCustomRoles = type === "TRANSPORT" ? setTransportRoles : setRestaurantRoles;
  const permissions = type === "TRANSPORT" ? transportPermissions : restaurantPermissions;
  const roles = type === "BARBERSHOP" ? rolesByType[type] : customRoles.map((role) => ({ key: role.key, label: role.name }));
  const suggestedRoles = type === "RESTAURANT" ? detectedAreas.map((area) => ({ key: area.type === "KITCHEN" ? "KITCHEN" : area.type, name: area.name })).filter((suggestion, index, items) => items.findIndex((item) => item.key === suggestion.key) === index && !restaurantRoles.some((role) => role.key === suggestion.key)) : [];
  return <div className="setup-stack">
    {suggestedRoles.length ? <section className="setup-role-suggestions"><div><strong>Roles sugeridos por la carta</strong><small>Son opcionales; agrégalos solo si el equipo trabaja por área.</small></div>{suggestedRoles.map((suggestion) => <Button key={suggestion.key} type="button" size="sm" variant="secondary" onClick={() => setRestaurantRoles((items) => [...items, { key: suggestion.key, name: suggestion.name, permissions: ["dashboard:read", "restaurant:kitchen:read", "restaurant:kitchen:write", "restaurant:orders:read"] }])}><Plus size={14} />{suggestion.name}</Button>)}</section> : null}
    {type !== "BARBERSHOP" ? <section className="setup-row-section transport-role-builder"><header><div><strong>Roles personalizados</strong><small>Define acceso por módulo y acción. El Administrador conserva acceso total.</small></div><Button type="button" size="sm" variant="secondary" onClick={() => setCustomRoles((items) => [...items, { key: `ROL_${items.length + 1}`, name: "Nuevo rol", permissions: ["dashboard:read"] }])}><Plus size={14} />Agregar rol</Button></header><div>{customRoles.map((role, index) => <article key={`${role.key}-${index}`}><div className="transport-role-fields"><Field label="Clave"><Input value={role.key} onChange={(event) => setCustomRoles((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, key: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "") } : item))} /></Field><Field label="Nombre"><Input value={role.name} onChange={(event) => setCustomRoles((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} /></Field><button type="button" className="remove-setup-row" onClick={() => setCustomRoles((items) => items.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Eliminar rol ${role.name}`}><Trash2 size={15} /></button></div><div className="transport-permission-grid">{permissions.map(([permission, label]) => <label key={permission} className={role.permissions.includes(permission) ? "selected" : ""}><input type="checkbox" checked={role.permissions.includes(permission)} onChange={(event) => setCustomRoles((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, permissions: event.target.checked ? [...item.permissions, permission] : item.permissions.filter((value) => value !== permission) } : item))} /><span><strong>{label}</strong><small>{permission.endsWith(":write") ? "Administrar" : "Consultar"}</small></span></label>)}</div></article>)}</div></section> : null}
    <div className="setup-role-summary">{roles.map((role) => <span key={role.key}><Check size={14} /><strong>{role.label}</strong></span>)}</div>
    <section className="setup-row-section">
      <header><strong>Usuarios iniciales</strong><Button type="button" size="sm" variant="secondary" onClick={() => setUsers((items) => [...items, { name: "", email: "", roleKey: roles[0]?.key ?? "", password: "" }])}><Plus size={14} />Agregar usuario</Button></header>
      <div>{users.map((user, index) => <div className="setup-data-row" key={index}>
        <label><span>Nombre</span><Input value={user.name} onChange={(event) => setUsers((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} /></label>
        <label><span>Correo</span><Input type="email" value={user.email} onChange={(event) => setUsers((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, email: event.target.value } : item))} /></label>
        <label><span>Función del usuario</span><Select value={user.roleKey} onChange={(event) => setUsers((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, roleKey: event.target.value } : item))}>{roles.map((role) => <option key={role.key} value={role.key}>{role.label}</option>)}</Select></label>
        <label><span>Contraseña temporal (opcional)</span><Input type="password" value={user.password} placeholder="Generar automáticamente" onChange={(event) => setUsers((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, password: event.target.value } : item))} /></label>
        <button type="button" className="remove-setup-row" onClick={() => setUsers((items) => items.filter((_, itemIndex) => itemIndex !== index))} aria-label="Eliminar usuario"><Trash2 size={15} /></button>
      </div>)}</div>
    </section>
    <small className="setup-hint">Selecciona la función; el sistema asignará los permisos correctos. Si dejas la contraseña vacía, generará una temporal y pedirá cambiarla al ingresar.</small>
  </div>;
}

function OperationsStep({ type, areas, setAreas, methods, setMethods, hours, setHours }: { type: BusinessType; areas: PreparationAreaDraft[]; setAreas: Setter<PreparationAreaDraft[]>; methods: string[]; setMethods: Setter<string[]>; hours: Array<{ weekday: number; open: string; close: string; closed: boolean }>; setHours: Setter<Array<{ weekday: number; open: string; close: string; closed: boolean }>> }) {
  const paymentLabels: Record<string, string> = { CASH: "Efectivo", CARD: "Tarjeta", TRANSFER: "Transferencia", YAPE: "Yape", PLIN: "Plin", OTHER: "Otro" };
  const normalizeAndMergeAreas = () => setAreas((items) => {
    const merged = new Map<string, PreparationAreaDraft>();
    const invalid: PreparationAreaDraft[] = [];
    for (const item of items) {
      const normalized = normalizeRestaurantArea(item.name);
      if (!normalized) { invalid.push(item); continue; }
      const canonical = { ...item, name: normalized.name, normalizedKey: normalized.key, type: normalized.type };
      const previous = merged.get(normalized.key);
      merged.set(normalized.key, previous ? { ...previous, enabled: previous.enabled || canonical.enabled } : canonical);
    }
    return [...merged.values(), ...invalid];
  });
  return <div className="setup-stack">
    {type === "RESTAURANT" ? <section className="setup-operational-areas">
      <header><div><strong>1. Define las áreas operativas</strong><small>Estas áreas serán las únicas disponibles en categorías, productos, adicionales e impresión.</small></div><Button type="button" size="sm" variant="secondary" onClick={() => setAreas((items) => [...items, { name: "", normalizedKey: "", type: "CUSTOM", source: "MANUAL", dispatchMode: "KDS", enabled: true }])}><Plus size={14} />Nueva área</Button></header>
      <p className="setup-normalization-hint">Los nombres equivalentes se unifican automáticamente: “Cocina”, “cocinas” y “COCINA” se guardan como una sola área.</p>
      <div>{areas.map((area, index) => <article key={`${area.normalizedKey}-${index}`} className={area.enabled ? "selected" : ""}>
        <label className="platform-check"><input type="checkbox" checked={area.enabled} onChange={(event) => setAreas((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, enabled: event.target.checked } : item))} /><span><strong>Usar área</strong><small>{area.source === "TEMPLATE" ? "Incluida en plantilla" : "Configuración operativa"}</small></span></label>
        <Field label="Nombre operativo"><Input aria-label={`Nombre del área ${index + 1}`} placeholder="Ej. Cocina" value={area.name} onBlur={normalizeAndMergeAreas} onChange={(event) => { const normalized = normalizeRestaurantArea(event.target.value); setAreas((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value, normalizedKey: normalized?.key ?? "", type: normalized?.type ?? "CUSTOM" } : item)); }} /></Field>
        <span><b>{normalizeRestaurantArea(area.name)?.name ?? "Sin nombre"}</b><small>{area.enabled ? "Disponible para seleccionar" : "No se utilizará"}</small></span>
        <button type="button" className="remove-setup-row" onClick={() => setAreas((items) => items.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Eliminar área ${area.name || index + 1}`}><Trash2 size={15} /></button>
      </article>)}</div>
    </section> : null}
    <section className="setup-choice-section"><strong>Métodos de pago</strong><div>{Object.entries(paymentLabels).map(([key, label]) => <label key={key} className={methods.includes(key) ? "selected" : ""}><input type="checkbox" checked={methods.includes(key)} onChange={(event) => setMethods((values) => event.target.checked ? [...values, key] : values.filter((item) => item !== key))} />{label}</label>)}</div></section>
    <section className="setup-hours"><strong>Horario semanal</strong>{hours.map((item, index) => <div key={item.weekday}><b>{weekdayNames[item.weekday]}</b><label><input type="checkbox" checked={!item.closed} onChange={(event) => setHours((values) => values.map((value, itemIndex) => itemIndex === index ? { ...value, closed: !event.target.checked } : value))} />Abierto</label><Input type="time" value={item.open} disabled={item.closed} onChange={(event) => setHours((values) => values.map((value, itemIndex) => itemIndex === index ? { ...value, open: event.target.value } : value))} /><span>a</span><Input type="time" value={item.close} disabled={item.closed} onChange={(event) => setHours((values) => values.map((value, itemIndex) => itemIndex === index ? { ...value, close: event.target.value } : value))} /></div>)}</section>
  </div>;
}

function TablesStep({ skip, setSkip, zones, setZones }: { skip: boolean; setSkip: (value: boolean) => void; zones: Array<{ name: string; prefix: string; count: number; seats: number }>; setZones: Setter<Array<{ name: string; prefix: string; count: number; seats: number }>> }) { return <div className="setup-stack"><label className="platform-check"><input type="checkbox" checked={skip} onChange={(event) => setSkip(event.target.checked)} /><span><strong>El negocio no usará mesas por ahora</strong><small>Podrá activarlas posteriormente.</small></span></label>{!skip ? <SetupRows title="Zonas y mesas" addLabel="Agregar zona" rows={zones} setRows={setZones} empty={{ name: "", prefix: "Mesa", count: 10, seats: 4 }} fields={[{ key: "name", label: "Zona" }, { key: "prefix", label: "Prefijo" }, { key: "count", label: "Cantidad", type: "number" }, { key: "seats", label: "Asientos", type: "number" }]} /> : null}</div>; }

function PrintingStep({ skip, setSkip, mode, setMode, automatic, setAutomatic, printers, setPrinters, areas, areaDestinations, setAreaDestinations }: { skip: boolean; setSkip: (value: boolean) => void; mode: "SIMPLE" | "ADVANCED"; setMode: (value: "SIMPLE" | "ADVANCED") => void; automatic: boolean; setAutomatic: (value: boolean) => void; printers: Array<{ name: string; connectionType: "LOCAL_AGENT" | "BROWSER"; paperWidthMm: 58 | 80; copies: number; areas: string[] }>; setPrinters: Setter<Array<{ name: string; connectionType: "LOCAL_AGENT" | "BROWSER"; paperWidthMm: 58 | 80; copies: number; areas: string[] }>>; areas: string[]; areaDestinations: Array<{ areaName: string; dispatchMode: RestaurantAreaDispatchMode }>; setAreaDestinations: Setter<Array<{ areaName: string; dispatchMode: RestaurantAreaDispatchMode }>> }) {
  const destinations = areas.map((areaName) => areaDestinations.find((item) => normalizeRestaurantArea(item.areaName)?.key === normalizeRestaurantArea(areaName)?.key) ?? { areaName, dispatchMode: "KDS" as RestaurantAreaDispatchMode });
  const setDestination = (areaName: string, dispatchMode: RestaurantAreaDispatchMode) => setAreaDestinations((items) => {
    const key = normalizeRestaurantArea(areaName)?.key;
    const filtered = items.filter((item) => normalizeRestaurantArea(item.areaName)?.key !== key);
    return [...filtered, { areaName, dispatchMode }];
  });
  return <div className="setup-stack">
    <label className="platform-check"><input type="checkbox" checked={skip} onChange={(event) => setSkip(event.target.checked)} /><span><strong>Configurar impresión más adelante</strong><small>La pantalla de cocina seguirá funcionando sin impresora.</small></span></label>
    {!skip ? <>
      <section className="setup-print-destinations"><header><div><strong>¿Dónde deseas recibir cada comanda?</strong><small>Un área puede usar pantalla/KDS, impresora o no generar salida.</small></div></header><div>{destinations.map((destination) => <article key={destination.areaName}><strong>{destination.areaName}</strong><Select aria-label={`Destino de ${destination.areaName}`} value={destination.dispatchMode} onChange={(event) => setDestination(destination.areaName, event.target.value as RestaurantAreaDispatchMode)}><option value="KDS">Pantalla / KDS</option><option value="PRINTER">Impresora</option><option value="NONE">Sin impresión</option></Select></article>)}</div></section>
      <div className="form-grid"><Field label="Distribución"><Select value={mode} onChange={(event) => setMode(event.target.value as "SIMPLE" | "ADVANCED")}><option value="SIMPLE">Simple · una impresora</option><option value="ADVANCED">Avanzada · por áreas</option></Select></Field><label className="platform-check"><input type="checkbox" checked={automatic} onChange={(event) => setAutomatic(event.target.checked)} /><span><strong>Impresión automática</strong><small>Procesar comandas sin intervención.</small></span></label></div>
      <section className="setup-row-section"><header><strong>Impresoras</strong><Button type="button" size="sm" variant="secondary" onClick={() => setPrinters((items) => [...items, { name: "", connectionType: "LOCAL_AGENT", paperWidthMm: 80, copies: 1, areas: [] }])}><Plus size={14} />Agregar impresora</Button></header>{printers.map((printer, index) => <div className="setup-printer" key={index}><Input placeholder="Nombre" value={printer.name} onChange={(event) => setPrinters((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} /><Select value={printer.connectionType} onChange={(event) => setPrinters((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, connectionType: event.target.value as "LOCAL_AGENT" | "BROWSER" } : item))}><option value="LOCAL_AGENT">Agente local</option><option value="BROWSER">Navegador</option></Select><Select value={String(printer.paperWidthMm)} onChange={(event) => setPrinters((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, paperWidthMm: Number(event.target.value) as 58 | 80 } : item))}><option value="80">80 mm</option><option value="58">58 mm</option></Select><div className="setup-printer-areas">{areas.map((area) => <label key={area}><input type="checkbox" checked={printer.areas.includes(area)} onChange={(event) => setPrinters((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, areas: event.target.checked ? [...item.areas, area] : item.areas.filter((value) => value !== area) } : item))} />{area}</label>)}</div><button type="button" className="remove-setup-row" onClick={() => setPrinters((items) => items.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={15} /></button></div>)}</section>
    </> : null}
  </div>;
}
