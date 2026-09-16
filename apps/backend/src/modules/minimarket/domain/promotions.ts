export type RetailPromotionRule = { id: string; name: string; kind: string; value: number; priority: number; minQuantity: number; retailProductId: string | null; retailPresentationId: string | null };

/** One promotion per line: highest priority, then greatest discount, then stable id. */
export function promotionalPrice(line: { id: string; productId: string; quantity: number; priceCents: number; weighted: boolean }, rules: RetailPromotionRule[]) {
  const grossCents = Math.round(line.quantity * line.priceCents);
  const candidates = rules.filter((r) => r.retailProductId === line.productId && (!r.retailPresentationId || r.retailPresentationId === line.id) && line.quantity >= r.minQuantity).map((rule) => {
    let discount = 0;
    if (rule.kind === "SPECIAL_PRICE") discount = grossCents - Math.round(line.quantity * rule.value);
    if (rule.kind === "PERCENT") discount = Math.round(grossCents * rule.value / 100);
    if (rule.kind === "FIXED") discount = rule.value; // Fixed discount on the eligible line, not each unit.
    if (!line.weighted && (rule.kind === "2X1" || rule.kind === "3X2")) discount = Math.floor(line.quantity / (rule.kind === "2X1" ? 2 : 3)) * line.priceCents;
    return { rule, discount: Math.min(grossCents, Math.max(0, discount)) };
  }).filter((c) => c.discount > 0).sort((a, b) => b.rule.priority - a.rule.priority || b.discount - a.discount || a.rule.id.localeCompare(b.rule.id));
  const winner = candidates[0];
  return { grossCents, discountCents: winner?.discount ?? 0, totalCents: grossCents - (winner?.discount ?? 0), promotionName: winner?.rule.name ?? null };
}
