import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/core/database/prisma";
import { AppError } from "@/core/auth/errors";
import { hasPermission } from "@/core/auth/permissions";
import type { TenantScope } from "@/core/auth/types";
import { audit } from "@/core/audit/audit";
import { refundRestaurantSale } from "./refunds";
import { issueRestaurantCreditNote } from "./sunat";
import { reserveOrderIngredients, cancelOrderIngredients, aggregatePreparationStatus, assertDiscountLimit } from "./preparation";
import { assertTransactionalQuota } from "@/core/platform/entitlements";
import { allocateCents } from "./money-allocation";
import { calculatePromotion } from "./promotions";
import { createRoutedPrintJobs } from "./printing";
import { consumeRestaurantSaleInventory, withInventoryTransaction } from "@/modules/inventory/server/service";
import { assertRestaurantConfigured, getRestaurantConfiguration, getRestaurantConfigurationHistory, hasStoredRestaurantConfiguration, rollbackRestaurantConfiguration, saveRestaurantConfigurationSection, type RestaurantConfigurationSection } from "./configuration";
import { loyaltyRedemptionLimit, normalizeRestaurantArea } from "@movendi/contracts";
import { materializePreparationAreas, updateOwnedPreparationArea } from "./areas";
import { getRestaurantReadiness } from "./readiness";
import { electronicDocumentSchema, getSunatConnectionStatus, issueRestaurantElectronicDocument, saveSunatCredentials, sunatCredentialSchema, testSunatConnection } from "./sunat";

const configuredKey = z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]+$/).min(1).max(80);
const customerSchema = z.object({ name: z.string().trim().min(2).max(120), documentType: configuredKey.optional().or(z.literal("")), dni: z.string().trim().max(20).optional(), segment: configuredKey.optional().or(z.literal("")), phone: z.string().trim().max(30).optional(), email: z.union([z.string().email(), z.literal("")]).optional(), notes: z.string().trim().max(500).optional() });
const categorySchema = z.object({ name: z.string().trim().min(2).max(100) });
const productSchema = z.object({ taxCategory: z.enum(["GRAVADA", "EXONERADA", "INAFECTA"]).default("GRAVADA"), name: z.string().trim().min(2).max(140), description: z.string().trim().max(400).optional(), categoryId: z.string().min(1), price: z.coerce.number().nonnegative().max(100000), cost: z.coerce.number().nonnegative().max(100000).default(0), kitchenArea: z.string().trim().min(1).max(40).optional().default("GENERAL"), productType: configuredKey.optional().default("FOOD"), areaAssignmentMode: z.enum(["INHERIT_FROM_PRODUCT", "SPECIFIC_AREA"]).optional().default("SPECIFIC_AREA"), preparationAreaId: z.string().optional().or(z.literal("")) });
const areaSchema = z.object({ name: z.string().trim().min(2).max(80) });
const tableSchema = z.object({ name: z.string().trim().min(1).max(40), seats: z.coerce.number().int().min(1).max(50), areaId: z.string().min(1) });
const orderItemsSchema = z.array(z.object({ productId: z.string().min(1), parentProductId: z.string().min(1).optional(), quantity: z.coerce.number().int().min(1).max(50), notes: z.string().trim().max(300).optional() })).min(1).max(50);
const orderSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(120).optional(),
  source: configuredKey.default("DINE_IN"),
  tableId: z.string().optional(), customerId: z.string().optional(),
  deliveryPhone: z.string().trim().max(30).optional(), deliveryAddress: z.string().trim().max(300).optional(), deliveryReference: z.string().trim().max(300).optional(),
  deliveryFee: z.coerce.number().min(0).max(10_000).default(0),
  promotionCode: z.string().trim().max(40).optional(), notes: z.string().trim().max(500).optional(),
  items: orderItemsSchema,
}).superRefine((input, context) => {
  if (input.source === "DINE_IN" && !input.tableId) context.addIssue({ code: z.ZodIssueCode.custom, path: ["tableId"], message: "Selecciona una mesa." });
});
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
const cashOpenSchema = z.object({ openingAmount: z.coerce.number().nonnegative().max(1000000), registerName: z.string().trim().min(2).max(80).default("Caja principal"), notes: z.string().trim().max(500).optional(), idempotencyKey: z.string().trim().min(8).max(120).optional() });
const activeValue = z.enum(["true", "false"]).transform((value) => value === "true");
const customerUpdateSchema = customerSchema.extend({ active: activeValue });
const categoryUpdateSchema = categorySchema.extend({ active: activeValue });
const productUpdateSchema = productSchema.extend({ active: activeValue });
const areaUpdateSchema = areaSchema.extend({ active: activeValue });
const tableUpdateSchema = tableSchema.extend({ active: activeValue });
const transferSchema = z.object({ tableId: z.string().min(1) });
const addItemsSchema = z.object({ items: orderItemsSchema, idempotencyKey: z.string().trim().min(8).max(120).optional() });
const printStationSchema = z.object({ stationId: z.string().trim().min(8).max(100) });
const printJobStatusSchema = printStationSchema.extend({ status: z.enum(["PRINTED", "FAILED"]), confirmed: z.boolean().optional(), error: z.string().trim().max(300).optional() });
const PRINT_JOB_LEASE_MS = 10 * 60 * 1000;
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
const cashCloseSchema = z.object({ countedAmount: z.coerce.number().nonnegative().max(1000000), expectedCents: z.coerce.number().int().optional(), notes: z.string().trim().max(500).optional() });
const cashMovementSchema = z.object({ type: z.enum(["IN", "OUT"]), amount: z.coerce.number().positive().max(1_000_000), reason: z.string().trim().min(3).max(200), notes: z.string().trim().max(500).optional(), idempotencyKey: z.string().trim().min(8).max(120).optional() });
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

type OrderProduct = { id: string; name: string; priceCents: number; categoryId: string; productType: string; areaAssignmentMode: string };

function parentForOrderItem(item: { productId: string; parentProductId?: string }, product: OrderProduct, availableBaseProductIds: Set<string>) {
  if (product.productType !== "ADDON" || product.areaAssignmentMode !== "INHERIT_FROM_PRODUCT") return null;
  if (item.parentProductId) {
    if (!availableBaseProductIds.has(item.parentProductId)) throw new AppError("ADDON_PARENT_INVALID", 400, `El producto base seleccionado para “${product.name}” no pertenece a este pedido.`);
    return item.parentProductId;
  }
  if (availableBaseProductIds.size === 1) return [...availableBaseProductIds][0];
  throw new AppError("ADDON_PARENT_REQUIRED", 400, `Selecciona el producto base del adicional “${product.name}” para heredar correctamente su área.`);
}

function configuredOrderTotal(amountAfterDiscountCents: number, deliveryFeeCents: number, configuration: Awaited<ReturnType<typeof getRestaurantConfiguration>>, lines: Array<{ totalCents: number; taxCategory: string }>) {
  const shares = allocateCents(amountAfterDiscountCents, lines.map((line) => line.totalCents));
  const taxable = lines.reduce((sum, line, index) => sum + (line.taxCategory === "GRAVADA" ? shares[index] : 0), 0);
  const taxCents = configuration.general.taxIncluded ? 0 : Math.round(taxable * configuration.general.taxRatePct / 100);
  const serviceChargeCents = Math.round(amountAfterDiscountCents * configuration.general.serviceChargePct / 100);
  return amountAfterDiscountCents + taxCents + serviceChargeCents + deliveryFeeCents;
}

async function required<T>(promise: Promise<T | null>, label: string): Promise<T> {
  const value = await promise;
  if (!value) throw new AppError("NOT_FOUND", 404, `${label} no existe en esta empresa o sucursal.`);
  return value;
}

// Claim the exact version that was validated. Every order mutation shares this
// guard, so checkout/cancellation cannot race an addition or kitchen update.
async function claimOrder(tx: Prisma.TransactionClient, scope: TenantScope, order: { id: string; version: number }, allowPaidPreparation = false) {
  const claimed = await tx.restaurantOrder.updateMany({
    where: { id: order.id, tenantId: scope.tenantId, branchId: scope.branchId, version: order.version, status: { notIn: allowPaidPreparation ? ["CANCELLED"] : ["COMPLETED", "CANCELLED"] } },
    data: { version: { increment: 1 } },
  });
  if (claimed.count !== 1) throw new AppError("ORDER_CHANGED", 409, "El pedido cambió durante la operación. Actualízalo antes de volver a intentar.");
}

function operationCode(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`;
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
  if (method === "GET" && resource === "print-jobs") {
    const now = new Date();
    const include = { order: { select: { code: true, source: true, notes: true, table: { select: { name: true } } } }, createdBy: { select: { name: true } } } as const;
    const [queue, failed, recentPrinted, sent] = await Promise.all([
      prisma.restaurantPrintJob.findMany({
        where: {
          tenantId: scope.tenantId,
          branchId: scope.branchId,
          ...(id ? { printerId: id } : {}),
          OR: [
            { status: "PENDING" },
            { status: "PROCESSING", leaseExpiresAt: { lte: now } },
          ],
        },
        orderBy: { createdAt: "asc" }, take: 100, include,
      }),
      prisma.restaurantPrintJob.findMany({
        where: { tenantId: scope.tenantId, branchId: scope.branchId, ...(id ? { printerId: id } : {}), status: "FAILED" },
        orderBy: { createdAt: "desc" }, take: 20, include,
      }),
      prisma.restaurantPrintJob.findMany({
        where: { tenantId: scope.tenantId, branchId: scope.branchId, ...(id ? { printerId: id } : {}), status: "PRINTED" },
        orderBy: { createdAt: "desc" }, take: 20, include,
      }),
      prisma.restaurantPrintJob.findMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId, ...(id ? { printerId: id } : {}), status: "SENT" }, orderBy: { createdAt: "asc" }, take: 50, include }),
    ]);
    const jobs = [...queue, ...failed, ...recentPrinted, ...sent];
    return { jobs: jobs.map((job) => ({ id: job.id, printerId: job.printerId, preparationAreaId: job.preparationAreaId, type: job.type, status: job.status, claimable: job.status === "PENDING" || (job.status === "PROCESSING" && Boolean(job.leaseExpiresAt && job.leaseExpiresAt <= now)), automatic: job.automatic, copies: job.copies, attempts: job.attempts, lastError: job.lastError, stationId: job.stationId, leaseExpiresAt: job.leaseExpiresAt?.toISOString() ?? null, printedAt: job.printedAt?.toISOString() ?? null, createdAt: job.createdAt.toISOString(), order: { code: job.order?.code ?? "PRUEBA", source: job.order?.source ?? "TEST", notes: job.order?.notes ?? null, tableName: job.order?.table?.name ?? null }, createdBy: job.createdBy.name, payload: (() => { try { return JSON.parse(job.payload); } catch { return { items: [] }; } })() })) };
  }
  if (method === "POST" && resource === "print-jobs" && id && action === "confirm-delivery") {
    const input = parse(z.object({ printed: z.boolean() }), body);
    const updated = await prisma.restaurantPrintJob.updateMany({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId, status: "SENT" }, data: { status: input.printed ? "PRINTED" : "FAILED", printedAt: input.printed ? new Date() : null, lastError: input.printed ? null : "El operador no recibió la comanda enviada al equipo." } });
    if (!updated.count) throw new AppError("PRINT_CHANGED", 409, "La comanda ya fue confirmada o cambió de estado.");
    await audit(scope, input.printed ? "PRINT_CONFIRMED" : "PRINT_FAILED", "RestaurantPrintJob", id);
    return { ok: true };
  }
  if (method === "POST" && resource === "print-jobs" && id && action === "claim") {
    const input = parse(printStationSchema, body);
    const now = new Date();
    const claimed = await prisma.restaurantPrintJob.updateMany({
      where: {
        id, tenantId: scope.tenantId, branchId: scope.branchId,
        OR: [
          { status: "PENDING" },
          { status: "PROCESSING", leaseExpiresAt: { lte: now } },
        ],
      },
      data: { status: "PROCESSING", stationId: input.stationId, claimedAt: now, leaseExpiresAt: new Date(now.getTime() + PRINT_JOB_LEASE_MS), attempts: { increment: 1 } },
    });
    return { ok: true, claimed: claimed.count === 1 };
  }
  if (method === "PATCH" && resource === "print-jobs" && id && action === "status") {
    const input = parse(printJobStatusSchema, body);
    if (input.status === "PRINTED" && input.confirmed !== true) throw new AppError("PRINT_CONFIRMATION_REQUIRED", 400, "Confirma que la comanda salió correctamente en papel.");
    const updated = await prisma.restaurantPrintJob.updateMany({
      where: { id, tenantId: scope.tenantId, branchId: scope.branchId, status: "PROCESSING", stationId: input.stationId, leaseExpiresAt: { gt: new Date() } },
      data: { status: input.status, lastError: input.status === "FAILED" ? input.error || "La impresora no confirmó el trabajo." : null, printedAt: input.status === "PRINTED" ? new Date() : null, leaseExpiresAt: null },
    });
    if (updated.count !== 1) throw new AppError("PRINT_JOB_NOT_CLAIMED", 409, "La comanda ya fue tomada por otra estación o su reserva venció.");
    await audit(scope, input.status === "PRINTED" ? "PRINT_COMMAND" : "PRINT_FAILED", "RestaurantPrintJob", id, { stationId: input.stationId });
    return { ok: true, message: input.status === "PRINTED" ? "Comanda marcada como impresa." : "Fallo de impresión registrado." };
  }
  if (method === "POST" && resource === "print-jobs" && id && action === "retry") {
    const updated = await prisma.restaurantPrintJob.updateMany({
      where: { id, tenantId: scope.tenantId, branchId: scope.branchId, status: "FAILED" },
      data: { status: "PENDING", deliveryAttempt: { increment: 1 }, lastError: null, printedAt: null, stationId: null, claimedAt: null, leaseExpiresAt: null },
    });
    if (updated.count !== 1) throw new AppError("PRINT_JOB_NOT_RETRYABLE", 409, "La comanda ya está en cola, en proceso o impresa.");
    await audit(scope, "REPRINT_COMMAND", "RestaurantPrintJob", id);
    return { ok: true, message: "Comanda enviada nuevamente a la estación de impresión." };
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
    const printer = await required(prisma.printDevice.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId, active: true }, select: { id: true, name: true, automatic: true } }), "La impresora");
    const job = await prisma.restaurantPrintJob.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, orderId: null, createdById: scope.actorId, printerId: printer.id, type: "TEST", automatic: true, payload: JSON.stringify({ printerName: printer.name, sections: [{ areaId: null, areaName: "Prueba", items: [{ productId: "test", name: "IMPRESIÓN DE PRUEBA", quantity: 1, notes: "Conexión MOVENDI GO correcta" }] }], items: [{ name: "IMPRESIÓN DE PRUEBA", quantity: 1, notes: "Conexión MOVENDI GO correcta" }], orderNotes: "Si puedes leer esto, la estación está configurada." }) } });
    await audit(scope, "TEST_PRINT", "RestaurantPrintJob", job.id, { printerId: printer.id });
    return { ok: true, id: job.id, message: "Impresión de prueba enviada a la cola." };
  }
  if (method === "POST" && resource === "area-printers") {
    const input = parse(areaPrinterSchema, body);
    const [area, printer] = await Promise.all([
      required(prisma.preparationArea.findFirst({ where: { id: input.areaId, tenantId: scope.tenantId, branchId: scope.branchId }, select: { id: true } }), "El área de preparación"),
      required(prisma.printDevice.findFirst({ where: { id: input.printerId, tenantId: scope.tenantId, branchId: scope.branchId }, select: { id: true } }), "La impresora"),
    ]);
    const link = await prisma.preparationAreaPrinter.upsert({ where: { areaId_printerId: { areaId: area.id, printerId: printer.id } }, create: { tenantId: scope.tenantId, branchId: scope.branchId, areaId: area.id, printerId: printer.id, copies: input.copies, active: input.active }, update: { copies: input.copies, active: input.active } });
    await audit(scope, "UPSERT", "PreparationAreaPrinter", link.id, { copies: input.copies, active: input.active });
    return { ok: true, id: link.id, message: "Impresora asignada al área." };
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
    const entity = await prisma.product.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, categoryId: category.id, name: input.name, description: input.description || null, priceCents: Math.round(input.price * 100), costCents: Math.round((input.cost ?? 0) * 100), taxCategory: input.taxCategory, kitchenArea: input.kitchenArea, productType: input.productType, areaAssignmentMode: input.areaAssignmentMode, detectedAreaKey: routedArea ? normalizeRestaurantArea(routedArea.name)?.key : null, preparationAreaId: input.areaAssignmentMode === "INHERIT_FROM_PRODUCT" ? null : preparationArea?.id ?? null } });
    await audit(scope, "CREATE", "Product", entity.id);
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
    await prisma.product.update({ where: { id: product.id }, data: { name: input.name, description: input.description || null, categoryId: category.id, priceCents: Math.round(input.price * 100), costCents: Math.round((input.cost ?? 0) * 100), taxCategory: input.taxCategory, kitchenArea: input.kitchenArea, productType: input.productType, areaAssignmentMode: input.areaAssignmentMode, detectedAreaKey: routedArea ? normalizeRestaurantArea(routedArea.name)?.key : null, preparationAreaId: input.areaAssignmentMode === "INHERIT_FROM_PRODUCT" ? null : preparationArea?.id ?? null, active: input.active } });
    await audit(scope, "UPDATE", "Product", product.id, { active: input.active });
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
  if (method === "POST" && resource === "orders" && !id) {
    const input = parse(orderSchema, body);
    const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    if (input.idempotencyKey) {
      const existing = await prisma.restaurantOrder.findUnique({ where: { tenantId_branchId_idempotencyKey: { tenantId: scope.tenantId, branchId: scope.branchId, idempotencyKey: input.idempotencyKey } }, select: { id: true, requestHash: true } });
      if (existing) {
        if (existing.requestHash !== requestHash) throw new AppError("IDEMPOTENCY_CONFLICT", 409, "Esta solicitud ya se utilizó con otro pedido.");
        return { ok: true, id: existing.id, message: "El pedido ya quedó registrado." };
      }
    }
    const configuration = await getRestaurantConfiguration(scope.tenantId, scope.branchId);
    const storedConfiguration = await hasStoredRestaurantConfiguration(scope.tenantId);
    if (storedConfiguration) assertRestaurantConfigured(configuration.orders.sources, input.source, "El origen del pedido");
    if (input.source === "DELIVERY" && storedConfiguration && !configuration.delivery.enabled) throw new AppError("DELIVERY_DISABLED", 409, "El canal delivery está deshabilitado para este restaurante.");
    if (input.source === "DELIVERY" && configuration.delivery.requireCustomer && !input.customerId) throw new AppError("DELIVERY_CUSTOMER_REQUIRED", 400, "Selecciona o registra el cliente del delivery.");
    if (input.source === "DELIVERY" && configuration.delivery.requirePhone && !input.deliveryPhone) throw new AppError("DELIVERY_PHONE_REQUIRED", 400, "Ingresa el teléfono del delivery.");
    if (input.source === "DELIVERY" && configuration.delivery.requireAddress && !input.deliveryAddress) throw new AppError("DELIVERY_ADDRESS_REQUIRED", 400, "Ingresa la dirección de entrega.");
    if (storedConfiguration && !configuration.orders.allowItemNotes && input.items.some((item) => item.notes)) throw new AppError("ITEM_NOTES_DISABLED", 400, "Las observaciones por producto están deshabilitadas.");
    const table = input.source === "DINE_IN" ? await required(prisma.diningTable.findFirst({ where: { id: input.tableId!, tenantId: scope.tenantId, branchId: scope.branchId, active: true }, select: { id: true, status: true } }), "La mesa") : null;
    if (table && table.status !== "AVAILABLE") throw new AppError("TABLE_NOT_AVAILABLE", 409, "La mesa debe estar disponible para abrir un pedido.");
    const activeOrder = table ? await prisma.restaurantOrder.findFirst({ where: { tenantId: scope.tenantId, branchId: scope.branchId, tableId: table.id, status: { notIn: ["COMPLETED", "CANCELLED"] } }, select: { id: true } }) : null;
    if (activeOrder) throw new AppError("TABLE_OCCUPIED", 409, "La mesa ya tiene un pedido activo.");
    if (input.customerId) await required(prisma.customer.findFirst({ where: { id: input.customerId, tenantId: scope.tenantId, active: true }, select: { id: true } }), "El cliente");
    const orderedProductIds = [...new Set(input.items.map((item) => item.productId))];
    const referencedProductIds = [...new Set(input.items.flatMap((item) => [item.productId, ...(item.parentProductId ? [item.parentProductId] : [])]))];
    const products = await prisma.product.findMany({ where: { id: { in: referencedProductIds }, tenantId: scope.tenantId, branchId: scope.branchId, active: true }, select: { id: true, name: true, priceCents: true, costCents: true, taxCategory: true, categoryId: true, productType: true, areaAssignmentMode: true } });
    if (products.length !== referencedProductIds.length) throw new AppError("INVALID_PRODUCTS", 400, "Uno o más productos o adicionales no pertenecen a esta sucursal.");
    const byId = new Map(products.map((item) => [item.id, item]));
    const availableBaseProductIds = new Set(orderedProductIds.filter((productId) => byId.get(productId)?.productType !== "ADDON"));
    const lines = input.items.map((item) => { const product = byId.get(item.productId)!; return { tenantId: scope.tenantId, productId: product.id, parentProductId: parentForOrderItem(item, product, availableBaseProductIds), status: configuration.kitchen.autoQueue ? "PENDING" : "HELD", name: product.name, quantity: item.quantity, unitPriceCents: product.priceCents, unitCostCents: product.costCents, taxCategory: product.taxCategory, totalCents: product.priceCents * item.quantity, notes: item.notes || null }; });
    const promotionResult = await calculatePromotion(scope, input.items.map((item) => { const product = byId.get(item.productId)!; return { productId: product.id, categoryId: product.categoryId, quantity: item.quantity, unitPriceCents: product.priceCents, unitCostCents: product.costCents, taxCategory: product.taxCategory, totalCents: product.priceCents * item.quantity }; }), input.promotionCode);
    const deliveryFeeCents = input.source === "DELIVERY" ? (input.deliveryFee > 0 ? Math.round(input.deliveryFee * 100) : configuration.delivery.defaultFeeCents) : 0;
    assertDiscountLimit(promotionResult.subtotalCents, promotionResult.discountCents, configuration.sales.maxDiscountPct);
    const configuredTotalCents = configuredOrderTotal(promotionResult.totalCents, deliveryFeeCents, configuration, lines);
    const entity = await withInventoryTransaction(async (tx) => {
      await assertTransactionalQuota(tx, scope.tenantId, "operations");
      const claimedTable = table ? await tx.diningTable.updateMany({
        where: { id: table.id, tenantId: scope.tenantId, branchId: scope.branchId, active: true, status: "AVAILABLE" },
        data: { status: "IN_SERVICE" },
      }) : null;
      if (claimedTable && claimedTable.count !== 1) throw new AppError("TABLE_NOT_AVAILABLE", 409, "La mesa acaba de ser ocupada. Abre su pedido activo o selecciona otra mesa.");
      const duplicateOrder = table ? await tx.restaurantOrder.findFirst({ where: { tenantId: scope.tenantId, branchId: scope.branchId, tableId: table.id, status: { notIn: ["COMPLETED", "CANCELLED"] } }, select: { id: true } }) : null;
      if (duplicateOrder) throw new AppError("TABLE_OCCUPIED", 409, "La mesa ya tiene un pedido activo.");
      const order = await tx.restaurantOrder.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, taxRatePct: configuration.general.taxRatePct, taxIncluded: configuration.general.taxIncluded, idempotencyKey: input.idempotencyKey, requestHash: input.idempotencyKey ? requestHash : null, tableId: table?.id ?? null, customerId: input.customerId || null, createdById: scope.actorId, code: operationCode(configuration.general.orderPrefix), source: input.source, status: "PLACED", notes: input.notes || null, deliveryPhone: input.source === "DELIVERY" ? input.deliveryPhone : null, deliveryAddress: input.source === "DELIVERY" ? input.deliveryAddress : null, deliveryReference: input.source === "DELIVERY" ? input.deliveryReference || null : null, deliveryFeeCents, deliveryStatus: input.source === "DELIVERY" ? "PENDING" : null, subtotalCents: promotionResult.subtotalCents, discountCents: promotionResult.discountCents, totalCents: configuredTotalCents, promotionId: promotionResult.promotion?.id ?? null, promotionName: promotionResult.promotion?.name ?? null, promotionCode: promotionResult.promotion?.code ?? null, items: { create: lines } } });
      await reserveOrderIngredients(tx, scope, order.id, configuration.inventory.autoDeductRecipes, configuration.inventory.preventNegativeStock && !configuration.menu.allowOutOfStockSales);
      await tx.kitchenTicket.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, orderId: order.id, status: configuration.kitchen.autoQueue ? "QUEUED" : "HELD" } });
      if (configuration.kitchen.autoQueue) await createRoutedPrintJobs(tx, scope, { orderId: order.id, type: "INITIAL", lines, orderNotes: input.notes || null });
      return order;
    });
    await audit(scope, "CREATE", "RestaurantOrder", entity.id, { source: input.source, tableId: table?.id ?? null, subtotalCents: promotionResult.subtotalCents, discountCents: promotionResult.discountCents, deliveryFeeCents, totalCents: configuredTotalCents, promotionId: promotionResult.promotion?.id ?? null });
    return { ok: true, id: entity.id, message: !configuration.kitchen.autoQueue ? "Pedido guardado. Usa Enviar a cocina cuando desees iniciar la preparación." : promotionResult.discountCents ? `Pedido guardado con ${promotionResult.promotion?.name} y enviado a cocina.` : "Pedido guardado y enviado a cocina." };
  }
  if (method === "POST" && resource === "sales" && id && action === "refund") return refundRestaurantSale(scope, id, body);
  if (method === "POST" && resource === "sales" && id && action === "credit-note") return issueRestaurantCreditNote(scope, id);
  if (method === "POST" && resource === "orders" && id && action === "queue") {
    await withInventoryTransaction(async (tx) => {
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
  if (method === "PATCH" && resource === "orders" && id && action === "items") {
    const input = parse(addItemsSchema, body);
    const requestHash = createHash("sha256").update(JSON.stringify(input.items)).digest("hex");
    if (input.idempotencyKey) {
      const previous = await prisma.restaurantOrderRequest.findFirst({ where: { orderId: id, key: input.idempotencyKey, order: { tenantId: scope.tenantId, branchId: scope.branchId } }, select: { requestHash: true } });
      if (previous) {
        if (previous.requestHash !== requestHash) throw new AppError("IDEMPOTENCY_CONFLICT", 409, "Esta solicitud ya se utilizó para otra ampliación.");
        return { ok: true, id, message: "La ampliación ya quedó registrada." };
      }
    }
    const configuration = await getRestaurantConfiguration(scope.tenantId, scope.branchId);
    const order = await required(prisma.restaurantOrder.findFirst({
      where: { id, tenantId: scope.tenantId, branchId: scope.branchId },
      select: { id: true, version: true, taxRatePct: true, taxIncluded: true, status: true, promotionCode: true, deliveryFeeCents: true, sale: { select: { id: true } }, items: { where: { status: { not: "CANCELLED" } }, select: { productId: true, quantity: true, taxCategory: true, totalCents: true, product: { select: { categoryId: true, productType: true } } } } },
    }), "El pedido");
    configuration.general.taxRatePct = order.taxRatePct ?? configuration.general.taxRatePct;
    configuration.general.taxIncluded = order.taxIncluded ?? configuration.general.taxIncluded;
    if (order.sale || ["COMPLETED", "CANCELLED"].includes(order.status)) throw new AppError("ORDER_CLOSED", 409, "El pedido ya está cerrado y no admite productos.");
    if (await hasStoredRestaurantConfiguration(scope.tenantId) && !configuration.orders.allowAddItemsAfterKitchen && order.status !== "PLACED") throw new AppError("ORDER_ITEMS_LOCKED", 409, "La configuración no permite agregar productos después de iniciar cocina.");
    if (await hasStoredRestaurantConfiguration(scope.tenantId) && !configuration.orders.allowItemNotes && input.items.some((item) => item.notes)) throw new AppError("ITEM_NOTES_DISABLED", 400, "Las observaciones por producto están deshabilitadas.");
    const referencedProductIds = [...new Set(input.items.flatMap((item) => [item.productId, ...(item.parentProductId ? [item.parentProductId] : [])]))];
    const products = await prisma.product.findMany({
      where: { id: { in: referencedProductIds }, tenantId: scope.tenantId, branchId: scope.branchId, active: true },
      select: { id: true, name: true, priceCents: true, costCents: true, taxCategory: true, categoryId: true, productType: true, areaAssignmentMode: true },
    });
    if (products.length !== referencedProductIds.length) throw new AppError("INVALID_PRODUCTS", 400, "Uno o más productos o adicionales no pertenecen a esta sucursal.");
    const byId = new Map(products.map((item) => [item.id, item]));
    const availableBaseProductIds = new Set([
      ...order.items.filter((item) => item.product.productType !== "ADDON").map((item) => item.productId),
      ...input.items.map((item) => item.productId).filter((productId) => byId.get(productId)?.productType !== "ADDON"),
    ]);
    const lines = input.items.map((item) => {
      const product = byId.get(item.productId)!;
      return { tenantId: scope.tenantId, orderId: order.id, productId: product.id, parentProductId: parentForOrderItem(item, product, availableBaseProductIds), status: configuration.kitchen.autoQueue ? "PENDING" : "HELD", name: product.name, quantity: item.quantity, unitPriceCents: product.priceCents, unitCostCents: product.costCents, taxCategory: product.taxCategory, totalCents: product.priceCents * item.quantity, notes: item.notes || null };
    });
    const promotionResult = await calculatePromotion(scope, [
      ...order.items.map((item) => ({ productId: item.productId, categoryId: item.product.categoryId, quantity: item.quantity, unitPriceCents: Math.round(item.totalCents / item.quantity), totalCents: item.totalCents })),
      ...input.items.map((item) => { const product = byId.get(item.productId)!; return { productId: product.id, categoryId: product.categoryId, quantity: item.quantity, unitPriceCents: product.priceCents, unitCostCents: product.costCents, taxCategory: product.taxCategory, totalCents: product.priceCents * item.quantity }; }),
    ], order.promotionCode);
    await withInventoryTransaction(async (tx) => {
      await claimOrder(tx, scope, order);
      if (input.idempotencyKey) await tx.restaurantOrderRequest.create({ data: { orderId: order.id, key: input.idempotencyKey, requestHash } });
      assertDiscountLimit(promotionResult.subtotalCents, promotionResult.discountCents, configuration.sales.maxDiscountPct);
      await tx.orderItem.createMany({ data: lines });
      await reserveOrderIngredients(tx, scope, order.id, configuration.inventory.autoDeductRecipes, configuration.inventory.preventNegativeStock && !configuration.menu.allowOutOfStockSales);
      await tx.restaurantOrder.update({ where: { id: order.id }, data: { status: "PLACED", subtotalCents: promotionResult.subtotalCents, discountCents: promotionResult.discountCents, totalCents: configuredOrderTotal(promotionResult.totalCents, order.deliveryFeeCents, configuration, [...order.items, ...lines]), promotionId: promotionResult.promotion?.id ?? null, promotionName: promotionResult.promotion?.name ?? null, promotionCode: promotionResult.promotion?.code ?? null } });
      const preparation = await tx.orderItem.findMany({ where: { orderId: order.id }, select: { status: true } });
      await tx.kitchenTicket.updateMany({ where: { orderId: order.id }, data: { status: aggregatePreparationStatus(preparation.map((line) => line.status)), createdAt: new Date() } });
      if (configuration.kitchen.autoQueue) await createRoutedPrintJobs(tx, scope, { orderId: order.id, type: "ADDITION", lines });
    });
    await audit(scope, "ADD_ITEMS", "RestaurantOrder", order.id, { subtotalCents: promotionResult.subtotalCents, discountCents: promotionResult.discountCents, lineCount: lines.length });
    return { ok: true, id: order.id, message: configuration.kitchen.autoQueue ? "Productos agregados y nueva comanda enviada a cocina." : "Productos agregados. Usa Enviar a cocina para continuar." };
  }
  if (method === "PATCH" && resource === "orders" && id && action === "status") {
    const input = parse(orderStatusSchema, body);
    if (input.status === "COMPLETED") throw new AppError("CHECKOUT_REQUIRED", 409, "Completa el cobro para cerrar el pedido y registrar su venta.");
    const configuration = await getRestaurantConfiguration(scope.tenantId, scope.branchId);
    const storedConfiguration = await hasStoredRestaurantConfiguration(scope.tenantId);
    const order = await required(prisma.restaurantOrder.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId }, select: { id: true, version: true, tableId: true, status: true, sale: { select: { id: true } } } }), "El pedido");
    if (order.sale || ["COMPLETED", "CANCELLED"].includes(order.status)) throw new AppError("ORDER_CLOSED", 409, "El pedido ya está cerrado y no admite cambios.");
    const currentStatus = configuration.orders.statuses.find((item) => item.active && item.key === order.status);
    if (!currentStatus?.allowedNext.includes(input.status)) throw new AppError("INVALID_STATUS_TRANSITION", 409, `No se puede cambiar de ${order.status} a ${input.status} según el flujo configurado.`);
    if (storedConfiguration && input.status === "CANCELLED" && configuration.orders.requireCancellationReason && !input.reason) throw new AppError("CANCELLATION_REASON_REQUIRED", 400, "Selecciona o escribe el motivo de cancelación.");
    if (input.status === "CANCELLED") {
      await withInventoryTransaction(async (tx) => {
        await claimOrder(tx, scope, order);
        await cancelOrderIngredients(tx, scope, order.id, input.reason || "Pedido cancelado");
        await tx.restaurantOrder.update({ where: { id: order.id }, data: { status: "CANCELLED", completedAt: new Date(), notes: input.reason || undefined } });
        await tx.kitchenTicket.updateMany({ where: { orderId: order.id }, data: { status: "CANCELLED" } });
        await tx.orderItem.updateMany({ where: { orderId: order.id }, data: { status: "CANCELLED" } });
        if (order.tableId) await tx.diningTable.update({ where: { id: order.tableId }, data: { status: "AVAILABLE" } });
        await createRoutedPrintJobs(tx, scope, { orderId: order.id, type: "CANCELLATION", lines: [], orderNotes: "PEDIDO COMPLETO ANULADO" });
      });
    } else {
      await withInventoryTransaction(async (tx) => {
        await claimOrder(tx, scope, order);
        await tx.restaurantOrder.update({ where: { id: order.id }, data: { status: input.status } });
        if (["PREPARING", "READY", "SERVED"].includes(input.status)) {
          const areas = await tx.orderItem.findMany({ where: { orderId: order.id, status: { notIn: ["CANCELLED", "SERVED"] } }, select: { preparationAreaKey: true } });
          if (new Set(areas.map((line) => line.preparationAreaKey)).size > 1) throw new AppError("USE_KITCHEN_STATIONS", 409, "Actualiza cada área desde Cocina para conservar su avance independiente.");
          await tx.kitchenTicket.updateMany({ where: { orderId: order.id }, data: { status: input.status } });
          await tx.orderItem.updateMany({ where: { orderId: order.id, status: { not: "CANCELLED" } }, data: { status: input.status } });
        }
      });
    }
    await audit(scope, "STATUS_CHANGE", "RestaurantOrder", order.id, { status: input.status });
    return { ok: true, message: "Estado del pedido actualizado." };
  }
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
    await withInventoryTransaction(async (tx) => {
      await claimOrder(tx, scope, order);
      const claimed = await tx.diningTable.updateMany({ where: { id: target.id, status: "AVAILABLE", active: true }, data: { status: "IN_SERVICE" } });
      if (claimed.count !== 1) throw new AppError("TABLE_NOT_AVAILABLE", 409, "La mesa destino acaba de ser ocupada.");
      await tx.restaurantOrder.update({ where: { id: order.id }, data: { tableId: target.id } });
      if (order.tableId) await tx.diningTable.update({ where: { id: order.tableId }, data: { status: "AVAILABLE" } });
    });
    await audit(scope, "TRANSFER", "RestaurantOrder", order.id, { fromTableId: order.tableId, toTableId: target.id });
    return { ok: true, id: order.id, message: "Pedido trasladado a la nueva mesa." };
  }
  if (method === "PATCH" && resource === "kitchen" && id && action === "status") {
    const input = parse(kitchenStatusSchema, body);
    const configuration = await getRestaurantConfiguration(scope.tenantId, scope.branchId);
    const ticket = await required(prisma.kitchenTicket.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId }, select: { id: true, orderId: true, status: true, order: { select: { id: true, version: true, tableId: true, source: true, status: true, sale: { select: { id: true } } } } } }), "La comanda");
    if (["SERVED", "CANCELLED", "HELD"].includes(ticket.status) || ticket.order.status === "CANCELLED") throw new AppError("TICKET_CLOSED", 409, "La comanda ya está cerrada y no admite cambios.");
    await withInventoryTransaction(async (tx) => {
      if (ticket.order.sale && input.status === "CANCELLED") throw new AppError("REFUND_REQUIRED", 409, "Este pedido está pagado. Registra la devolución desde la venta.");
      await claimOrder(tx, scope, ticket.order, true);
      const lines = await tx.orderItem.findMany({ where: { orderId: ticket.orderId, tenantId: scope.tenantId, status: { not: "CANCELLED" } } });
      const selected = input.itemIds ? lines.filter((line) => input.itemIds!.includes(line.id)) : lines.filter((line) => line.status !== "SERVED");
      if (!selected.length || (input.itemIds && selected.length !== new Set(input.itemIds).size)) throw new AppError("INVALID_TICKET_ITEMS", 400, "Los productos seleccionados no pertenecen a esta comanda.");
      if (input.status === "CANCELLED" && input.itemIds) throw new AppError("CANCEL_WHOLE_ORDER", 409, "Anula el pedido completo desde Pedidos para conciliar insumos e importes.");
      if (input.status === "CANCELLED" && !configuration.kitchen.allowKitchenCancellation) throw new AppError("KITCHEN_CANCELLATION_DISABLED", 409, "La cancelación desde cocina está deshabilitada.");
      if (!input.itemIds && input.status !== "CANCELLED" && new Set(selected.map((line) => line.preparationAreaKey)).size > 1) throw new AppError("SELECT_PREPARATION_AREA", 409, "Selecciona los productos del área que estás preparando.");
      for (const line of selected) {
        const current = line.status === "PENDING" ? "QUEUED" : line.status;
        const allowed = configuration.kitchen.ticketStatuses.find((status) => status.active && status.key === current)?.allowedNext ?? [];
        if (!allowed.includes(input.status)) throw new AppError("INVALID_KITCHEN_TRANSITION", 409, `No se puede cambiar ${line.name} de ${current} a ${input.status}.`);
      }
      if (input.status === "CANCELLED") await cancelOrderIngredients(tx, scope, ticket.orderId, "Comanda anulada desde cocina");
      await tx.orderItem.updateMany({ where: { id: { in: selected.map((line) => line.id) }, tenantId: scope.tenantId, orderId: ticket.orderId }, data: { status: input.status } });
      const remaining = await tx.orderItem.findMany({ where: { orderId: ticket.orderId }, select: { status: true } });
      const aggregate = aggregatePreparationStatus(remaining.map((line) => line.status));
      await tx.kitchenTicket.update({ where: { id: ticket.id }, data: { status: aggregate } });
      await tx.restaurantOrder.update({ where: { id: ticket.orderId }, data: { status: ticket.order.sale ? "COMPLETED" : aggregate === "QUEUED" ? "PLACED" : aggregate, completedAt: aggregate === "CANCELLED" ? new Date() : undefined, ...(ticket.order.source === "DELIVERY" && ["READY", "CANCELLED"].includes(aggregate) ? { deliveryStatus: aggregate } : {}) } });
      if (aggregate === "SERVED" && ticket.order.sale && ticket.order.tableId) await tx.diningTable.update({ where: { id: ticket.order.tableId }, data: { status: configuration.floor.cleaningRequired ? "CLEANING" : "AVAILABLE" } });
      if (aggregate === "CANCELLED" && ticket.order.tableId) await tx.diningTable.update({ where: { id: ticket.order.tableId }, data: { status: "AVAILABLE" } });
      if (aggregate === "CANCELLED") await createRoutedPrintJobs(tx, scope, { orderId: ticket.orderId, type: "CANCELLATION", lines: [], orderNotes: "COMANDA ANULADA DESDE COCINA" });
    });
    await audit(scope, "STATUS_CHANGE", "KitchenTicket", ticket.id, { status: input.status });
    return { ok: true, message: "Comanda actualizada." };
  }
  if (method === "POST" && resource === "orders" && id && action === "checkout") {
    const input = parse(checkoutSchema, body);
    const configuration = await getRestaurantConfiguration(scope.tenantId, scope.branchId);
    const order = await required(prisma.restaurantOrder.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId }, include: { sale: true, kitchenTicket: true } }), "El pedido");
    if (order.sale) throw new AppError("ALREADY_PAID", 409, "El pedido ya fue cobrado.");
    if (["COMPLETED", "CANCELLED"].includes(order.status)) throw new AppError("ORDER_CLOSED", 409, "El pedido está cerrado y no puede cobrarse.");
    const customer = order.customerId ? await prisma.customer.findFirst({ where: { id: order.customerId, tenantId: scope.tenantId, active: true }, select: { loyaltyPoints: true } }) : null;
    const club = configuration.customers;
    if (input.redeemPoints && (!club.loyaltyEnabled || !club.redemptionEnabled || !customer)) throw new AppError("REDEMPTION_UNAVAILABLE", 409, "Activa el canje y vincula un cliente activo al pedido.");
    const maximumPoints = loyaltyRedemptionLimit(order.totalCents, order.deliveryFeeCents, order.subtotalCents, order.discountCents, configuration.sales.maxDiscountPct, club.maxRedemptionPct, club.pointValueCents, customer?.loyaltyPoints ?? 0);
    if (input.redeemPoints > maximumPoints) throw new AppError("REDEMPTION_LIMIT", 409, `Puedes canjear hasta ${maximumPoints} puntos en este pedido. Actualiza el saldo.`);
    const loyaltyDiscountCents = input.redeemPoints * club.pointValueCents;
    const payableCents = order.totalCents - loyaltyDiscountCents;
    const cash = await prisma.cashSession.findFirst({ where: { tenantId: scope.tenantId, branchId: scope.branchId, status: "OPEN" }, orderBy: { openedAt: "desc" } });
    if (!cash && configuration.sales.requireOpenCash) throw new AppError("CASH_CLOSED", 409, "Abre una caja antes de cobrar.");
    const payments = input.payments?.length
      ? input.payments.map((payment) => ({ method: payment.method, amountCents: Math.round(payment.amount * 100), reference: payment.reference || null }))
      : [{ method: input.paymentMethod!, amountCents: payableCents, reference: null }];
    if (payments.length > 1 && !configuration.sales.splitPaymentsEnabled) throw new AppError("SPLIT_PAYMENTS_DISABLED", 409, "Los pagos divididos no están habilitados para esta sede.");
    for (const payment of payments) assertRestaurantConfigured(configuration.sales.paymentMethods, payment.method, "El método de pago");
    const paidCents = payments.reduce((sum, payment) => sum + payment.amountCents, 0);
    if (paidCents !== payableCents) throw new AppError("PAYMENT_TOTAL_MISMATCH", 400, `Los pagos deben sumar exactamente S/ ${(payableCents / 100).toFixed(2)}.`);
    const cashPaidCents = payments.filter((payment) => payment.method === "CASH").reduce((sum, payment) => sum + payment.amountCents, 0);
    if (input.receivedAmount !== undefined && cashPaidCents === 0) throw new AppError("INVALID_TENDER", 400, "El efectivo recibido solo corresponde a pagos en efectivo.");
    if (input.receivedAmount !== undefined && Math.round(input.receivedAmount * 100) < cashPaidCents) throw new AppError("INSUFFICIENT_TENDER", 400, "El efectivo recibido es menor al efectivo a cobrar.");
    const sale = await withInventoryTransaction(async (tx) => {
      await claimOrder(tx, scope, order);
      if (input.redeemPoints && order.customerId) {
        const redeemed = await tx.customer.updateMany({ where: { id: order.customerId, tenantId: scope.tenantId, active: true, loyaltyPoints: { gte: input.redeemPoints } }, data: { loyaltyPoints: { decrement: input.redeemPoints } } });
        if (!redeemed.count) throw new AppError("POINTS_CHANGED", 409, "El saldo de puntos cambió. Actualiza antes de cobrar.");
      }
      if (cash) {
        const updated = await tx.cashSession.updateMany({ where: { id: cash.id, status: "OPEN" }, data: { expectedCents: { increment: cashPaidCents } } });
        if (updated.count !== 1) throw new AppError("CASH_CLOSED", 409, "La caja se cerró durante el cobro. Actualiza la operación.");
      }
      const created = await tx.sale.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, customerId: order.customerId, cashReceivedCents: input.receivedAmount !== undefined ? Math.round(input.receivedAmount * 100) : null, changeCents: input.receivedAmount !== undefined ? Math.round(input.receivedAmount * 100) - cashPaidCents : null, loyaltyPointsRedeemed: input.redeemPoints, loyaltyDiscountCents, loyaltyPointsEarned: configuration.customers.loyaltyEnabled && order.customerId ? Math.floor((payableCents / 100) * configuration.customers.pointsPerCurrencyUnit) : 0, orderId: order.id, cashSessionId: cash?.id ?? null, cashierId: scope.actorId, code: operationCode(configuration.general.salePrefix), paymentMethod: payments.length > 1 ? "SPLIT" : payments[0].method, subtotalCents: order.subtotalCents, discountCents: order.discountCents + loyaltyDiscountCents, promotionName: order.promotionName, totalCents: payableCents, payments: { create: payments.map((payment) => ({ tenantId: scope.tenantId, branchId: scope.branchId, method: payment.method, amountCents: payment.amountCents, reference: payment.reference })) } } });
      await consumeRestaurantSaleInventory(tx, scope, order.id, created.id, configuration.inventory.preventNegativeStock && !configuration.menu.allowOutOfStockSales, configuration.inventory.autoDeductRecipes);
      await tx.restaurantOrder.update({ where: { id: order.id }, data: { status: "COMPLETED", completedAt: new Date(), totalCents: payableCents, discountCents: order.discountCents + loyaltyDiscountCents } });
      if (configuration.customers.loyaltyEnabled && order.customerId) await tx.customer.update({ where: { id: order.customerId }, data: { loyaltyPoints: { increment: created.loyaltyPointsEarned } } });
      if (order.tableId && (!order.kitchenTicket || order.kitchenTicket.status === "SERVED")) await tx.diningTable.update({ where: { id: order.tableId }, data: { status: configuration.floor.cleaningRequired ? "CLEANING" : "AVAILABLE" } });
      await tx.auditLog.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, userId: scope.actorId, action: "CHECKOUT", entityType: "Sale", entityId: created.id, metadata: JSON.stringify({ orderId: order.id, cashSessionId: cash?.id, payments, loyaltyPointsRedeemed: input.redeemPoints, loyaltyDiscountCents, cashReceivedCents: created.cashReceivedCents, changeCents: created.changeCents }) } });
      return created;
    });
    let electronicDocumentMessage = "";
    if (configuration.integrations.sunatEnabled && configuration.integrations.sunatAutoIssue) {
      try {
        const customer = order.customerId ? await prisma.customer.findUnique({ where: { id: order.customerId }, select: { documentType: true } }) : null;
        const document = await issueRestaurantElectronicDocument(scope, sale.id, customer?.documentType === "RUC" ? "FACTURA" : "BOLETA");
        electronicDocumentMessage = document.status === "ISSUED" ? " Comprobante aceptado." : " Comprobante enviado; aceptación pendiente.";
      } catch { electronicDocumentMessage = " La venta quedó registrada; revisa el comprobante electrónico pendiente."; }
    }
    return { ok: true, id: sale.id, message: `Venta registrada.${order.kitchenTicket && order.kitchenTicket.status !== "SERVED" ? " La preparación y entrega siguen pendientes en Cocina." : order.tableId ? " Mesa enviada a limpieza." : ""}${electronicDocumentMessage}` };
  }
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
  if (method === "POST" && resource === "cash" && !id) {
    const input = parse(cashOpenSchema, body);
    const openingCents = Math.round(input.openingAmount * 100);
    const requestId = input.idempotencyKey ? 'cash_' + createHash('sha256').update(scope.tenantId + ':' + scope.branchId + ':' + input.idempotencyKey).digest('hex') : undefined;
    const entity = await withInventoryTransaction(async (tx) => {
      if (requestId) {
        const replay = await tx.cashSession.findUnique({ where: { id: requestId } });
        if (replay) {
          if (replay.openingCents !== openingCents || replay.registerName !== input.registerName || (replay.openingNote ?? '') !== (input.notes ?? '')) throw new AppError("IDEMPOTENCY_CONFLICT", 409, "Esta solicitud corresponde a otra apertura.");
          return replay;
        }
      }
      const existing = await tx.cashSession.findFirst({ where: { tenantId: scope.tenantId, branchId: scope.branchId, status: "OPEN" } });
      if (existing) throw new AppError("CASH_ALREADY_OPEN", 409, "Ya existe una caja abierta en esta sede.");
      const created = await tx.cashSession.create({ data: { id: requestId, tenantId: scope.tenantId, branchId: scope.branchId, openedById: scope.actorId, openingCents, expectedCents: openingCents, registerName: input.registerName, openingNote: input.notes || null, activeSlot: "OPEN" } });
      await tx.auditLog.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, userId: scope.actorId, action: "OPEN", entityType: "CashSession", entityId: created.id, metadata: JSON.stringify({ openingCents, registerName: input.registerName, notes: input.notes }) } });
      return created;
    });
    return { ok: true, id: entity.id, message: "Caja abierta correctamente." };
  }
  if (method === "POST" && resource === "cash" && id && action === "close") {
    const input = parse(cashCloseSchema, body);
    const cash = await required(prisma.cashSession.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId, status: "OPEN" }, select: { id: true, expectedCents: true } }), "La caja");
    if (input.expectedCents !== undefined && input.expectedCents !== cash.expectedCents) throw new AppError("CASH_CHANGED", 409, "La caja cambió. Actualiza el resumen antes de confirmar el cierre.");
    const countedCents = Math.round(input.countedAmount * 100);
    const configuration = await getRestaurantConfiguration(scope.tenantId, scope.branchId);
    const differenceCents = countedCents - cash.expectedCents;
    if (Math.abs(differenceCents) > configuration.sales.cashDifferenceToleranceCents && !hasPermission(scope.permissions, "restaurant:cash:approve")) throw new AppError("CASH_DIFFERENCE_APPROVAL_REQUIRED", 403, `La diferencia supera la tolerancia de S/ ${(configuration.sales.cashDifferenceToleranceCents / 100).toFixed(2)} y requiere un responsable con permiso de aprobación.`);
    if (Math.abs(differenceCents) > configuration.sales.cashDifferenceToleranceCents && (input.notes?.length ?? 0) < 5) throw new AppError("CASH_DIFFERENCE_REASON_REQUIRED", 400, "Explica el motivo de la diferencia (al menos 5 caracteres).");
    await withInventoryTransaction(async (tx) => {
      const closed = await tx.cashSession.updateMany({ where: { id: cash.id, status: "OPEN", expectedCents: cash.expectedCents }, data: { status: "CLOSED", activeSlot: null, countedCents, closedById: scope.actorId, closedAt: new Date(), closingNote: input.notes || null } });
      if (closed.count !== 1) throw new AppError("CASH_CHANGED", 409, "La caja cambió mientras se cerraba. Actualiza los importes antes de cerrar.");
      await tx.auditLog.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, userId: scope.actorId, action: "CLOSE", entityType: "CashSession", entityId: cash.id, metadata: JSON.stringify({ expectedCents: cash.expectedCents, countedCents, differenceCents, notes: input.notes }) } });
    });
    return { ok: true, id: cash.id, message: `Caja cerrada. Diferencia: S/ ${(differenceCents / 100).toFixed(2)}.` };
  }
  if (method === "POST" && resource === "cash" && id && action === "movement") {
    const input = parse(cashMovementSchema, body);
    if (input.type === "OUT" && !hasPermission(scope.permissions, "restaurant:cash:approve")) throw new AppError("CASH_OUT_APPROVAL_REQUIRED", 403, "Los retiros requieren un rol con permiso para aprobar movimientos de caja.");
    const movementId = input.idempotencyKey ? `cm_${createHash("sha256").update(`${scope.tenantId}:${scope.branchId}:${id}:${input.idempotencyKey}`).digest("hex")}` : undefined;
    if (movementId) {
      const existing = await prisma.cashMovement.findUnique({ where: { id: movementId } });
      if (existing) {
        if (existing.type !== input.type || existing.amountCents !== Math.round(input.amount * 100) || existing.reason !== input.reason || (existing.notes ?? "") !== (input.notes ?? "")) throw new AppError("IDEMPOTENCY_CONFLICT", 409, "Esta solicitud ya se utilizó para otro movimiento de caja.");
        return { ok: true, id: existing.id, message: "El movimiento ya quedó registrado." };
      }
    }
    const cash = await required(prisma.cashSession.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId, status: "OPEN" }, select: { id: true } }), "La caja abierta");
    const amountCents = Math.round(input.amount * 100);
    if (amountCents <= 0) throw new AppError("INVALID_AMOUNT", 400, "El movimiento debe ser de al menos S/ 0.01.");
    const movement = await withInventoryTransaction(async (tx) => {
      if (movementId) {
        const replay = await tx.cashMovement.findUnique({ where: { id: movementId } });
        if (replay) {
          if (replay.type !== input.type || replay.amountCents !== amountCents || replay.reason !== input.reason || (replay.notes ?? "") !== (input.notes ?? "")) throw new AppError("IDEMPOTENCY_CONFLICT", 409, "La solicitud corresponde a otro movimiento.");
          return replay;
        }
      }
      const updated = await tx.cashSession.updateMany({ where: { id: cash.id, status: "OPEN", ...(input.type === "OUT" ? { expectedCents: { gte: amountCents } } : {}) }, data: { expectedCents: { increment: input.type === "IN" ? amountCents : -amountCents } } });
      if (updated.count !== 1) throw new AppError("CASH_UNAVAILABLE", 409, "La caja está cerrada o no tiene efectivo suficiente para el retiro.");
      const created = await tx.cashMovement.create({ data: { id: movementId, tenantId: scope.tenantId, branchId: scope.branchId, cashSessionId: cash.id, createdById: scope.actorId, type: input.type, amountCents, reason: input.reason, notes: input.notes || null } });
      await tx.auditLog.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, userId: scope.actorId, action: input.type === "IN" ? "CASH_IN" : "CASH_OUT", entityType: "CashMovement", entityId: created.id, metadata: JSON.stringify({ cashSessionId: cash.id, amountCents, reason: input.reason, notes: input.notes }) } });
      return created;
    });
    return { ok: true, id: movement.id, message: input.type === "IN" ? "Ingreso de caja registrado." : "Retiro de caja registrado." };
  }
  throw new AppError("NOT_FOUND", 404, "Operación de restaurante no encontrada.");
}
