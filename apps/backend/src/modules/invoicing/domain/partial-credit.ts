import { dateInPeru } from "./document";
import type { fiscalAmounts } from "./fiscal-payload";

export type RefundFiscalLine = { lineId: string; quantity: number; refundedBefore: number; amountCents: number };
type Item = ReturnType<typeof fiscalAmounts>["items"][number];
/** Allocate cumulative cents from each ORIGINAL tax base; never reprice a return. */
export function partialCreditPayload(original: Record<string, unknown>, lines: RefundFiscalLine[], series: string, number: number, reason: string, date: Date) {
  const items = original.items as Item[];
  if (!Array.isArray(items) || !lines.length || new Set(lines.map((l) => l.lineId)).size !== lines.length) throw new Error("Detalle de devolución inválido.");
  const credits = lines.map((line) => {
    const item = items.find((i) => i.codigo === line.lineId);
    if (!item || !Number.isFinite(line.quantity) || line.quantity <= 0) throw new Error("La línea no pertenece al comprobante original.");
    const total = Math.round(item.total * 100), base = Math.round(item.subtotal * 100);
    const before = line.refundedBefore, after = before + line.amountCents;
    if (![before, after, total, base].every(Number.isSafeInteger) || before < 0 || after > total || after < before || base < 0 || base > total) throw new Error("La nota excede el importe original.");
    const cumulative = (amount: number) => Number((BigInt(base) * BigInt(amount) + BigInt(total) / 2n) / BigInt(total));
    const share = total ? cumulative(after) - cumulative(before) : 0;
    return { ...item, cantidad: line.quantity, subtotal: share / 100, total: line.amountCents / 100, igv: (line.amountCents - share) / 100, valor_unitario: Number((share / line.quantity / 100).toFixed(10)), precio_unitario: Number((line.amountCents / line.quantity / 100).toFixed(10)) };
  });
  const cents = (fn: (item: Item) => number) => credits.reduce((sum, item) => sum + Math.round(fn(item) * 100), 0) / 100;
  return { ...original, tipo_de_comprobante: 3, serie: series, numero: number, fecha_de_emision: dateInPeru(date),
    documento_que_se_modifica_tipo: original.tipo_de_comprobante, documento_que_se_modifica_serie: original.serie, documento_que_se_modifica_numero: original.numero,
    tipo_de_nota_de_credito: 7, observaciones: reason, items: credits,
    total: cents((i) => i.total), total_igv: cents((i) => i.igv), total_gravada: cents((i) => i.tipo_de_igv === 1 ? i.subtotal : 0), total_exonerada: cents((i) => i.tipo_de_igv === 8 ? i.total : 0), total_inafecta: cents((i) => i.tipo_de_igv === 9 ? i.total : 0),
  };
}
