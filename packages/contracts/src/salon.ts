export function salonLocalDateTime(value: string | Date, timezone = "America/Lima") {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** An explicit offset is an instant; datetime-local is interpreted in the business timezone. */
export function salonInstant(value: string | Date, timezone = "America/Lima"): Date {
  if (value instanceof Date) return value;
  if (/([zZ]|[+-]\d{2}:\d{2})$/.test(value)) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw new Error("Fecha inválida.");
    return date;
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("Indica fecha y hora válidas.");
  const target = new Date(`${value}:00Z`).getTime();
  let instant = target;
  for (let i = 0; i < 4; i++) instant += target - new Date(`${salonLocalDateTime(new Date(instant), timezone)}:00Z`).getTime();
  const date = new Date(instant);
  if (!Number.isFinite(instant) || salonLocalDateTime(date, timezone) !== value) throw new Error("La hora no existe en la zona horaria del negocio.");
  return date;
}

export interface SalonProductDto { id: string; itemId: string; name: string; sku: string; stock: number; priceCents: number; active: boolean }
export interface SalonBlockDto { id: string; staffId: string; startsAt: string; endsAt: string; reason: string }
export interface SalonHistory {
  sales: Array<{ id: string; code: string; status: string; refundable?: boolean; totalCents: number; discountCents: number; promotionName: string | null; createdAt: string; customer: string | null; payments: Array<{ method: string; amountCents: number }>; lines: Array<{ name: string; quantity: number; unitPriceCents: number; totalCents: number; staffName: string | null }> }>;
  total: number; page: number;
}
export interface SalonReports {
  from: string; to: string; sales: number; revenueCents: number; discountCents: number; costCents: number; commissionCents: number; marginCents: number; legacyRevenueCents: number;
  staff: Array<{ id: string; name: string; services: number; products: number; revenueCents: number; commissionCents: number; pendingCents: number }>;
  services: Array<{ id: string; name: string; quantity: number; revenueCents: number }>;
  products: Array<{ id: string; name: string; quantity: number; revenueCents: number }>;
  payments: Array<{ method: string; amountCents: number }>;
  clients: Array<{ id: string; name: string; phone: string | null; visits: number; spentCents: number; lastVisit: string | null; segment: "NEW" | "FREQUENT" | "LOST" | "OCCASIONAL" }>;
  cancelled: number; noShow: number;
}
