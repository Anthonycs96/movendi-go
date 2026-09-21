import { refundView } from "./refund-view";
import "server-only";
import { prisma } from "@/core/database/prisma";
import type { TenantScope } from "@/core/auth/types";
import type { RestaurantData, RestaurantOrderDto, RestaurantReportPeriod } from "../types";
import { getRestaurantReports } from "./reports";
import { getRestaurantConfiguration } from "./configuration";
import { hasPermission } from "@/core/auth/permissions";
import { restaurantBusinessDay } from "./business-day";

export async function getRestaurantData(scope: TenantScope, reportPeriod?: RestaurantReportPeriod | null, section?: string | null): Promise<RestaurantData> {
  const needed = (...sections: string[]) => !section || sections.includes(section);
  const [configuration, membership, tenant] = await Promise.all([
    getRestaurantConfiguration(scope.tenantId, scope.branchId),
    prisma.membership.findFirst({ where: { tenantId: scope.tenantId, userId: scope.actorId, active: true }, select: { role: { select: { key: true } } } }),
    prisma.tenant.findUniqueOrThrow({ where: { id: scope.tenantId }, select: { timezone: true } }),
  ]);
  const canApproveRefund = hasPermission(scope.permissions, "restaurant:cash:write") && (hasPermission(scope.permissions, "restaurant:cash:approve") || configuration.sales.approvalRoleKeys.includes(membership?.role.key ?? ""));
  const canMenu = needed("menu", "floor", "orders", "promotions", "settings") && (hasPermission(scope.permissions, "restaurant:menu:read") || hasPermission(scope.permissions, "restaurant:floor:read") || hasPermission(scope.permissions, "restaurant:orders:write"));
  const canPromotions = needed("promotions", "floor", "orders") && (hasPermission(scope.permissions, "restaurant:promotions:read") || hasPermission(scope.permissions, "restaurant:floor:read") || hasPermission(scope.permissions, "restaurant:orders:write"));
  const canPrinting = needed("kitchen", "menu", "settings", "checkout", "floor", "orders") && (hasPermission(scope.permissions, "restaurant:printing:read"));
  const canFloor = needed("floor", "orders", "settings", "dashboard") && (hasPermission(scope.permissions, "restaurant:floor:read"));
  const canCustomers = needed("clients", "orders", "floor") && (hasPermission(scope.permissions, "customers:read"));
  const canOrders = needed("floor", "orders", "kitchen", "checkout", "settings", "dashboard") && (hasPermission(scope.permissions, "restaurant:floor:read") || hasPermission(scope.permissions, "restaurant:orders:read") || hasPermission(scope.permissions, "restaurant:kitchen:read") || hasPermission(scope.permissions, "restaurant:cash:read"));
  const canSales = needed("checkout") && (hasPermission(scope.permissions, "restaurant:cash:read") || hasPermission(scope.permissions, "restaurant:reports:read"));
  const canCash = needed("checkout", "floor", "orders") && (hasPermission(scope.permissions, "restaurant:cash:read"));
  const canReports = needed("reports") && (hasPermission(scope.permissions, "restaurant:reports:read"));
  const canConfiguration = hasPermission(scope.permissions, "restaurant:configuration:read");
  const canDashboard = needed("dashboard") && (hasPermission(scope.permissions, "dashboard:read"));
  const { start, end } = restaurantBusinessDay(new Date(), tenant.timezone, configuration.reports.cutoffHour);
  const preparationProductSelect = { productType: true, kitchenArea: true, areaAssignmentMode: true, preparationArea: { select: { id: true, name: true } }, category: { select: { preparationArea: { select: { id: true, name: true } } } } } as const;
  const orderInclude = {
    table: { select: { id: true, name: true } },
    customer: { select: { id: true, name: true, loyaltyPoints: canCash, active: canCash } },
    createdBy: { select: { id: true, name: true } },
    items: { select: { stockModeSnapshot: true, recipeSnapshot: true, preparationAreaKey: true, preparationAreaName: true, id: true, productId: true, parentProductId: true, name: true, quantity: true, totalCents: true, status: true, notes: true, startedAt: true, readyAt: true, servedAt: true, startedByUserId: true, readyByUserId: true, servedByUserId: true, product: { select: preparationProductSelect }, parentProduct: { select: preparationProductSelect } } },
    kitchenTicket: { select: { id: true, status: true, createdAt: true } },
    sale: { select: { id: true } },
  } as const;

  const [categories, products, promotions, preparationAreas, printDevices, printSettings, areas, tables, customers, orders, sales, checkoutAudits, cashSession, reports, dailySales] = await Promise.all([
    canMenu ? prisma.category.findMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId }, orderBy: { name: "asc" }, select: { id: true, name: true, active: true, preparationArea: { select: { id: true, name: true } } } }) : Promise.resolve([]),
    canMenu ? prisma.product.findMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId }, orderBy: [{ sortOrder: "asc" }, { active: "desc" }, { name: "asc" }], include: { inventoryItem: true, category: { select: { id: true, name: true } }, preparationArea: { select: { id: true, name: true } } } }) : Promise.resolve([]),
    canPromotions ? prisma.promotion.findMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId }, orderBy: [{ active: "desc" }, { createdAt: "desc" }] }) : Promise.resolve([]),
    (canMenu || canPrinting) ? prisma.preparationArea.findMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId }, orderBy: [{ active: "desc" }, { name: "asc" }], include: { printerLinks: { include: { printer: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } } } }) : Promise.resolve([]),
    canPrinting ? prisma.printDevice.findMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId }, orderBy: [{ active: "desc" }, { name: "asc" }] }) : Promise.resolve([]),
    canPrinting ? prisma.restaurantPrintSettings.findUnique({ where: { branchId: scope.branchId } }) : Promise.resolve(null),
    canFloor ? prisma.diningArea.findMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId }, orderBy: [{ active: "desc" }, { name: "asc" }], select: { id: true, name: true, active: true } }) : Promise.resolve([]),
    (canFloor || canDashboard) ? prisma.diningTable.findMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId }, orderBy: { name: "asc" }, include: { area: { select: { id: true, name: true } }, orders: { where: { status: { notIn: ["COMPLETED", "CANCELLED"] } }, orderBy: { createdAt: "desc" }, take: 1, select: { id: true, code: true, totalCents: true, status: true } } } }) : Promise.resolve([]),
    canCustomers ? prisma.customer.findMany({ where: { tenantId: scope.tenantId }, orderBy: [{ active: "desc" }, { name: "asc" }], select: { id: true, name: true, dni: true, documentType: true, segment: true, loyaltyPoints: true, phone: true, email: true, notes: true, active: true } }) : Promise.resolve([]),
    (canOrders || canDashboard) ? Promise.all([
      prisma.restaurantOrder.findMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId, OR: [{ status: { notIn: ["COMPLETED", "CANCELLED"] } }, { status: "COMPLETED", kitchenTicket: { status: { notIn: ["SERVED", "CANCELLED"] } } }] }, orderBy: { createdAt: "desc" }, include: orderInclude }),
      needed("orders", "checkout", "dashboard") ? prisma.restaurantOrder.findMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId, status: { in: ["COMPLETED", "CANCELLED"] }, NOT: { status: "COMPLETED", kitchenTicket: { status: { notIn: ["SERVED", "CANCELLED"] } } } }, orderBy: { createdAt: "desc" }, take: 100, include: orderInclude }) : [],
    ]).then(([active, recent]) => [...active, ...recent].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) : Promise.resolve([]),
    (canSales || canDashboard) ? prisma.sale.findMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId, orderId: { not: null } }, orderBy: { createdAt: "desc" }, take: 50, include: { refund: { select: { id: true, creditStatus: true, reason: true, creditError: true, creditResponse: true } }, electronicDocument: { select: { id: true, kind: true, series: true, number: true, status: true, pdfUrl: true, xmlUrl: true, cdrUrl: true, lastError: true } }, payments: { select: { id: true, method: true, amountCents: true, reference: true } }, cashier: { select: { id: true, name: true } }, order: { select: { code: true, createdBy: { select: { id: true, name: true } } } } } }) : Promise.resolve([]),
    canSales ? prisma.auditLog.findMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId, entityType: "Sale", action: "CHECKOUT", userId: { not: null } }, orderBy: { createdAt: "desc" }, take: 200, select: { entityId: true, user: { select: { id: true, name: true } } } }) : Promise.resolve([]),
    canCash ? prisma.cashSession.findFirst({ where: { tenantId: scope.tenantId, branchId: scope.branchId, status: "OPEN" }, orderBy: { openedAt: "desc" }, select: { id: true, status: true, openingCents: true, expectedCents: true, openedAt: true, movements: { orderBy: { createdAt: "desc" }, take: 50, select: { id: true, type: true, amountCents: true, reason: true, createdAt: true, createdBy: { select: { name: true } } } } } }) : Promise.resolve(null),
    canReports && reportPeriod !== undefined ? getRestaurantReports(scope, reportPeriod ?? configuration.reports.defaultPeriod) : Promise.resolve(null),
    (canSales || canDashboard) ? prisma.sale.aggregate({ where: { tenantId: scope.tenantId, branchId: scope.branchId, orderId: { not: null }, status: "PAID", createdAt: { gte: start, lt: end } }, _sum: { totalCents: true } }) : Promise.resolve(null),
  ]);

  const toOrderDto = (item: typeof orders[number]): RestaurantOrderDto => ({
    id: item.id, code: item.code, source: item.source, deliveryPhone: item.deliveryPhone, deliveryAddress: item.deliveryAddress, deliveryReference: item.deliveryReference, deliveryFeeCents: item.deliveryFeeCents, deliveryStatus: item.deliveryStatus, status: item.status, notes: item.notes, subtotalCents: item.subtotalCents, discountCents: item.discountCents, totalCents: item.totalCents, promotionName: item.promotionName, promotionCode: item.promotionCode, createdAt: item.createdAt.toISOString(), table: item.table, customer: item.customer, waiter: item.createdBy, items: item.items.map(({ product, parentProduct, recipeSnapshot, ...line }) => {
      // Active orders created before area snapshots use current routing, without inventing historical recipes.
      const routed = product.areaAssignmentMode === "INHERIT_FROM_PRODUCT" && parentProduct ? parentProduct : product;
      const area = routed.preparationArea ?? routed.category.preparationArea;
      const legacyActive = recipeSnapshot === null && line.preparationAreaKey === "GENERAL" && item.status !== "CANCELLED" && (item.status !== "COMPLETED" || (item.kitchenTicket && !["SERVED", "CANCELLED"].includes(item.kitchenTicket.status)));
      return { ...line, startedAt: line.startedAt?.toISOString() ?? null, readyAt: line.readyAt?.toISOString() ?? null, servedAt: line.servedAt?.toISOString() ?? null, productType: product.productType, ...(legacyActive ? { preparationAreaKey: area?.id ?? routed.kitchenArea ?? "GENERAL", preparationAreaName: area?.name ?? routed.kitchenArea ?? "General" } : {}) };
    }),
    kitchenTicket: item.kitchenTicket ? { ...item.kitchenTicket, createdAt: item.kitchenTicket.createdAt.toISOString() } : null,
    paid: Boolean(item.sale),
  });
  const orderDtos = orders.map(toOrderDto);
  const cashSessions = canCash ? await prisma.cashSession.findMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId, status: "OPEN" }, select: { id: true, registerName: true }, orderBy: { openedAt: "asc" } }) : [];

  return {
    canApproveRefund, cashSessions,
    configuration: canConfiguration ? configuration : { ...configuration, integrations: { ...configuration.integrations, webhookUrl: "" }, notifications: { rules: [] } },
    paymentMethods: configuration.sales.paymentMethods.filter((item) => item.active).map((item) => item.key),
    categories,
    stockItems: canMenu && hasPermission(scope.permissions, "restaurant:menu:read") ? (await prisma.inventoryItem.findMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId, active: true }, select: { id: true, name: true, sku: true, restaurantProduct: { select: { id: true } } }, orderBy: { name: "asc" } })).map(item => ({ id: item.id, name: item.name, sku: item.sku, productId: item.restaurantProduct?.id ?? null })) : [],
    products: products.map((item) => ({ stockMode: item.stockMode, inventoryItemId: item.inventoryItemId, showInMenu: item.showInMenu, imageUrl: item.imageUrl, sortOrder: item.sortOrder, availableStock: item.stockMode === "RESALE" && item.inventoryItem?.trackStock ? item.inventoryItem.stock : null, stockBlocked: item.stockMode === "RESALE" && (!item.inventoryItem?.active || (item.inventoryItem.trackStock && item.inventoryItem.stock <= 0 && configuration.inventory.preventNegativeStock && !configuration.menu.allowOutOfStockSales)), id: item.id, name: item.name, description: item.description, priceCents: item.priceCents, costCents: item.costCents, taxCategory: item.taxCategory, kitchenArea: item.kitchenArea, productType: item.productType, areaAssignmentMode: item.areaAssignmentMode, detectedAreaKey: item.detectedAreaKey, active: item.active, category: item.category, preparationArea: item.preparationArea })),
    promotions: promotions.map((item) => ({ ...item, startsAt: item.startsAt?.toISOString() ?? null, endsAt: item.endsAt?.toISOString() ?? null, createdAt: undefined, updatedAt: undefined })),
    preparationAreas: preparationAreas.map((area) => ({ id: area.id, name: area.name, normalizedKey: area.normalizedKey, type: area.type, source: area.source, dispatchMode: area.dispatchMode, active: area.active, printers: canPrinting ? area.printerLinks.map((link) => ({ id: link.id, printerId: link.printerId, name: link.printer.name, copies: link.copies, active: link.active })) : [] })),
    printDevices: printDevices.map((printer) => ({ id: printer.id, name: printer.name, connectionType: printer.connectionType, paperWidthMm: printer.paperWidthMm, automatic: printer.automatic, active: printer.active, tokenHint: printer.tokenHint, lastSeenAt: printer.lastSeenAt?.toISOString() ?? null })),
    printSettings: { mode: printSettings?.mode === "ADVANCED" ? "ADVANCED" : "SIMPLE", automatic: printSettings?.automatic ?? true, defaultPrinterId: printSettings?.defaultPrinterId ?? null, fields: (() => { try { const value = JSON.parse(printSettings?.fields ?? "[]"); return Array.isArray(value) ? value : []; } catch { return []; } })() },
    areas,
    tables: canFloor ? tables.map((item) => ({
      id: item.id,
      name: item.name,
      seats: item.seats,
      status: item.status,
      active: item.active,
      qrToken: item.qrToken,
      area: item.area,
      reservation: item.status === "RESERVED" ? {
        name: item.reservationName ?? "Reserva",
        phone: item.reservationPhone,
        reservedAt: item.reservationAt?.toISOString() ?? null,
        partySize: item.reservationPartySize,
        notes: item.reservationNotes,
      } : null,
      activeOrder: orderDtos.find((order) => order.table?.id === item.id && (!["COMPLETED", "CANCELLED"].includes(order.status) || (order.status === "COMPLETED" && order.kitchenTicket && !["SERVED", "CANCELLED"].includes(order.kitchenTicket.status)))) ?? null,
    })) : [],
    customers,
    orders: canOrders ? orderDtos : [],
    kitchen: hasPermission(scope.permissions, "restaurant:kitchen:read") ? orderDtos.filter((item) => item.kitchenTicket && !["SERVED", "CANCELLED", "HELD"].includes(item.kitchenTicket.status)) : [],
    sales: canSales ? sales.map((item) => ({ status: item.status, refund: refundView(item.refund), id: item.id, code: item.code, paymentMethod: item.paymentMethod, payments: item.payments, electronicDocument: item.electronicDocument, subtotalCents: item.subtotalCents, discountCents: item.discountCents, promotionName: item.promotionName, totalCents: item.totalCents, createdAt: item.createdAt.toISOString(), orderCode: item.order?.code ?? null, waiter: item.order?.createdBy ?? null, cashier: item.cashier ?? checkoutAudits.find((entry) => entry.entityId === item.id)?.user ?? null })) : [],
    cashSession: cashSession ? { ...cashSession, openedAt: cashSession.openedAt.toISOString(), movements: cashSession.movements.map((movement) => ({ ...movement, createdAt: movement.createdAt.toISOString(), createdBy: movement.createdBy.name })) } : null,
    metrics: {
      occupiedTables: tables.filter((item) => item.active && item.status === "IN_SERVICE").length,
      reservedTables: tables.filter((item) => item.active && item.status === "RESERVED").length,
      cleaningTables: tables.filter((item) => item.active && item.status === "CLEANING").length,
      activeOrders: orders.filter((item) => !["COMPLETED", "CANCELLED"].includes(item.status)).length,
      kitchenPending: orders.filter((item) => item.kitchenTicket && !["SERVED", "CANCELLED", "HELD"].includes(item.kitchenTicket.status)).length,
      todayRevenueCents: dailySales?._sum.totalCents ?? 0,
    },
    reports,
  };
}
