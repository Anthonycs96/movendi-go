export class RetailError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = "RetailError"; }
}
export function quantity(value: number) {
  const units = Math.round(value * 1_000_000);
  if (!Number.isSafeInteger(units) || units <= 0 || Math.abs(units / 1_000_000 - value) > 1e-9) throw new RetailError("INVALID_QUANTITY", "La cantidad debe ser positiva y tener como máximo seis decimales.");
  return units / 1_000_000;
}
export function money(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 2_147_483_647) throw new RetailError("INVALID_AMOUNT", "Importe fuera de rango.");
  return value;
}
export type Lot = { id: string; stock: number; expiresOn: string };
export type Allocation = { lotId: string; quantity: number };
/** ISO calendar dates are compared in the tenant's business timezone. */
export function allocateLots(lots: Lot[], requested: number, today: string): Allocation[] {
  let remaining = Math.round(quantity(requested) * 1_000_000);
  const allocations: Allocation[] = [];
  for (const lot of [...lots].filter((lot) => lot.expiresOn >= today).sort((a, b) => a.expiresOn.localeCompare(b.expiresOn) || a.id.localeCompare(b.id))) {
    const take = Math.min(remaining, Math.round(lot.stock * 1_000_000));
    if (take > 0) allocations.push({ lotId: lot.id, quantity: take / 1_000_000 });
    remaining -= take;
    if (remaining === 0) break;
  }
  if (remaining > 0) throw new RetailError("INSUFFICIENT_VALID_STOCK", "No hay stock suficiente en lotes vigentes.");
  return allocations;
}
export function lineAmounts(presentation: { factor: number; weighted: boolean; priceCents: number }, count: number) {
  quantity(count);
  if (!presentation.weighted && !Number.isInteger(count)) throw new RetailError("WHOLE_UNITS_REQUIRED", "Esta presentación se vende en cantidades enteras.");
  return { baseQuantity: quantity(count * presentation.factor), totalCents: money(Math.round(count * presentation.priceCents)) };
}
/** Cumulative rounding guarantees that many partial returns cannot refund extra cents. */
export function refundAmount(line: { quantity: number; returnedQuantity: number; totalCents: number; refundedCents: number }, count: number) {
  const returned = Math.round((line.returnedQuantity + quantity(count)) * 1_000_000) / 1_000_000;
  if (returned > line.quantity) throw new RetailError("RETURN_EXCEEDS_SALE", "La devolución supera la cantidad pendiente de esta venta.");
  return { returnedQuantity: returned, amountCents: money(Math.round(line.totalCents * returned / line.quantity) - line.refundedCents) };
}
