import { required } from "./owned";
import { createRestaurantOrder, addOrderItems } from "../infrastructure/prisma/orders";
import { orderSchema, addItemsSchema } from "./order-input";
import { updateKitchen, updateOrderState } from "./order-state";
import { checkoutRestaurantOrder } from "./checkout";
import { claimOrder } from "./order-version";
import { handleRestaurantCashCommand } from "./cash-commands";
import { withSerializableTransaction } from "@/core/database/transactions";
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/core/database/prisma";
import { AppError } from "@/core/auth/errors";
import type { TenantScope } from "@/core/auth/types";
import { audit } from "@/core/audit/audit";
import { menuChange, recordMenuHistory } from "./menu-history";
import { refundRestaurantSale } from "./refunds";
import { issueRestaurantCreditNote } from "./sunat";
import { aggregatePreparationStatus } from "./preparation";
import { createRoutedPrintJobs } from "./printing";
import { handleRestaurantPrintCommand } from "./print-commands";

import { assertRestaurantConfigured, getRestaurantConfiguration, getRestaurantConfigurationHistory, hasStoredRestaurantConfiguration, rollbackRestaurantConfiguration, saveRestaurantConfigurationSection, type RestaurantConfigurationSection } from "./configuration";
import { normalizeRestaurantArea } from "@movendi/contracts";
import { materializePreparationAreas, updateOwnedPreparationArea } from "./areas";
import { getRestaurantReadiness } from "./readiness";
import { electronicDocumentSchema, getSunatConnectionStatus, issueRestaurantElectronicDocument, saveSunatCredentials, sunatCredentialSchema, testSunatConnection } from "./sunat";

const configuredKey = z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]+$/).min(1).max(80);
const customerSchema = z.object({ name: z.string().trim().min(2).max(120), documentType: configuredKey.optional().or(z.literal("")), dni: z.string().trim().max(20).optional(), segment: configuredKey.optional().or(z.literal("")), phone: z.string().trim().max(30).optional(), email: z.union([z.string().email(), z.literal("")]).optional(), notes: z.string().trim().max(500).optional() });
const categorySchema = z.object({ name: z.string().trim().min(2).max(100) });
const productSchema = z.object({ taxCategory: z.enum(["GRAVADA", "EXONERADA", "INAFECTA"]).default("GRAVADA"), name: z.string().trim().min(2).max(140), description: z.string().trim().max(400).optional(), categoryId: z.string().min(1), price: z.coerce.number().nonnegative().max(100000), cost: z.coerce.number().nonnegative().max(100000).default(0), kitchenArea: z.string().trim().min(1).max(40).optional().default("GENERAL"), productType: configuredKey.optional().default("FOOD"), areaAssignmentMode: z.enum(["INHERIT_FROM_PRODUCT", "SPECIFIC_AREA"]).optional().default("SPECIFIC_AREA"), preparationAreaId: z.string().optional().or(z.literal("")) });
const areaSchema = z.object({ name: z.string().trim().min(2).max(80) });
const tableSchema = z.object({ name: z.string().trim().min(1).max(40), seats: z.coerce.number().int().min(1).max(50), areaId: z.string().min(1) });
const kitchenStatusSchema = z.object({ itemIds: z.array(z.string().min(1)).min(1).max(200).optional(), status: configuredKey });
const orderStatusSchema = z.object({ status: configuredKey, reason: z.string().trim().max(300).optional() });
const deliveryStatusSchema = z.object({ status: configuredKey });
const checkoutSchema = z.object({
  redeemPoints: z.coerce.number().int().min(0).max(10000000).default(0),
  receivedAmount: z.coerce.number().nonnegative().max(1_000_000).optional(),
  paymentMethod: configuredKey.optional(),
  payments: z.array(z.object({ method: configuredKey, amount: z.coerce.number().positive().max(1_000_000), reference: z.string().trim().max(100).optional() })).min(1).max(10).optional(),
}).superRefine((value, context) => {
  if (!value.paymentMethod && !value.payments?.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "Selecciona al menos un medio de pago." });
});
const activeValue = z.enum(["true", "false"]).transform((value) => value === "true");
const customerUpdateSchema = customerSchema.extend({ active: activeValue });
const categoryUpdateSchema = categorySchema.extend({ active: activeValue });
const productUpdateSchema = productSchema.extend({ active: activeValue });
const areaUpdateSchema = areaSchema.extend({ active: activeValue });
const tableUpdateSchema = tableSchema.extend({ active: activeValue });
const transferSchema = z.object({ tableId: z.string().min(1) });
const preparationAreaSchema = z.object({ name: z.string().trim().min(2).max(80), type: z.enum(["KITCHEN", "BAR", "GRILL", "DESSERT", "BEVERAGE", "CUSTOM"]).optional(), dispatchMode: z.enum(["KDS", "PRINTER", "NONE"]).optional(), active: z.boolean().optional().default(true) });
const printDeviceSchema = z.object({ name: z.string().trim().min(2).max(100), connectionType: z.enum(["BROWSER", "LOCAL_AGENT"]).default("LOCAL_AGENT"), paperWidthMm: z.coerce.number().int().refine((value) => value === 58 || value === 80, "El ancho debe ser 58 u 80 mm."), automatic: z.boolean().default(true), active: z.boolean().optional().default(true) });
const areaPrinterSchema = z.object({ areaId: z.string().min(1), printerId: z.string().min(1), copies: z.coerce.number().int().min(1).max(5).default(1), active: z.boolean().optional().default(true) });
const printSettingsSchema = z.object({ mode: z.enum(["SIMPLE", "ADVANCED"]), automatic: z.boolean(), defaultPrinterId: z.string().optional().or(z.literal("")), fields: z.array(z.enum(["table", "orderCode", "createdAt", "waiter", "customer", "delivery", "itemNotes", "orderNotes"])) });
const printRouteSchema = z.object({ targetType: z.enum(["CATEGORY", "PRODUCT"]), targetId: z.string().min(1), preparationAreaId: z.string().optional().or(z.literal("")) });
const reservationSchema = z.object({
  name: z.string().trim().min(2).max(120).optional().default("Reserva"),
  phone: z.string().trim().max(30).optional(),
  reservedAt: z.preprocess((value) => value === "" ? undefined : value, z.coerce.date().optional()),
  partySize: z.preprocess((value) => value === "" ? undefined : value, z.coerce.number().int().min(1).max(50).optional()),
  notes: z.string().trim().max(300).optional(),
});
const promotionSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,40}$/).optional().or(z.literal("")),
  kind: configuredKey,
  value: z.preprocess((value) => value === "" || value == null ? 1 : value, z.coerce.number().positive().max(100000)),
  buyQuantity: z.coerce.number().int().min(2).max(100).default(2),
  freeQuantity: z.coerce.number().int().min(1).max(99).default(1),
  scope: configuredKey,
  categoryId: z.string().optional().or(z.literal("")),
  productId: z.string().optional().or(z.literal("")),
  minSubtotal: z.coerce.number().nonnegative().max(1000000).default(0),
  maxDiscount: z.preprocess((value) => value === "" || value == null ? undefined : value, z.coerce.number().positive().max(1000000).optional()),
  automatic: z.coerce.boolean().default(true),
  weekdays: z.string().regex(/^[0-6](,[0-6])*$/).default("0,1,2,3,4,5,6"),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().or(z.literal("")),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().or(z.literal("")),
  startsAt: z.preprocess((value) => value === "" || value == null ? undefined : value, z.coerce.date().optional()),
  endsAt: z.preprocess((value) => value === "" || value == null ? undefined : value, z.coerce.date().optional()),
});
const promotionUpdateSchema = promotionSchema.extend({ active: activeValue });

function parse<TSchema extends z.ZodTypeAny>(schema: TSchema, body: unknown): z.infer<TSchema> {
  const result = schema.safeParse(body);
  if (!result.success) throw new AppError("VALIDATION_ERROR", 400, "Revisa los datos ingresados.", result.error.flatten());
  return result.data;
}


async function assertDniAvailable(scope: TenantScope, dni: string | undefined, excludeId?: string) {
  if (!dni) return;
  const duplicate = await prisma.customer.findFirst({ where: { tenantId: scope.tenantId, dni, id: excludeId ? { not: excludeId } : undefined }, select: { id: true } });
  if (duplicate) throw new AppError("DUPLICATE_DOCUMENT", 409, "Ya existe un cliente con este documento en la empresa.");
}

function validateProductConfiguration(
  input: z.infer<typeof productSchema>,
  configuration: Awaited<ReturnType<typeof getRestaurantConfiguration>>,
  storedConfiguration: boolean,
  category: { preparationArea: { id: string; name: string } | null },
) {
  if (input.areaAssignmentMode === "INHERIT_FROM_PRODUCT" && input.productType !== "ADDON") throw new AppError("ADDON_INHERITANCE_ONLY", 400, "Solo un adicional puede heredar el área de preparación de un producto base.");
  if (input.productType === "ADDON" && !configuration.menu.addonsEnabled) throw new AppError("ADDONS_DISABLED", 400, "Habilita los adicionales en la configuración de Carta antes de registrarlos.");
  if (!storedConfiguration) return;
  assertRestaurantConfigured(configuration.menu.productTypes, input.productType, "El tipo de producto");
  if (configuration.menu.requireCost && input.cost <= 0) throw new AppError("PRODUCT_COST_REQUIRED", 400, "Registra un costo mayor que cero para el producto.");
  const inheritsFromBase = input.productType === "ADDON" && input.areaAssignmentMode === "INHERIT_FROM_PRODUCT";
  if (configuration.kitchen.requirePreparationArea && !inheritsFromBase && !input.preparationAreaId && !category.preparationArea) throw new AppError("PREPARATION_AREA_REQUIRED", 400, "Selecciona un área de preparación para el producto o configura una ruta en su categoría.");
}

export async function handleRestaurantCommand(method: string, segments: string[], body: unknown, scope: TenantScope) {
  const [resource, id, action] = segments;
  if (method === "POST" && resource === "configuration" && id === "acceptance") {
    const input = parse(z.object({ check: z.enum(["TEAM_TRAINING", "FIRST_SHIFT"]), confirmed: z.literal(true), notes: z.string().trim().min(10).max(500) }), body);
    await audit(scope, "OPERATION_ACCEPTANCE", "RestaurantReadiness", input.check, { notes: input.notes, confirmedByOperator: true });
    return { ok: true, message: "Validación registrada con responsable y fecha." };
  }
  if (method === "GET" && resource === "configuration" && id === "readiness") return getRestaurantReadiness(scope);
  if (method === "GET" && resource === "configuration" && id === "history") return { versions: await getRestaurantConfigurationHistory(scope) };
  if (method === "POST" && resource === "configuration" && id === "rollback" && action) return { ok: true, configuration: await rollbackRestaurantConfiguration(action, scope), message: "Versión restaurada correctamente." };
  if (method === "PATCH" && resource === "configuration" && id) {
    const sections = new Set<RestaurantConfigurationSection>(["general", "orders", "floor", "menu", "kitchen", "sales", "delivery", "customers", "inventory", "promotions", "notifications", "integrations", "reports"]);
    if (!sections.has(id as RestaurantConfigurationSection)) throw new AppError("NOT_FOUND", 404, "La sección de configuración no existe.");
    const configuration = await saveRestaurantConfigurationSection(scope.tenantId, id as RestaurantConfigurationSection, body, scope);
    return { ok: true, id, configuration, message: "Configuración de Restaurante actualizada." };
  }
  if (method === "GET" && resource === "sunat" && id === "status") return getSunatConnectionStatus(scope.tenantId);
  if (method === "POST" && resource === "sunat" && id === "credentials") return { ok: true, status: await saveSunatCredentials(scope, parse(sunatCredentialSchema, body)), message: "Credenciales SUNAT guardadas de forma cifrada." };
  if (method === "POST" && resource === "sunat" && id === "test") return testSunatConnection(scope);
  if (method === "POST" && resource === "sales" && id && action === "electronic-document") {
    const input = parse(electronicDocumentSchema, body);
    const document = await issueRestaurantElectronicDocument(scope, id, input.kind);
    return { ok: true, id: document.id, document, message: document.status === "ISSUED" ? "Comprobante aceptado." : "Comprobante enviado; aceptación pendiente de confirmar." };
  }
  if (resource === "print-jobs") {
    const result = await handleRestaurantPrintCommand(method, segments, body, scope);
    if (result) return result;
  }
  if (method === "POST" && resource === "preparation-areas" && !id) {
    const input = parse(preparationAreaSchema, body);
    const normalized = normalizeRestaurantArea(input.name)!;
    const areas = await materializePreparationAreas(scope.tenantId, scope.branchId, [{ name: input.name, normalizedKey: normalized.key, type: input.type ?? normalized.type, source: "MANUAL", dispatchMode: input.dispatchMode, enabled: true }]);
    const area = areas.get(normalized.key);
    if (!area) throw new AppError("PREPARATION_AREA_INVALID", 400, "No se pudo normalizar el área de preparación.");
    if (!input.active) await prisma.preparationArea.update({ where: { id: area.id }, data: { active: false } });
    await audit(scope, "CREATE", "PreparationArea", area.id);
    return { ok: true, id: area.id, message: "Área de preparación creada." };
  }
  if (method === "PATCH" && resource === "preparation-areas" && id) {
    const input = parse(preparationAreaSchema, body);
    const area = await updateOwnedPreparationArea(scope.tenantId, scope.branchId, id, { name: input.name, type: input.type, source: "MANUAL", dispatchMode: input.dispatchMode, enabled: input.active });
    await audit(scope, "UPDATE", "PreparationArea", area.id, { active: input.active });
    return { ok: true, id: area.id, message: input.active ? "Área de preparación actualizada." : "Área de preparación desactivada." };
  }
  if (method === "POST" && resource === "print-devices" && !id) {
    const input = parse(printDeviceSchema, body);
    const agentToken = randomBytes(32).toString("base64url");
    const printer = await prisma.printDevice.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, name: input.name, connectionType: input.connectionType, paperWidthMm: input.paperWidthMm, automatic: input.automatic, active: input.active, tokenHash: createHash("sha256").update(agentToken).digest("hex"), tokenHint: agentToken.slice(-6) } });
    await audit(scope, "CREATE", "PrintDevice", printer.id, { connectionType: printer.connectionType });
    return { ok: true, id: printer.id, agentToken, message: `Impresora creada. Token del agente: ${agentToken}` };
  }
  if (method === "PATCH" && resource === "print-devices" && id && !action) {
    const input = parse(printDeviceSchema, body);
    const printer = await required(prisma.printDevice.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId }, select: { id: true } }), "La impresora");
    await prisma.printDevice.update({ where: { id: printer.id }, data: { name: input.name, connectionType: input.connectionType, paperWidthMm: input.paperWidthMm, automatic: input.automatic, active: input.active } });
    await audit(scope, "UPDATE", "PrintDevice", printer.id, { active: input.active });
    return { ok: true, id: printer.id, message: "Impresora actualizada." };
  }
  if (method === "POST" && resource === "print-devices" && id && action === "token") {
    const printer = await required(prisma.printDevice.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId }, select: { id: true } }), "La impresora");
    const agentToken = randomBytes(32).toString("base64url");
    await prisma.printDevice.update({ where: { id: printer.id }, data: { tokenHash: createHash("sha256").update(agentToken).digest("hex"), tokenHint: agentToken.slice(-6) } });
    await audit(scope, "ROTATE_TOKEN", "PrintDevice", printer.id);
    return { ok: true, agentToken, message: `Nuevo token del agente: ${agentToken}` };
  }
  if (method === "POST" && resource === "print-devices" && id && action === "test") {
    return withSerializableTransaction(async (tx) => {
    const printer = await required(tx.printDevice.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId, active: true }, select: { id: true, name: true, automatic: true } }), "La impresora");
    const job = await tx.restaurantPrintJob.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, orderId: null, createdById: scope.actorId, printerId: printer.id, type: "TEST", automatic: true, payload: JSON.stringify({ printerName: printer.name, sections: [{ areaId: null, areaName: "Prueba", items: [{ productId: "test", name: "IMPRESIÓN DE PRUEBA", quantity: 1, notes: "Conexión MOVENDI GO correcta" }] }], items: [{ name: "IMPRESIÓN DE PRUEBA", quantity: 1, notes: "Conexión MOVENDI GO correcta" }], orderNotes: "Si puedes leer esto, la estación está configurada." }) } });
    await tx.auditLog.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, userId: scope.actorId, action: "TEST_PRINT", entityType: "RestaurantPrintJob", entityId: job.id } });
    return { ok: true, id: job.id, message: "Impresión de prueba enviada a la cola." };
    });
  }
  if (method === "POST" && resource === "area-printers") {
    const input = parse(areaPrinterSchema, body);
    const [area, printer] = await Promise.all([
      required(prisma.preparationArea.findFirst({ where: { id: input.areaId, tenantId: scope.tenantId, branchId: scope.branchId }, select: { id: true } }), "El área de preparación"),
      required(prisma.printDevice.findFirst({ where: { id: input.printerId, tenantId: scope.tenantId, branchId: scope.branchId }, select: { id: true } }), "La impresora"),
    ]);
    const link = await prisma.$transaction(async (tx) => {
      const link = await tx.preparationAreaPrinter.upsert({ where: { areaId_printerId: { areaId: area.id, printerId: printer.id } }, create: { tenantId: scope.tenantId, branchId: scope.branchId, areaId: area.id, printerId: printer.id, copies: input.copies, active: input.active }, update: { copies: input.copies, active: input.active } });
      if (input.active) await tx.preparationArea.update({ where: { id: area.id }, data: { dispatchMode: "PRINTER" } });
      return link;
    });
    await audit(scope, "UPSERT", "PreparationAreaPrinter", link.id, { copies: input.copies, active: input.active });
    return { ok: true, id: link.id, message: input.active ? "Impresora asignada. El área enviará sus comandas a impresión en modo avanzado." : "Asignación de impresora desactivada." };
  }
  if (method === "PATCH" && resource === "print-settings") {
    const input = parse(printSettingsSchema, body);
    const printer = input.defaultPrinterId ? await required(prisma.printDevice.findFirst({ where: { id: input.defaultPrinterId, tenantId: scope.tenantId, branchId: scope.branchId, active: true }, select: { id: true } }), "La impresora principal") : null;
    const settings = await prisma.restaurantPrintSettings.upsert({ where: { branchId: scope.branchId }, create: { tenantId: scope.tenantId, branchId: scope.branchId, mode: input.mode, automatic: input.automatic, defaultPrinterId: printer?.id ?? null, fields: JSON.stringify(input.fields) }, update: { mode: input.mode, automatic: input.automatic, defaultPrinterId: printer?.id ?? null, fields: JSON.stringify(input.fields) } });
    await audit(scope, "UPDATE", "RestaurantPrintSettings", settings.id, { mode: settings.mode, automatic: settings.automatic });
    return { ok: true, id: settings.id, message: "Configuración de comandas actualizada." };
  }
  if (method === "POST" && resource === "print-routes") {
    const input = parse(printRouteSchema, body);
    const area = input.preparationAreaId ? await required(prisma.preparationArea.findFirst({ where: { id: input.preparationAreaId, tenantId: scope.tenantId, branchId: scope.branchId, active: true }, select: { id: true } }), "El área de preparación") : null;
    if (input.targetType === "CATEGORY") {
      const target = await required(prisma.category.findFirst({ where: { id: input.targetId, tenantId: scope.tenantId, branchId: scope.branchId }, select: { id: true } }), "La categoría");
      await prisma.category.update({ where: { id: target.id }, data: { preparationAreaId: area?.id ?? null } });
    } else {
      const target = await required(prisma.product.findFirst({ where: { id: input.targetId, tenantId: scope.tenantId, branchId: scope.branchId }, select: { id: true } }), "El producto");
      await prisma.product.update({ where: { id: target.id }, data: { preparationAreaId: area?.id ?? null } });
    }
    await audit(scope, "ROUTE_PRINT", input.targetType === "CATEGORY" ? "Category" : "Product", input.targetId, { preparationAreaId: area?.id ?? null });
    return { ok: true, message: "Ruta de preparación actualizada." };
  }
  if ((method === "POST" || method === "PATCH") && resource === "promotions") {
    const input = parse(method === "PATCH" ? promotionUpdateSchema : promotionSchema, body);
    const configuration = await getRestaurantConfiguration(scope.tenantId, scope.branchId);
    if (await hasStoredRestaurantConfiguration(scope.tenantId)) {
      assertRestaurantConfigured(configuration.promotions.kinds, input.kind, "El tipo de promoción");
      assertRestaurantConfigured(configuration.promotions.scopes, input.scope, "El alcance de promoción");
    }
    if (input.kind === "PERCENT" && input.value > configuration.promotions.maxPercent) throw new AppError("INVALID_PROMOTION", 400, `El descuento porcentual no puede superar ${configuration.promotions.maxPercent}%.`);
    if (input.kind === "QUANTITY" && input.freeQuantity >= input.buyQuantity) throw new AppError("INVALID_PROMOTION", 400, "Las unidades gratuitas deben ser menores que las unidades requeridas.");
    if (input.endsAt && input.startsAt && input.endsAt <= input.startsAt) throw new AppError("INVALID_PROMOTION", 400, "La fecha final debe ser posterior a la fecha inicial.");
    const [category, product, existing] = await Promise.all([
      input.scope === "CATEGORY" ? prisma.category.findFirst({ where: { id: input.categoryId, tenantId: scope.tenantId, branchId: scope.branchId, active: true }, select: { id: true } }) : null,
      input.scope === "PRODUCT" ? prisma.product.findFirst({ where: { id: input.productId, tenantId: scope.tenantId, branchId: scope.branchId, active: true }, select: { id: true } }) : null,
      method === "PATCH" && id ? prisma.promotion.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId }, select: { id: true } }) : null,
    ]);
    if (input.scope === "CATEGORY" && !category) throw new AppError("INVALID_PROMOTION", 400, "Selecciona una categoría activa de esta sede.");
    if (input.scope === "PRODUCT" && !product) throw new AppError("INVALID_PROMOTION", 400, "Selecciona un producto activo de esta sede.");
    if (method === "PATCH" && !existing) throw new AppError("NOT_FOUND", 404, "La promoción no existe en esta sede.");
    const active = "active" in input && typeof input.active === "boolean" ? input.active : undefined;
    const data = {
      name: input.name, code: input.code || null, kind: input.kind,
      value: input.kind === "FIXED" ? Math.round(input.value * 100) : input.kind === "PERCENT" ? Math.round(input.value) : 0,
      buyQuantity: input.buyQuantity, freeQuantity: input.freeQuantity,
      scope: input.scope, categoryId: category?.id ?? null, productId: product?.id ?? null,
      minSubtotalCents: Math.round(input.minSubtotal * 100), maxDiscountCents: input.maxDiscount ? Math.round(input.maxDiscount * 100) : null,
      automatic: input.automatic, weekdays: input.weekdays, startTime: input.startTime || null, endTime: input.endTime || null,
      startsAt: input.startsAt ?? null, endsAt: input.endsAt ?? null,
      ...(active !== undefined ? { active } : {}),
    };
    const entity = method === "POST"
      ? await prisma.promotion.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, ...data } })
      : await prisma.promotion.update({ where: { id: id! }, data });
    await audit(scope, method === "POST" ? "CREATE" : "UPDATE", "Promotion", entity.id, { kind: entity.kind, scope: entity.scope, code: entity.code });
    return { ok: true, id: entity.id, message: method === "POST" ? "Promoción creada correctamente." : "Promoción actualizada correctamente." };
  }
  if (method === "POST" && resource === "customers" && !id) {
    const input = parse(customerSchema, body);
    const configuration = await getRestaurantConfiguration(scope.tenantId, scope.branchId);
    const storedConfiguration = await hasStoredRestaurantConfiguration(scope.tenantId);
    if (storedConfiguration && configuration.customers.requireDocument && !input.dni) throw new AppError("CUSTOMER_DOCUMENT_REQUIRED", 400, "El documento del cliente es obligatorio según la configuración del restaurante.");
    const documentType = input.dni ? (input.documentType || configuration.customers.documentTypes.find((item) => item.active)?.key || "DNI") : null;
    const segment = input.segment || configuration.customers.segments.find((item) => item.active)?.key || null;
    if (storedConfiguration && documentType) assertRestaurantConfigured(configuration.customers.documentTypes, documentType, "El tipo de documento");
    if (storedConfiguration && segment) assertRestaurantConfigured(configuration.customers.segments, segment, "El segmento de cliente");
    await assertDniAvailable(scope, input.dni);
    const entity = await prisma.customer.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, name: input.name, dni: input.dni || null, documentType, segment, phone: input.phone || null, email: input.email || null, notes: input.notes || null } });
    await audit(scope, "CREATE", "Customer", entity.id);
    return { ok: true, id: entity.id, message: "Cliente registrado correctamente." };
  }
  if (method === "PATCH" && resource === "customers" && id) {
    const input = parse(customerUpdateSchema, body);
    const configuration = await getRestaurantConfiguration(scope.tenantId, scope.branchId);
    const customer = await required(prisma.customer.findFirst({ where: { id, tenantId: scope.tenantId }, select: { id: true } }), "El cliente");
    if (await hasStoredRestaurantConfiguration(scope.tenantId) && configuration.customers.requireDocument && !input.dni) throw new AppError("CUSTOMER_DOCUMENT_REQUIRED", 400, "El documento del cliente es obligatorio según la configuración del restaurante.");
    const documentType = input.dni ? (input.documentType || configuration.customers.documentTypes.find((item) => item.active)?.key || "DNI") : null;
    const segment = input.segment || configuration.customers.segments.find((item) => item.active)?.key || null;
    if (documentType) assertRestaurantConfigured(configuration.customers.documentTypes, documentType, "El tipo de documento");
    if (segment) assertRestaurantConfigured(configuration.customers.segments, segment, "El segmento de cliente");
    await assertDniAvailable(scope, input.dni, customer.id);
    await prisma.customer.update({ where: { id: customer.id }, data: { name: input.name, dni: input.dni || null, documentType, segment, phone: input.phone || null, email: input.email || null, notes: input.notes || null, active: input.active } });
    await audit(scope, "UPDATE", "Customer", customer.id, { active: input.active });
    return { ok: true, id: customer.id, message: "Cliente actualizado correctamente." };
  }
  if (method === "POST" && resource === "categories" && !id) {
    const input = parse(categorySchema, body);
    const entity = await prisma.category.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, name: input.name } });
    await audit(scope, "CREATE", "Category", entity.id);
    return { ok: true, id: entity.id, message: "Categoría creada correctamente." };
  }
  if (method === "PATCH" && resource === "categories" && id) {
    const input = parse(categoryUpdateSchema, body);
    const category = await required(prisma.category.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId }, select: { id: true } }), "La categoría");
    await prisma.category.update({ where: { id: category.id }, data: { name: input.name, active: input.active } });
    await audit(scope, "UPDATE", "Category", category.id, { active: input.active });
    return { ok: true, id: category.id, message: "Categoría actualizada correctamente." };
  }
  if (method === "POST" && resource === "products" && !id) {
    const input = parse(productSchema, body);
    const configuration = await getRestaurantConfiguration(scope.tenantId, scope.branchId);
    const storedConfiguration = await hasStoredRestaurantConfiguration(scope.tenantId);
    const [category, preparationArea] = await Promise.all([
      required(prisma.category.findFirst({ where: { id: input.categoryId, tenantId: scope.tenantId, branchId: scope.branchId, active: true }, select: { id: true, preparationArea: { select: { id: true, name: true } } } }), "La categoría"),
      input.preparationAreaId ? required(prisma.preparationArea.findFirst({ where: { id: input.preparationAreaId, tenantId: scope.tenantId, branchId: scope.branchId, active: true }, select: { id: true, name: true } }), "El área de preparación") : null,
    ]);
    validateProductConfiguration(input, configuration, storedConfiguration, category);
    const routedArea = preparationArea ?? category.preparationArea;
    const entity = await withSerializableTransaction(async (tx) => {
      const created = await tx.product.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, categoryId: category.id, name: input.name, description: input.description || null, priceCents: Math.round(input.price * 100), costCents: Math.round((input.cost ?? 0) * 100), taxCategory: input.taxCategory, kitchenArea: input.kitchenArea, productType: input.productType, areaAssignmentMode: input.areaAssignmentMode, detectedAreaKey: routedArea ? normalizeRestaurantArea(routedArea.name)?.key : null, preparationAreaId: input.areaAssignmentMode === "INHERIT_FROM_PRODUCT" ? null : preparationArea?.id ?? null } });
      await recordMenuHistory(tx, scope, { version: 1, source: "MANUAL", changes: [menuChange(null, created)] });
      return created;
    });
    return { ok: true, id: entity.id, message: "Producto creado correctamente." };
  }
  if (method === "PATCH" && resource === "products" && id) {
    const input = parse(productUpdateSchema, body);
    const configuration = await getRestaurantConfiguration(scope.tenantId, scope.branchId);
    const storedConfiguration = await hasStoredRestaurantConfiguration(scope.tenantId);
    const [product, category, preparationArea] = await Promise.all([
      required(prisma.product.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId }, select: { id: true } }), "El producto"),
      required(prisma.category.findFirst({ where: { id: input.categoryId, tenantId: scope.tenantId, branchId: scope.branchId, active: true }, select: { id: true, preparationArea: { select: { id: true, name: true } } } }), "La categoría"),
      input.preparationAreaId ? required(prisma.preparationArea.findFirst({ where: { id: input.preparationAreaId, tenantId: scope.tenantId, branchId: scope.branchId, active: true }, select: { id: true, name: true } }), "El área de preparación") : null,
    ]);
    validateProductConfiguration(input, configuration, storedConfiguration, category);
    const routedArea = preparationArea ?? category.preparationArea;
    await withSerializableTransaction(async (tx) => {
      const before = await tx.product.findFirstOrThrow({ where: { id: product.id, tenantId: scope.tenantId, branchId: scope.branchId } });
      const after = await tx.product.update({ where: { id: product.id }, data: { name: input.name, description: input.description || null, categoryId: category.id, priceCents: Math.round(input.price * 100), costCents: Math.round((input.cost ?? 0) * 100), taxCategory: input.taxCategory, kitchenArea: input.kitchenArea, productType: input.productType, areaAssignmentMode: input.areaAssignmentMode, detectedAreaKey: routedArea ? normalizeRestaurantArea(routedArea.name)?.key : null, preparationAreaId: input.areaAssignmentMode === "INHERIT_FROM_PRODUCT" ? null : preparationArea?.id ?? null, active: input.active } });
      await recordMenuHistory(tx, scope, { version: 1, source: "MANUAL", changes: [menuChange(before, after)] });
    });
    return { ok: true, id: product.id, message: "Producto actualizado correctamente." };
  }
  if (method === "POST" && resource === "areas" && !id) {
    const input = parse(areaSchema, body);
    const entity = await prisma.diningArea.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, name: input.name } });
    await audit(scope, "CREATE", "DiningArea", entity.id);
    return { ok: true, id: entity.id, message: "Ambiente creado correctamente." };
  }
  if (method === "PATCH" && resource === "areas" && id) {
    const input = parse(areaUpdateSchema, body);
    const area = await required(prisma.diningArea.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId }, select: { id: true } }), "El ambiente");
    await prisma.diningArea.update({ where: { id: area.id }, data: { name: input.name, active: input.active } });
    await audit(scope, "UPDATE", "DiningArea", area.id, { active: input.active });
    return { ok: true, id: area.id, message: "Ambiente actualizado correctamente." };
  }
  if (method === "POST" && resource === "tables" && !id) {
    const input = parse(tableSchema, body);
    const area = await required(prisma.diningArea.findFirst({ where: { id: input.areaId, tenantId: scope.tenantId, branchId: scope.branchId, active: true }, select: { id: true } }), "El ambiente");
    const entity = await prisma.diningTable.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, areaId: area.id, name: input.name, seats: input.seats } });
    await audit(scope, "CREATE", "DiningTable", entity.id);
    return { ok: true, id: entity.id, message: "Mesa creada correctamente." };
  }
  if (method === "PATCH" && resource === "tables" && id) {
    const input = parse(tableUpdateSchema, body);
    const [table, area] = await Promise.all([
      required(prisma.diningTable.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId }, select: { id: true, status: true } }), "La mesa"),
      required(prisma.diningArea.findFirst({ where: { id: input.areaId, tenantId: scope.tenantId, branchId: scope.branchId, active: true }, select: { id: true } }), "El ambiente"),
    ]);
    if (!input.active && table.status === "IN_SERVICE") throw new AppError("TABLE_IN_SERVICE", 409, "No puedes desactivar una mesa con atención activa.");
    const changed = await prisma.diningTable.updateMany({ where: { id: table.id, tenantId: scope.tenantId, branchId: scope.branchId, ...(!input.active ? { status: { not: "IN_SERVICE" } } : {}) }, data: { name: input.name, seats: input.seats, areaId: area.id, active: input.active } });
    if (!changed.count) throw new AppError("TABLE_IN_SERVICE", 409, "La mesa inició una atención. Actualiza antes de editarla.");
    await audit(scope, "UPDATE", "DiningTable", table.id, { active: input.active });
    return { ok: true, id: table.id, message: "Mesa actualizada correctamente." };
  }
  if (method === "GET" && resource === "tables" && id && action === "resolve-qr") {
    const token = id.trim();
    if (!/^[A-Za-z0-9_-]{12}$/.test(token)) throw new AppError("INVALID_QR", 400, "El código de mesa no es válido.");
    const table = await prisma.diningTable.findFirst({ where: { qrToken: token, tenantId: scope.tenantId, branchId: scope.branchId, active: true }, select: { id: true, name: true, status: true } });
    if (!table) throw new AppError("QR_NOT_FOUND", 404, "El QR no pertenece a una mesa activa de esta sede.");
    await audit(scope, "SCAN_QR", "DiningTable", table.id);
    return { ok: true, table };
  }
  if (method === "POST" && resource === "tables" && id && action === "qr") {
    const table = await required(prisma.diningTable.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId, active: true }, select: { id: true, name: true, qrToken: true } }), "La mesa");
    const renew = Boolean((body as { renew?: unknown } | null)?.renew);
    const qrToken = !renew && table.qrToken ? table.qrToken : randomBytes(9).toString("base64url");
    if (qrToken !== table.qrToken) await prisma.diningTable.update({ where: { id: table.id }, data: { qrToken } });
    await audit(scope, renew ? "RENEW_QR" : "GENERATE_QR", "DiningTable", table.id);
    return { ok: true, id: table.id, qrToken, qrValue: `MOVENDI-TABLE:${qrToken}`, message: renew ? "QR renovado. El anterior dejó de funcionar." : "QR de mesa disponible." };
  }
  if (method === "POST" && resource === "orders" && !id) return createRestaurantOrder(scope, parse(orderSchema, body));
  if (method === "POST" && resource === "sales" && id && action === "refund") return refundRestaurantSale(scope, id, body);
  if (method === "POST" && resource === "sales" && id && action === "credit-note") return issueRestaurantCreditNote(scope, id);
  if (method === "POST" && resource === "orders" && id && action === "queue") {
    await withSerializableTransaction(async (tx) => {
      const order = await tx.restaurantOrder.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId, status: { not: "CANCELLED" } }, include: { items: true, kitchenTicket: true } });
      if (!order?.kitchenTicket) throw new AppError("NOT_FOUND", 404, "El pedido no está disponible.");
      await claimOrder(tx, scope, order, true);
      const pending = order.items.filter((item) => item.status === "HELD");
      if (!pending.length) throw new AppError("TICKET_NOT_HELD", 409, "Los productos ya fueron enviados.");
      await tx.orderItem.updateMany({ where: { id: { in: pending.map((item) => item.id) } }, data: { status: "PENDING" } });
      await tx.kitchenTicket.update({ where: { id: order.kitchenTicket.id }, data: { status: aggregatePreparationStatus(order.items.map((line) => line.status === "HELD" ? "PENDING" : line.status)), createdAt: new Date() } });
      await createRoutedPrintJobs(tx, scope, { orderId: id, type: "ADDITION", lines: pending, orderNotes: order.notes });
    });
    await audit(scope, "QUEUE", "RestaurantOrder", id);
    return { ok: true, message: "Pedido enviado a las áreas de preparación." };
  }
  if (method === "PATCH" && resource === "orders" && id && action === "items") return addOrderItems(scope, id, parse(addItemsSchema, body));
  if (method === "PATCH" && resource === "orders" && id && action === "status") return updateOrderState(scope, id, parse(orderStatusSchema, body));
  if (method === "PATCH" && resource === "orders" && id && action === "delivery-status") {
    const input = parse(deliveryStatusSchema, body);
    const configuration = await getRestaurantConfiguration(scope.tenantId, scope.branchId);
    const order = await required(prisma.restaurantOrder.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId, source: "DELIVERY" }, select: { id: true, version: true, status: true, deliveryStatus: true } }), "El delivery");
    if (["COMPLETED", "CANCELLED"].includes(order.status) && input.status !== "DELIVERED") throw new AppError("ORDER_CLOSED", 409, "El pedido está cerrado.");
    if (await hasStoredRestaurantConfiguration(scope.tenantId)) {
      const currentStatus = configuration.delivery.statuses.find((item) => item.active && item.key === order.deliveryStatus);
      if (!currentStatus?.allowedNext.includes(input.status)) throw new AppError("INVALID_DELIVERY_TRANSITION", 409, `No se puede cambiar de ${order.deliveryStatus} a ${input.status}.`);
    }
    const updated = await prisma.restaurantOrder.updateMany({ where: { id: order.id, version: order.version }, data: { deliveryStatus: input.status, version: { increment: 1 } } });
    if (updated.count !== 1) throw new AppError("ORDER_CHANGED", 409, "El delivery cambió durante la operación. Actualiza el pedido.");
    await audit(scope, "DELIVERY_STATUS_CHANGE", "RestaurantOrder", order.id, { from: order.deliveryStatus, status: input.status });
    return { ok: true, id: order.id, message: `Delivery actualizado a ${input.status}.` };
  }
  if (method === "PATCH" && resource === "orders" && id && action === "transfer") {
    const input = parse(transferSchema, body);
    const [order, target] = await Promise.all([
      required(prisma.restaurantOrder.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId, source: "DINE_IN", status: { notIn: ["COMPLETED", "CANCELLED"] } }, select: { id: true, version: true, tableId: true } }), "El pedido"),
      required(prisma.diningTable.findFirst({ where: { id: input.tableId, tenantId: scope.tenantId, branchId: scope.branchId, active: true, status: "AVAILABLE" }, select: { id: true } }), "La mesa destino"),
    ]);
    await withSerializableTransaction(async (tx) => {
      await claimOrder(tx, scope, order);
      const claimed = await tx.diningTable.updateMany({ where: { id: target.id, status: "AVAILABLE", active: true }, data: { status: "IN_SERVICE" } });
      if (claimed.count !== 1) throw new AppError("TABLE_NOT_AVAILABLE", 409, "La mesa destino acaba de ser ocupada.");
      await tx.restaurantOrder.update({ where: { id: order.id }, data: { tableId: target.id } });
      if (order.tableId) await tx.diningTable.update({ where: { id: order.tableId }, data: { status: "AVAILABLE" } });
    });
    await audit(scope, "TRANSFER", "RestaurantOrder", order.id, { fromTableId: order.tableId, toTableId: target.id });
    return { ok: true, id: order.id, message: "Pedido trasladado a la nueva mesa." };
  }
  if (method === "PATCH" && resource === "kitchen" && id && action === "status") return updateKitchen(scope, id, parse(kitchenStatusSchema, body));
  if (method === "POST" && resource === "orders" && id && action === "checkout") return checkoutRestaurantOrder(scope, id, parse(checkoutSchema, body));
  if (method === "POST" && resource === "tables" && id && action === "clean") {
    const table = await required(prisma.diningTable.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId, status: "CLEANING" }, select: { id: true } }), "La mesa en limpieza");
    const changed = await prisma.diningTable.updateMany({ where: { id: table.id, tenantId: scope.tenantId, branchId: scope.branchId, status: "CLEANING" }, data: { status: "AVAILABLE" } });
    if (!changed.count) throw new AppError("TABLE_CHANGED", 409, "La mesa cambió de estado. Actualiza el salón.");
    await audit(scope, "CLEAN", "DiningTable", table.id);
    return { ok: true, message: "Mesa disponible nuevamente." };
  }
  if (method === "POST" && resource === "tables" && id && action === "reserve") {
    const configuration = await getRestaurantConfiguration(scope.tenantId, scope.branchId);
    if (await hasStoredRestaurantConfiguration(scope.tenantId) && !configuration.floor.reservationsEnabled) throw new AppError("RESERVATIONS_DISABLED", 409, "Las reservas están deshabilitadas para este restaurante.");
    const table = await required(prisma.diningTable.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId, active: true }, select: { id: true, status: true, seats: true } }), "La mesa");
    if (!['AVAILABLE', 'RESERVED'].includes(table.status)) throw new AppError("TABLE_BUSY", 409, "La mesa está atendiendo un pedido y no puede reservarse.");
    if (table.status === "RESERVED" && body && typeof body === "object" && Object.keys(body).length) throw new AppError("TABLE_ALREADY_RESERVED", 409, "La mesa ya tiene una reserva. Libérala explícitamente antes de registrar otra.");
    const status = table.status === "RESERVED" ? "AVAILABLE" : "RESERVED";
    const input = status === "RESERVED" ? parse(reservationSchema, body) : null;
    if (input?.partySize && input.partySize > table.seats) throw new AppError("TABLE_CAPACITY_EXCEEDED", 400, `Esta mesa admite hasta ${table.seats} personas.`);
    if (input?.reservedAt) {
      const earliest = new Date(Date.now() + configuration.floor.reservationLeadMinutes * 60_000);
      if (input.reservedAt < earliest) throw new AppError("RESERVATION_TOO_SOON", 400, `La reserva debe registrarse con al menos ${configuration.floor.reservationLeadMinutes} minutos de anticipación.`);
      if (input.phone) {
        const tolerance = configuration.floor.reservationToleranceMinutes * 60_000;
        const duplicate = await prisma.diningTable.findFirst({ where: { tenantId: scope.tenantId, branchId: scope.branchId, id: { not: table.id }, status: "RESERVED", reservationPhone: input.phone, reservationAt: { gte: new Date(input.reservedAt.getTime() - tolerance), lte: new Date(input.reservedAt.getTime() + tolerance) } }, select: { name: true } });
        if (duplicate) throw new AppError("DUPLICATE_RESERVATION", 409, `Ya existe una reserva para ese teléfono en ${duplicate.name} dentro del mismo horario.`);
      }
    }
    const changed = await prisma.diningTable.updateMany({ where: { id: table.id, tenantId: scope.tenantId, branchId: scope.branchId, active: true, status: table.status }, data: status === "RESERVED" ? {
      status,
      reservationName: input!.name,
      reservationPhone: input!.phone || null,
      reservationAt: input!.reservedAt ?? null,
      reservationPartySize: input!.partySize ?? null,
      reservationNotes: input!.notes || null,
    } : {
      status,
      reservationName: null,
      reservationPhone: null,
      reservationAt: null,
      reservationPartySize: null,
      reservationNotes: null,
    } });
    if (!changed.count) throw new AppError("TABLE_CHANGED", 409, "La mesa cambió mientras registrabas la reserva. Actualiza el salón.");
    await audit(scope, "STATUS_CHANGE", "DiningTable", table.id, { status });
    return { ok: true, id: table.id, message: status === "RESERVED" ? "Mesa reservada." : "Reserva liberada." };
  }
  if (method === "POST" && resource === "tables" && id && action === "seat") {
    const table = await required(prisma.diningTable.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId, active: true, status: "RESERVED" }, select: { id: true } }), "La mesa reservada");
    const changed = await prisma.diningTable.updateMany({ where: { id: table.id, tenantId: scope.tenantId, branchId: scope.branchId, active: true, status: "RESERVED" }, data: { status: "AVAILABLE", reservationName: null, reservationPhone: null, reservationAt: null, reservationPartySize: null, reservationNotes: null } });
    if (!changed.count) throw new AppError("TABLE_CHANGED", 409, "La reserva ya cambió de estado. Actualiza el salón.");
    await audit(scope, "SEAT", "DiningTable", table.id);
    return { ok: true, id: table.id, message: "Reserva recibida. Ya puedes abrir el pedido." };
  }
  if (method === "POST" && resource === "cash") return handleRestaurantCashCommand(id, action, body, scope);
  throw new AppError("NOT_FOUND", 404, "Operación de restaurante no encontrada.");
}
