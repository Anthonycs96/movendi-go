import type { FiscalSource } from "./document";

/** Structural contract: no dependency on another business or persistence module. */
export type FiscalCommercialSnapshot = {
  version: 1; currency: string; totalCents: number;
  fiscal?: { taxRatePct: number; taxIncluded: boolean; customerName: string; customerDocument: string };
  lines: Array<{ sourceLineId: string; name: string; quantity: number; totalCents: number; taxCategory?: string; unitCode?: string; fiscalQuantity?: number }>;
};
export function commercialFiscalSource(snapshot: FiscalCommercialSnapshot, code: string, date: Date): FiscalSource {
  if (snapshot.version !== 1 || !snapshot.fiscal) throw new Error("La venta no contiene un snapshot fiscal compatible.");
  const fiscal = snapshot.fiscal;
  return { code, date, currency: snapshot.currency, totalCents: snapshot.totalCents, customerName: fiscal.customerName, customerDocument: fiscal.customerDocument, taxRatePct: fiscal.taxRatePct,
    lines: snapshot.lines.map((line) => ({ productId: line.sourceLineId, unitCode: line.unitCode, name: line.name, quantity: line.fiscalQuantity ?? line.quantity, taxCategory: line.taxCategory ?? "UNCLASSIFIED", totalCents: !fiscal.taxIncluded && line.taxCategory === "GRAVADA" ? Math.round(line.totalCents * (1 + fiscal.taxRatePct / 100)) : line.totalCents })),
  };
}
