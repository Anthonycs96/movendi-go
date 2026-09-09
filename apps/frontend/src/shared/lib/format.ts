export const compactNumber = new Intl.NumberFormat("es-PE", { notation: "compact", maximumFractionDigits: 1 });

const datePartsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Lima",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const shortMonths = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function dateParts(value: string | Date) {
  const parts = Object.fromEntries(datePartsFormatter.formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute };
}

function groupedFixed(value: number, fractionDigits: number) {
  const absolute = Math.abs(value).toFixed(fractionDigits);
  const [integer, decimals] = absolute.split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${value < 0 ? "-" : ""}${grouped}${decimals === undefined ? "" : `.${decimals}`}`;
}

export function formatCurrency(value: number): string {
  return `S/ ${groupedFixed(value, 0)}`;
}

const currencyFormatters = new Map<string, Intl.NumberFormat>();

export function formatCurrencyCents(value: number, currency = "PEN", locale = "es-PE"): string {
  const key = `${locale}:${currency}`;
  let formatter = currencyFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2 });
    if (currencyFormatters.size >= 32) currencyFormatters.clear();
    currencyFormatters.set(key, formatter);
  }
  return formatter.format(value / 100).replace(/[\u00a0\u202f]/g, " ");
}

export function formatDateInput(value: string | Date): string {
  const parts = dateParts(value);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatDateTimeInput(value: string | Date): string {
  const parts = dateParts(value);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function formatTime(value: string | Date): string {
  const parts = dateParts(value);
  return `${parts.hour}:${parts.minute}`;
}

export function formatShortDate(value: string | Date, includeYear = false): string {
  const parts = dateParts(value);
  return `${parts.day} ${shortMonths[Number(parts.month) - 1]}${includeYear ? ` ${parts.year}` : ""}`;
}

export function formatDateTime(value: string | Date): string {
  const parts = dateParts(value);
  return `${parts.day}/${parts.month}/${parts.year}, ${parts.hour}:${parts.minute}`;
}

export function initials(value: string): string {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}
