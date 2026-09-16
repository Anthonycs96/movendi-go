export class SalesError extends Error {
  constructor(public readonly code: "INVALID_SALE" | "SALE_SCOPE_MISMATCH" | "ALREADY_PAID", message: string) { super(message); this.name = "SalesError"; }
}

export type SaleLineSnapshot = {
  sourceLineId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  discountCents?: number;
  promotionName?: string | null;
  unitCostCents?: number | null;
  taxCategory?: string;
  unitCode?: string;
  fiscalQuantity?: number;
};

export type CommercialSnapshot = {
  version: 1;
  currency: string;
  lines: SaleLineSnapshot[];
  subtotalCents: number;
  discountCents: number;
  chargesCents: number;
  totalCents: number;
  fiscal?: { taxRatePct: number; taxIncluded: boolean; customerName: string; customerDocument: string };
};

const validCents = (value: number) => Number.isSafeInteger(value) && value >= 0 && value <= 2_147_483_647;

export function validateCommercialSnapshot(snapshot: CommercialSnapshot) {
  const invalid = () => { throw new SalesError("INVALID_SALE", "El detalle histórico y los importes de la venta deben coincidir."); };
  if (!/^[A-Z]{3}$/.test(snapshot.currency) || !snapshot.lines.length) invalid();
  if (snapshot.fiscal && (!Number.isFinite(snapshot.fiscal.taxRatePct) || snapshot.fiscal.taxRatePct < 0 || snapshot.fiscal.taxRatePct > 100 || typeof snapshot.fiscal.taxIncluded !== "boolean" || typeof snapshot.fiscal.customerName !== "string" || typeof snapshot.fiscal.customerDocument !== "string")) invalid();
  if (![snapshot.subtotalCents, snapshot.discountCents, snapshot.chargesCents, snapshot.totalCents].every(validCents)) invalid();
  if (snapshot.discountCents > snapshot.subtotalCents || snapshot.totalCents !== snapshot.subtotalCents - snapshot.discountCents + snapshot.chargesCents) invalid();
  const ids = new Set<string>();
  for (const line of snapshot.lines) {
    if (!line.sourceLineId || ids.has(line.sourceLineId) || !line.name.trim() || !Number.isFinite(line.quantity) || line.quantity <= 0) invalid();
    ids.add(line.sourceLineId);
    if (line.fiscalQuantity !== undefined && (!Number.isFinite(line.fiscalQuantity) || line.fiscalQuantity <= 0)) invalid();
    if (![line.unitPriceCents, line.totalCents].every(validCents) || Math.round(line.quantity * line.unitPriceCents) !== line.totalCents) invalid();
    if (line.discountCents !== undefined && (!validCents(line.discountCents) || line.discountCents > line.totalCents)) invalid();
    if (line.unitCostCents != null && !validCents(line.unitCostCents)) invalid();
  }
  if (snapshot.lines.some((line) => line.discountCents !== undefined) && snapshot.lines.reduce((sum, line) => sum + (line.discountCents ?? 0), 0) !== snapshot.discountCents) invalid();
  if (snapshot.lines.reduce((sum, line) => sum + line.totalCents, 0) !== snapshot.subtotalCents) invalid();
}
