import { restaurantCalendarDayOffset } from "./business-day";

type TimedSale = { createdAt: Date; totalCents: number; orders?: number };

export function calendarReportPoints(sales: TimedSale[], now: Date, count: number, spanDays: number, timezone: string) {
  const label = (date: Date) => new Intl.DateTimeFormat("es-PE", { timeZone: timezone, day: "2-digit", month: "short" }).format(date).replace(".", "");
  return Array.from({ length: count }, (_, index) => {
    const startOffset = 1 - (count - index) * spanDays;
    const start = restaurantCalendarDayOffset(now, timezone, startOffset);
    const end = restaurantCalendarDayOffset(now, timezone, startOffset + spanDays);
    const bucket = sales.filter((sale) => sale.createdAt >= start && sale.createdAt < end && sale.createdAt < now);
    const lastDay = restaurantCalendarDayOffset(now, timezone, startOffset + spanDays - 1);
    return { key: start.toISOString(), label: spanDays === 1 ? label(start) : `${label(start)}–${label(lastDay)}`, salesCents: bucket.reduce((sum, sale) => sum + sale.totalCents, 0), orders: bucket.reduce((sum, sale) => sum + (sale.orders ?? 1), 0) };
  });
}
