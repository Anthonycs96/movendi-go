import { allocateCents } from "./allocate-cents";

export type FiscalLine = { productId: string; name: string; quantity: number; totalCents: number; taxCategory: string; unitCode?: string };
export function fiscalAmounts(totalCents: number, items: FiscalLine[], taxRate: number) {
  if (!items.length || items.some((item) => !Number.isFinite(item.quantity) || item.quantity <= 0 || !item.name.trim())) throw new Error("El comprobante requiere líneas con cantidad positiva y nombre.");
  if (items.some((item) => item.unitCode && !["NIU", "KGM", "LTR"].includes(item.unitCode))) throw new Error("Unidad fiscal no soportada.");
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) throw new Error("La tasa de impuesto no es válida.");
  if (items.some((item) => !["GRAVADA", "EXONERADA", "INAFECTA"].includes(item.taxCategory))) throw new Error("Clasificación tributaria no soportada.");
  if (taxRate === 0 && items.some((item) => item.taxCategory === "GRAVADA")) throw new Error("Los productos gravados requieren una tasa mayor que cero. Clasifica los productos exonerados o inafectos en la carta.");
  const totals = allocateCents(totalCents, items.map((item) => item.totalCents));
  const taxedIndices = items.flatMap((item, index) => item.taxCategory === "GRAVADA" ? [index] : []);
  const taxedTotal = taxedIndices.reduce((sum, index) => sum + totals[index], 0);
  const taxable = Math.round(taxedTotal / (1 + taxRate / 100));
  const taxableShares = taxedIndices.length ? allocateCents(taxable, taxedIndices.map((index) => totals[index])) : [];
  const money = (cents: number) => cents / 100;
  return {
    porcentaje_de_igv: taxRate,
    total_gravada: money(taxable),
    total_exonerada: money(items.reduce((sum, item, index) => sum + (item.taxCategory === "EXONERADA" ? totals[index] : 0), 0)),
    total_inafecta: money(items.reduce((sum, item, index) => sum + (item.taxCategory === "INAFECTA" ? totals[index] : 0), 0)),
    total_igv: money(taxedTotal - taxable), total: money(totalCents),
    items: items.map((item, index) => {
      const base = item.taxCategory === "GRAVADA" ? taxableShares[taxedIndices.indexOf(index)] : totals[index];
      return { unidad_de_medida: item.unitCode ?? "NIU", codigo: item.productId, descripcion: item.name, cantidad: item.quantity, valor_unitario: Number((base / item.quantity / 100).toFixed(10)), precio_unitario: Number((totals[index] / item.quantity / 100).toFixed(10)), subtotal: money(base), tipo_de_igv: item.taxCategory === "GRAVADA" ? 1 : item.taxCategory === "EXONERADA" ? 8 : 9, igv: money(totals[index] - base), total: money(totals[index]) };
    }),
  };
}

export function fiscalResponseStatus(response: Record<string, unknown>) {
  if (response.errors) return "FAILED";
  if (response.aceptada_por_sunat === true || response.aceptada_por_sunat === "true") return "ISSUED";
  return "SUBMITTED";
}
