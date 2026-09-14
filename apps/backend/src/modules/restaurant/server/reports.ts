import "server-only";
import { prisma } from "@/core/database/prisma";
import { restaurantCalendarDayOffset } from "./business-day";
import { getRestaurantConfiguration } from "./configuration";
import { allocateCents } from "@/modules/invoicing/domain/allocate-cents";
import { productPerformance } from "./product-performance";
import { calendarReportPoints } from "./report-series";
import type { TenantScope } from "@/core/auth/types";
import type { RestaurantReportPeriod, RestaurantReportPoint, RestaurantReportsData } from "../types";

const periodConfig: Record<RestaurantReportPeriod, { days: number; label: string }> = {
  "7d": { days: 7, label: "Últimos 7 días" },
  "30d": { days: 30, label: "Últimos 30 días" },
  "90d": { days: 90, label: "Últimos 90 días" },
  "12m": { days: 365, label: "Últimos 12 meses" },
};

export function normalizeRestaurantReportPeriod(value: string | null | undefined): RestaurantReportPeriod {
  return value === "7d" || value === "90d" || value === "12m" ? value : "30d";
}

function percentChange(current: number, previous: number) {
  if (!previous) return null;
  return Math.round(((current - previous) * 10_000) / previous) / 100;
}

function localParts(date: Date, timezone: string) {
  const values = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day), hour: Number(values.hour) };
}

function monthKey(date: Date, timezone: string) {
  const parts = localParts(date, timezone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
}

function monthlyPoints(sales: Array<{ createdAt: Date; totalCents: number; orders: number }>, now: Date, timezone: string): RestaurantReportPoint[] {
  const current = localParts(now, timezone);
  const currentMonth = current.year * 12 + current.month - 1;
  return Array.from({ length: 12 }, (_, index) => {
    const absoluteMonth = currentMonth - (11 - index);
    const year = Math.floor(absoluteMonth / 12);
    const month = absoluteMonth % 12 + 1;
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const bucket = sales.filter((sale) => monthKey(sale.createdAt, timezone) === key);
    const label = new Intl.DateTimeFormat("es-PE", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 15))).replace(".", "");
    return { key, label, salesCents: bucket.reduce((sum, sale) => sum + sale.totalCents, 0), orders: bucket.reduce((sum, sale) => sum + sale.orders, 0) };
  });
}

type ReportSale = Awaited<ReturnType<typeof reportSales>>[number];

function reportSales(scope: TenantScope, createdAt: { gte: Date; lt: Date }, cursor?: string) {
  return prisma.sale.findMany({
    where: { tenantId: scope.tenantId, branchId: scope.branchId, orderId: { not: null }, status: "PAID", createdAt },
    take: 500, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { id: "asc" },
    select: {
      id: true,
      totalCents: true,
      subtotalCents: true,
      discountCents: true,
      paymentMethod: true,
      payments: { select: { method: true, amountCents: true } },
      createdAt: true,
      customer: { select: { id: true, name: true, dni: true } },
      order: { select: { source: true, deliveryFeeCents: true, items: { where: { status: { not: "CANCELLED" } }, select: { name: true, quantity: true, totalCents: true, unitCostCents: true, product: { select: { id: true, name: true, costCents: true, category: { select: { id: true, name: true } } } } } } } },
    },
  });
}

function summarize(sales: ReportSale[]) {
  const salesCents = sales.reduce((sum, sale) => sum + sale.totalCents, 0);
  const costCents = sales.reduce((sum, sale) => sum + (sale.order?.items ?? []).reduce((itemSum, item) => itemSum + (item.unitCostCents ?? item.product.costCents) * item.quantity, 0), 0);
  const itemsSold = sales.reduce((sum, sale) => sum + (sale.order?.items ?? []).reduce((itemSum, item) => itemSum + item.quantity, 0), 0);
  return { salesCents, costCents, profitCents: salesCents - costCents, attentions: sales.length, averageTicketCents: sales.length ? Math.round(salesCents / sales.length) : 0, itemsSold };
}

export async function getRestaurantReports(scope: TenantScope, period: RestaurantReportPeriod): Promise<RestaurantReportsData> {
  const now = new Date();
  const tenant = await prisma.tenant.findUnique({ where: { id: scope.tenantId }, select: { timezone: true } });
  const timezone = tenant?.timezone || "America/Lima";
  const days = periodConfig[period].days;
  const start = restaurantCalendarDayOffset(now, timezone, 1 - days);
  const previousStart = restaurantCalendarDayOffset(start, timezone, -days);
  const configuration = await getRestaurantConfiguration(scope.tenantId, scope.branchId);
  const previousEnd = new Date(previousStart.getTime() + (now.getTime() - start.getTime()));
  const orderCounts = await prisma.restaurantOrder.groupBy({ by: ["status"], where: { tenantId: scope.tenantId, branchId: scope.branchId, createdAt: { gte: start, lt: now } }, _count: { _all: true } });
  const current = summarize([]);
  const previous = summarize([]);
  let estimatedCostLines = 0;
  const daysMap = new Map<string, { createdAt: Date; totalCents: number; orders: number }>();
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, label: `${String(hour).padStart(2, "0")}:00`, salesCents: 0, orders: 0 }));
  const weekdays = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"].map((label, index) => ({ key: String(index), label, salesCents: 0, orders: 0 }));
  const customerOrders = new Map<string, { id: string; name: string; dni: string | null; orders: number; salesCents: number }>();
  const products = new Map<string, { id: string; name: string; category: string; categoryId: string; quantity: number; salesCents: number; profitCents: number; zeroCostUnits: number }>();
  const categories = new Map<string, { id: string; name: string; quantity: number; salesCents: number }>();
  const payments = new Map<string, { method: string; orders: number; salesCents: number }>();

  const channels = new Map<string, { source: string; orders: number; salesCents: number }>();
  let subtotalCents = 0, discountsCents = 0, discountedOrders = 0, deliveryFeesCents = 0, identifiedOrders = 0, zeroCostUnits = 0;
  let cursor: string | undefined;
  for (;;) {
    const batch = await reportSales(scope, { gte: previousStart, lt: now }, cursor);
    if (!batch.length) break;
    cursor = batch[batch.length - 1].id;
    for (const sale of batch) {
      if (sale.createdAt < start && sale.createdAt >= previousEnd) continue;
      const summary = summarize([sale]);
      const target = sale.createdAt >= start ? current : previous;
      for (const key of ["salesCents", "costCents", "profitCents", "attentions", "itemsSold"] as const) target[key] += summary[key];
      if (sale.createdAt < start) continue;
      subtotalCents += sale.subtotalCents;
      discountsCents += sale.discountCents;
      discountedOrders += Number(sale.discountCents > 0);
      deliveryFeesCents += sale.order?.deliveryFeeCents ?? 0;
      identifiedOrders += Number(Boolean(sale.customer));
      const source = sale.order?.source ?? "OTHER";
      const channel = channels.get(source) ?? { source, orders: 0, salesCents: 0 };
      channel.orders += 1; channel.salesCents += sale.totalCents; channels.set(source, channel);
      estimatedCostLines += sale.order?.items.filter((item) => item.unitCostCents === null).length ?? 0;
      const parts = localParts(sale.createdAt, timezone);
      const dayKey = `${parts.year}-${parts.month}-${parts.day}`;
      const day = daysMap.get(dayKey) ?? { createdAt: restaurantCalendarDayOffset(sale.createdAt, timezone, 0), totalCents: 0, orders: 0 };
      day.totalCents += sale.totalCents; day.orders += 1; daysMap.set(dayKey, day);
      hours[parts.hour].orders += 1; hours[parts.hour].salesCents += sale.totalCents;
      const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
      weekdays[weekday].orders += 1; weekdays[weekday].salesCents += sale.totalCents;
    const salePayments = sale.payments.length ? sale.payments : [{ method: sale.paymentMethod, amountCents: sale.totalCents }];
    for (const item of salePayments) {
      const payment = payments.get(item.method) ?? { method: item.method, orders: 0, salesCents: 0 };
      payment.orders += 1; payment.salesCents += item.amountCents; payments.set(item.method, payment);
    }
    if (sale.customer) {
      const customer = customerOrders.get(sale.customer.id) ?? { ...sale.customer, orders: 0, salesCents: 0 };
      customer.orders += 1; customer.salesCents += sale.totalCents; customerOrders.set(customer.id, customer);
    }
    const lines = sale.order?.items ?? [];
    const allocated = lines.length ? allocateCents(Math.max(0, sale.totalCents - (sale.order?.deliveryFeeCents ?? 0)), lines.map((item) => item.totalCents)) : [];
    for (const [index, item] of lines.entries()) {
      const netCents = allocated[index];
      const product = products.get(item.product.id) ?? { id: item.product.id, name: item.name, category: item.product.category.name, categoryId: item.product.category.id, quantity: 0, salesCents: 0, profitCents: 0, zeroCostUnits: 0 };
      if ((item.unitCostCents ?? item.product.costCents) === 0) { product.zeroCostUnits += item.quantity; zeroCostUnits += item.quantity; }
      product.quantity += item.quantity; product.salesCents += netCents; product.profitCents += netCents - (item.unitCostCents ?? item.product.costCents) * item.quantity; products.set(product.id, product);
      const category = categories.get(item.product.category.id) ?? { id: item.product.category.id, name: item.product.category.name, quantity: 0, salesCents: 0 };
      category.quantity += item.quantity; category.salesCents += netCents; categories.set(category.id, category);
    }
  }

  }
  current.averageTicketCents = current.attentions ? Math.round(current.salesCents / current.attentions) : 0;
  previous.averageTicketCents = previous.attentions ? Math.round(previous.salesCents / previous.attentions) : 0;
  const currentSales = [...daysMap.values()];
  const salesByDay = calendarReportPoints(currentSales, now, days, 1, timezone);
  const salesByWeek = calendarReportPoints(currentSales, now, Math.ceil(days / 7), 7, timezone);
  const salesByMonth = monthlyPoints(currentSales, now, timezone);
  const trend = period === "7d" ? { granularity: "day" as const, points: salesByDay } : period === "30d" ? { granularity: "day" as const, points: salesByDay } : period === "90d" ? { granularity: "week" as const, points: salesByWeek } : { granularity: "month" as const, points: salesByMonth };
  const cancelledOrders = orderCounts.find((row) => row.status === "CANCELLED")?._count._all ?? 0;
  const orderCount = orderCounts.reduce((sum, row) => sum + row._count._all, 0);
  const knownCustomers = [...customerOrders.values()];
  const profitCents = current.profitCents;

  const unsoldWhere = { tenantId: scope.tenantId, branchId: scope.branchId, active: true, category: { active: true }, createdAt: { lt: start }, items: { none: { status: { not: "CANCELLED" }, order: { sale: { status: "PAID", createdAt: { gte: start, lt: now } } } } } };
  const [refunds, pending, unsoldProducts, unsoldProductCount] = await Promise.all([
    prisma.saleRefund.aggregate({ where: { tenantId: scope.tenantId, branchId: scope.branchId, createdAt: { gte: start, lt: now }, sale: { orderId: { not: null } } }, _sum: { totalCents: true }, _count: { _all: true } }),
    prisma.restaurantOrder.aggregate({ where: { tenantId: scope.tenantId, branchId: scope.branchId, status: { notIn: ["CANCELLED", "COMPLETED"] }, sale: null }, _sum: { totalCents: true }, _count: { _all: true } }),
    prisma.product.findMany({ where: unsoldWhere, orderBy: { name: "asc" }, take: 10, select: { id: true, name: true, category: { select: { name: true } } } }),
    prisma.product.count({ where: unsoldWhere }),
  ]);
  // Only inspect histories for this period's identified customers, in bounded batches.
  let returningCustomers = 0;
  for (let index = 0; index < knownCustomers.length; index += 500) {
    const prior = await prisma.sale.groupBy({ by: ["customerId"], where: { tenantId: scope.tenantId, branchId: scope.branchId, orderId: { not: null }, status: "PAID", createdAt: { lt: start }, customerId: { in: knownCustomers.slice(index, index + 500).map((customer) => customer.id) } } });
    returningCustomers += prior.length;
  }
  const repeatCustomers = knownCustomers.filter((customer) => customer.orders >= 2).length;
  const rate = (part: number, whole: number) => whole ? Math.round(part * 10_000 / whole) / 100 : 0;
  return {
    growth: {
      previousStartAt: previousStart.toISOString(), previousEndAt: previousEnd.toISOString(),
      subtotalCents, discountsCents, discountedOrders, discountRatePct: rate(discountsCents, subtotalCents), deliveryFeesCents,
      refundsCents: refunds._sum.totalCents ?? 0, refundsCount: refunds._count._all,
      pendingOrders: pending._count._all, pendingCents: pending._sum.totalCents ?? 0,
      identifiedOrders, anonymousOrders: current.attentions - identifiedOrders, customerIdentificationPct: rate(identifiedOrders, current.attentions),
      newCustomers: knownCustomers.length - returningCustomers, returningCustomers, repeatCustomerRatePct: rate(repeatCustomers, knownCustomers.length),
      unitsPerOrder: current.attentions ? Math.round(current.itemsSold * 100 / current.attentions) / 100 : 0, zeroCostUnits,
      channels: [...channels.values()].sort((a, b) => b.salesCents - a.salesCents).map((channel) => ({ ...channel, averageTicketCents: Math.round(channel.salesCents / channel.orders), sharePct: rate(channel.salesCents, current.salesCents) })),
      ...productPerformance([...products.values()]), unsoldProducts: unsoldProducts.map((product) => ({ ...product, category: product.category.name })), unsoldProductCount,
    },
    period,
    estimatedCostLines,
    includeCancelledOrders: configuration.reports.includeCancelledOrders,
    periodLabel: periodConfig[period].label,
    startAt: start.toISOString(),
    endAt: now.toISOString(),
    generatedAt: now.toISOString(),
    timezone,
    metrics: {
      ...current,
      profitCents,
      marginPct: current.salesCents ? Math.round((profitCents * 10_000) / current.salesCents) / 100 : 0,
      uniqueCustomers: knownCustomers.length,
      repeatCustomers: knownCustomers.filter((customer) => customer.orders >= 2).length,
      cancelledOrders,
      cancellationRatePct: orderCount ? Math.round((cancelledOrders * 10_000) / orderCount) / 100 : 0,
    },
    comparison: { salesPct: percentChange(current.salesCents, previous.salesCents), profitPct: percentChange(current.profitCents, previous.profitCents), attentionsPct: percentChange(current.attentions, previous.attentions), averageTicketPct: percentChange(current.averageTicketCents, previous.averageTicketCents) },
    trend,
    salesByDay,
    salesByWeek,
    salesByMonth,
    salesByHour: hours,
    salesByWeekday: weekdays,
    topProducts: [...products.values()].sort((a, b) => b.quantity - a.quantity || b.salesCents - a.salesCents).slice(0, 10).map((product) => ({ id: product.id, name: product.name, category: product.category, quantity: product.quantity, salesCents: product.salesCents, profitCents: product.profitCents })),
    topCategories: [...categories.values()].sort((a, b) => b.salesCents - a.salesCents).slice(0, 8).map((category) => ({ ...category, sharePct: current.salesCents > deliveryFeesCents ? Math.round((category.salesCents * 10_000) / (current.salesCents - deliveryFeesCents)) / 100 : 0 })),
    topCustomers: knownCustomers.sort((a, b) => b.salesCents - a.salesCents).slice(0, 10).map((customer) => ({ ...customer, averageTicketCents: customer.orders ? Math.round(customer.salesCents / customer.orders) : 0 })),
    paymentMethods: [...payments.values()].sort((a, b) => b.salesCents - a.salesCents).map((payment) => ({ ...payment, sharePct: current.salesCents ? Math.round((payment.salesCents * 10_000) / current.salesCents) / 100 : 0 })),
  };
}
