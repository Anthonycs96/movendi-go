import { fiscalAmounts, type FiscalLine } from "./fiscal-payload";

export type DocumentKind = "BOLETA" | "FACTURA";
export type FiscalSource = { code: string; date: Date; currency: string; totalCents: number; customerName: string; customerDocument: string; taxRatePct: number; lines: FiscalLine[] };
export type FiscalConfiguration = { enabled: boolean; environment: "BETA" | "PRODUCTION"; invoiceSeries: string; receiptSeries: string };

export function dateInPeru(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.day}-${value.month}-${value.year}`;
}

export function documentPayload(source: FiscalSource, kind: DocumentKind, series: string, number: number, environment: string) {
  if (!/^[BF][A-Z0-9]{3}$/.test(series) || series[0] !== (kind === "FACTURA" ? "F" : "B")) throw new Error("Serie incompatible con el tipo de comprobante.");
  if (!Number.isSafeInteger(number) || number < 1 || number > 99_999_999) throw new Error("Correlativo fuera del rango permitido.");
  if (!["BETA", "PRODUCTION"].includes(environment)) throw new Error("Ambiente fiscal no verificado.");
  if (!["PEN", "USD"].includes(source.currency)) throw new Error("La emisión admite ventas en PEN o USD.");
  const identity = source.customerDocument;
  if (identity && !/^\d{8}$|^\d{11}$/.test(identity)) throw new Error("El cliente requiere DNI de 8 dígitos o RUC de 11 dígitos.");
  if (kind === "FACTURA" && !/^\d{11}$/.test(identity)) throw new Error("Una factura requiere un cliente con RUC de 11 dígitos.");
  return {
    operacion: "generar_comprobante", tipo_de_comprobante: kind === "FACTURA" ? 1 : 2, serie: series, numero: number,
    sunat_transaction: 1, cliente_tipo_de_documento: identity.length === 11 ? 6 : identity.length === 8 ? 1 : 0,
    cliente_numero_de_documento: identity || "-", cliente_denominacion: source.customerName || "CLIENTE VARIOS", cliente_direccion: "",
    fecha_de_emision: dateInPeru(source.date), moneda: source.currency === "USD" ? 2 : 1,
    ...fiscalAmounts(source.totalCents, source.lines, source.taxRatePct), observaciones: `Venta ${source.code}`,
    enviar_automaticamente_a_la_sunat: environment === "PRODUCTION", enviar_automaticamente_al_cliente: false,
  };
}
