import "server-only";
import { prisma } from "@/core/database/prisma";
import type { TenantScope } from "@/core/auth/types";
import type { RestaurantReportPeriod, RestaurantReportPoint, RestaurantReportsData } from "../types";

const DAY_MS = 86_400_000;
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

function dayLabel(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("es-PE", { timeZone: timezone, day: "2-digit", month: "short" }).format(date).replace(".", "");
}

function rollingPoints(sales: ReportSale[], now: Date, count: number, spanDays: number, timezone: string): RestaurantReportPoint[] {
  return Array.from({ length: count }, (_, index) => {
    const start = new Date(now.getTime() - (count - index) * spanDays * DAY_MS);
    const end = new Date(start.getTime() + spanDays * DAY_MS);
    const bucket = sales.filter((sale) => sale.createdAt >= start && sale.createdAt < end);
    return { key: start.toISOString(), label: spanDays === 1 ? dayLabel(start, timezone) : `${dayLabel(start, timezone)}–${dayLabel(new Date(end.getTime() - DAY_MS), timezone)}`, salesCents: bucket.reduce((sum, sale) => sum + sale.totalCents, 0), orders: bucket.length };
  });
}

function monthlyPoints(sales: ReportSale[], now: Date, timezone: string): RestaurantReportPoint[] {
  const current = localParts(now, timezone);
  const currentMonth = current.year * 12 + current.month - 1;
  return Array.from({ length: 12 }, (_, index) => {
    const absoluteMonth = currentMonth - (11 - index);
    const year = Math.floor(absoluteMonth / 12);
    const month = absoluteMonth % 12 + 1;
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const bucket = sales.filter((sale) => monthKey(sale.createdAt, timezone) === key);
    const label = new Intl.DateTimeFormat("es-PE", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 15))).replace(".", "");
    return { key, label, salesCents: bucket.reduce((sum, sale) => sum + sale.totalCents, 0), orders: bucket.length };
  });
}

type ReportSale = Awaited<ReturnType<typeof reportSales>>[number];

function reportSales(scope: TenantScope, createdAt: { gte: Date }) {
  return prisma.sale.findMany({
    where: { tenantId: scope.tenantId, branchId: scope.branchId, orderId: { not: null }, createdAt },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      totalCents: true,
      paymentMethod: true,
      payments: { select: { method: true, amountCents: true } },
      createdAt: true,
      customer: { select: { id: true, name: true, dni: true } },
      order: { select: { items: { where: { status: { not: "CANCELLED" } }, select: { quantity: true, totalCents: true, product: { select: { id: true, name: true, costCents: true, category: { select: { id: true, name: true } } } } } } } },
    },
  });
}

function summarize(sales: ReportSale[]) {
  const salesCents = sales.reduce((sum, sale) => sum + sale.totalCents, 0);
  const costCents = sales.reduce((sum, sale) => sum + (sale.order?.items ?? []).reduce((itemSum, item) => itemSum + item.product.costCents * item.quantity, 0), 0);
  const itemsSold = sales.reduce((sum, sale) => sum + (sale.order?.items ?? []).reduce((itemSum, item) => itemSum + item.quantity, 0), 0);
  return { salesCents, costCents, profitCents: salesCents - costCents, attentions: sales.length, averageTicketCents: sales.length ? Math.round(salesCents / sales.length) : 0, itemsSold };
}

export async function getRestaurantReports(scope: TenantScope, period: RestaurantReportPeriod): Promise<RestaurantReportsData> {
  const now = new Date();
  const durationMs = periodConfig[period].days * DAY_MS;
  const start = new Date(now.getTime() - durationMs);
  const previousStart = new Date(start.getTime() - durationMs);
  const [tenant, historySales, reportOrders] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: scope.tenantId }, select: { timezone: true } }),
    reportSales(scope, { gte: new Date(now.getTime() - 730 * DAY_MS) }),
    prisma.restaurantOrder.findMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId, createdAt: { gte: start, lt: now } }, select: { status: true } }),
  ]);
  const timezone = tenant?.timezone || "America/Lima";
  const currentSales = historySales.filter((sale) => sale.createdAt >= start && sale.createdAt < now);
  const previousSales = historySales.filter((sale) => sale.createdAt >= previousStart && sale.createdAt < start);
  const current = summarize(currentSales);
  const previous = summarize(previousSales);
  const customerOrders = new Map<string, { id: string; name: string; dni: string | null; orders: number; salesCents: number }>();
  const products = new Map<string, { id: string; name: string; category: string; categoryId: string; quantity: number; salesCents: number; profitCents: number }>();
  const categories = new Map<string, { id: string; name: string; quantity: number; salesCents: number }>();
  const payments = new Map<string, { method: string; orders: number; salesCents: number }>();

  for (const sale of currentSales) {
    const salePayments = sale.payments.length ? sale.payments : [{ method: sale.paymentMethod, amountCents: sale.totalCents }];
    for (const item of salePayments) {
      const payment = payments.get(item.method) ?? { method: item.method, orders: 0, salesCents: 0 };
      payment.orders += 1; payment.salesCents += item.amountCents; payments.set(item.method, payment);
    }
    if (sale.customer) {
      const customer = customerOrders.get(sale.customer.id) ?? { ...sale.customer, orders: 0, salesCents: 0 };
      customer.orders += 1; customer.salesCents += sale.totalCents; customerOrders.set(customer.id, customer);
    }
    for (const item of sale.order?.items ?? []) {
      const product = products.get(item.product.id) ?? { id: item.product.id, name: item.product.name, category: item.product.category.name, categoryId: item.product.category.id, quantity: 0, salesCents: 0, profitCents: 0 };
      product.quantity += item.quantity; product.salesCents += item.totalCents; product.profitCents += item.totalCents - item.product.costCents * item.quantity; products.set(product.id, product);
      const category = categories.get(item.product.category.id) ?? { id: item.product.category.id, name: item.product.category.name, quantity: 0, salesCents: 0 };
      category.quantity += item.quantity; category.salesCents += item.totalCents; categories.set(category.id, category);
    }
  }

  const salesByDay = rollingPoints(historySales, now, 14, 1, timezone);
  const salesByWeek = rollingPoints(historySales, now, 12, 7, timezone);
  const salesByMonth = monthlyPoints(historySales, now, timezone);
  const trend = period === "7d" ? { granularity: "day" as const, points: rollingPoints(historySales, now, 7, 1, timezone) } : period === "30d" ? { granularity: "day" as const, points: rollingPoints(historySales, now, 30, 1, timezone) } : period === "90d" ? { granularity: "week" as const, points: rollingPoints(historySales, now, 13, 7, timezone) } : { granularity: "month" as const, points: salesByMonth };
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, label: `${String(hour).padStart(2, "0")}:00`, salesCents: 0, orders: 0 }));
  const weekdays = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"].map((label, index) => ({ key: String(index), label, salesCents: 0, orders: 0 }));
  for (const sale of currentSales) {
    const parts = localParts(sale.createdAt, timezone);
    hours[parts.hour].orders += 1; hours[parts.hour].salesCents += sale.totalCents;
    const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
    weekdays[weekday].orders += 1; weekdays[weekday].salesCents += sale.totalCents;
  }
  const cancelledOrders = reportOrders.filter((order) => order.status === "CANCELLED").length;
  const knownCustomers = [...customerOrders.values()];
  const profitCents = current.profitCents;

  return {
    period,
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
      cancellationRatePct: reportOrders.length ? Math.round((cancelledOrders * 10_000) / reportOrders.length) / 100 : 0,
    },
    comparison: { salesPct: percentChange(current.salesCents, previous.salesCents), profitPct: percentChange(current.profitCents, previous.profitCents), attentionsPct: percentChange(current.attentions, previous.attentions), averageTicketPct: percentChange(current.averageTicketCents, previous.averageTicketCents) },
    trend,
    salesByDay,
    salesByWeek,
    salesByMonth,
    salesByHour: hours,
    salesByWeekday: weekdays,
    topProducts: [...products.values()].sort((a, b) => b.quantity - a.quantity || b.salesCents - a.salesCents).slice(0, 10).map((product) => ({ id: product.id, name: product.name, category: product.category, quantity: product.quantity, salesCents: product.salesCents, profitCents: product.profitCents })),
    topCategories: [...categories.values()].sort((a, b) => b.salesCents - a.salesCents).slice(0, 8).map((category) => ({ ...category, sharePct: current.salesCents ? Math.round((category.salesCents * 10_000) / current.salesCents) / 100 : 0 })),
    topCustomers: knownCustomers.sort((a, b) => b.salesCents - a.salesCents).slice(0, 10).map((customer) => ({ ...customer, averageTicketCents: customer.orders ? Math.round(customer.salesCents / customer.orders) : 0 })),
    paymentMethods: [...payments.values()].sort((a, b) => b.salesCents - a.salesCents).map((payment) => ({ ...payment, sharePct: current.salesCents ? Math.round((payment.salesCents * 10_000) / current.salesCents) / 100 : 0 })),
  };
}
