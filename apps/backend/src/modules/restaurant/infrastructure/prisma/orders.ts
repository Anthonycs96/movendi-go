import { operationCode } from "../../server/operation-code";
import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/core/database/prisma";
import { withSerializableTransaction } from "@/core/database/transactions";
import { AppError } from "@/core/auth/errors";
import type { TenantScope } from "@/core/auth/types";
import { assertTransactionalQuota } from "@/core/platform/entitlements";
import { allocateCents } from "@/modules/invoicing/domain/allocate-cents";
import { getRestaurantConfiguration, hasStoredRestaurantConfiguration, assertRestaurantConfigured } from "../../server/configuration";
import { claimOrder } from "../../server/order-version";
import { reserveOrderIngredients, aggregatePreparationStatus, assertDiscountLimit } from "../../server/preparation";
import { calculatePromotion } from "../../server/promotions";
import { createRoutedPrintJobs } from "../../server/printing";
import type { NewOrderInput, AddItemsInput } from "../../server/order-input";
import { writeOrder } from "../../application/write-order";
import { required } from "../../server/owned";
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

export async function createRestaurantOrder(scope: TenantScope, input: NewOrderInput) {
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
  const entity = await withSerializableTransaction((tx) => writeOrder({
    claim: async () => {
      await assertTransactionalQuota(tx, scope.tenantId, "operations");
      const claimedTable = table ? await tx.diningTable.updateMany({
        where: { id: table.id, tenantId: scope.tenantId, branchId: scope.branchId, active: true, status: "AVAILABLE" },
        data: { status: "IN_SERVICE" },
      }) : null;
      if (claimedTable && claimedTable.count !== 1) throw new AppError("TABLE_NOT_AVAILABLE", 409, "La mesa acaba de ser ocupada. Abre su pedido activo o selecciona otra mesa.");
      const duplicateOrder = table ? await tx.restaurantOrder.findFirst({ where: { tenantId: scope.tenantId, branchId: scope.branchId, tableId: table.id, status: { notIn: ["COMPLETED", "CANCELLED"] } }, select: { id: true } }) : null;
      if (duplicateOrder) throw new AppError("TABLE_OCCUPIED", 409, "La mesa ya tiene un pedido activo.");
    },
    writeLines: () => tx.restaurantOrder.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, taxRatePct: configuration.general.taxRatePct, taxIncluded: configuration.general.taxIncluded, idempotencyKey: input.idempotencyKey, requestHash: input.idempotencyKey ? requestHash : null, tableId: table?.id ?? null, customerId: input.customerId || null, createdById: scope.actorId, code: operationCode(configuration.general.orderPrefix), source: input.source, status: "PLACED", notes: input.notes || null, deliveryPhone: input.source === "DELIVERY" ? input.deliveryPhone : null, deliveryAddress: input.source === "DELIVERY" ? input.deliveryAddress : null, deliveryReference: input.source === "DELIVERY" ? input.deliveryReference || null : null, deliveryFeeCents, deliveryStatus: input.source === "DELIVERY" ? "PENDING" : null, subtotalCents: promotionResult.subtotalCents, discountCents: promotionResult.discountCents, totalCents: configuredTotalCents, promotionId: promotionResult.promotion?.id ?? null, promotionName: promotionResult.promotion?.name ?? null, promotionCode: promotionResult.promotion?.code ?? null, items: { create: lines } } }),
    reserveIngredients: async (order) => { await reserveOrderIngredients(tx, scope, order.id, configuration.inventory.autoDeductRecipes, configuration.inventory.preventNegativeStock && !configuration.menu.allowOutOfStockSales); },
    updatePreparation: async (order) => { await tx.kitchenTicket.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, orderId: order.id, status: configuration.kitchen.autoQueue ? "QUEUED" : "HELD" } }); },
    print: async (order) => {
      if (configuration.kitchen.autoQueue) await createRoutedPrintJobs(tx, scope, { orderId: order.id, type: "INITIAL", lines, orderNotes: input.notes || null });
    },
    audit: async (order) => { await tx.auditLog.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, userId: scope.actorId, action: "CREATE", entityType: "RestaurantOrder", entityId: order.id, metadata: JSON.stringify({ source: input.source, tableId: table?.id ?? null, subtotalCents: promotionResult.subtotalCents, discountCents: promotionResult.discountCents, deliveryFeeCents, totalCents: configuredTotalCents, promotionId: promotionResult.promotion?.id ?? null }) } }); },
  }));
  return { ok: true, id: entity.id, message: !configuration.kitchen.autoQueue ? "Pedido guardado. Usa Enviar a cocina cuando desees iniciar la preparación." : promotionResult.discountCents ? `Pedido guardado con ${promotionResult.promotion?.name} y enviado a cocina.` : "Pedido guardado y enviado a cocina." };
}
export async function addOrderItems(scope: TenantScope, id: string, input: AddItemsInput) {
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
  await withSerializableTransaction((tx) => writeOrder({
    claim: async () => {
      await claimOrder(tx, scope, order);
      if (input.idempotencyKey) await tx.restaurantOrderRequest.create({ data: { orderId: order.id, key: input.idempotencyKey, requestHash } });
      assertDiscountLimit(promotionResult.subtotalCents, promotionResult.discountCents, configuration.sales.maxDiscountPct);
    },
    writeLines: async () => { await tx.orderItem.createMany({ data: lines }); return order; },
    reserveIngredients: async () => {
      await reserveOrderIngredients(tx, scope, order.id, configuration.inventory.autoDeductRecipes, configuration.inventory.preventNegativeStock && !configuration.menu.allowOutOfStockSales);
    },
    updatePreparation: async () => {
      await tx.restaurantOrder.update({ where: { id: order.id }, data: { status: "PLACED", subtotalCents: promotionResult.subtotalCents, discountCents: promotionResult.discountCents, totalCents: configuredOrderTotal(promotionResult.totalCents, order.deliveryFeeCents, configuration, [...order.items, ...lines]), promotionId: promotionResult.promotion?.id ?? null, promotionName: promotionResult.promotion?.name ?? null, promotionCode: promotionResult.promotion?.code ?? null } });
      const preparation = await tx.orderItem.findMany({ where: { orderId: order.id }, select: { status: true } });
      await tx.kitchenTicket.updateMany({ where: { orderId: order.id }, data: { status: aggregatePreparationStatus(preparation.map((line) => line.status)), createdAt: new Date() } });
    },
    print: async () => {
      if (configuration.kitchen.autoQueue) await createRoutedPrintJobs(tx, scope, { orderId: order.id, type: "ADDITION", lines });
    },
    audit: async () => { await tx.auditLog.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, userId: scope.actorId, action: "ADD_ITEMS", entityType: "RestaurantOrder", entityId: order.id, metadata: JSON.stringify({ subtotalCents: promotionResult.subtotalCents, discountCents: promotionResult.discountCents, lineCount: lines.length }) } }); },
  }));
  return { ok: true, id: order.id, message: configuration.kitchen.autoQueue ? "Productos agregados y nueva comanda enviada a cocina." : "Productos agregados. Usa Enviar a cocina para continuar." };
}
