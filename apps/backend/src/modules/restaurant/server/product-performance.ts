import type { RestaurantProductPerformance } from "@movendi/contracts";

export function productPerformance(products: Array<Omit<RestaurantProductPerformance, "marginPct">>) {
  const ranked = products.map((product) => ({ ...product, marginPct: product.salesCents ? Math.round(product.profitCents * 10_000 / product.salesCents) / 100 : null }));
  // Missing/zero costs cannot be treated as exceptionally profitable products.
  const costed = ranked.filter((product) => product.zeroCostUnits === 0);
  const sales = costed.reduce((sum, product) => sum + product.salesCents, 0);
  const profit = costed.reduce((sum, product) => sum + product.profitCents, 0);
  const averageMargin = sales ? profit * 100 / sales : 0;
  return {
    profitableProducts: costed.filter((product) => product.profitCents > 0).sort((a, b) => b.profitCents - a.profitCents || b.quantity - a.quantity).slice(0, 8),
    productsToReview: costed.filter((product) => product.profitCents <= 0 || (product.marginPct !== null && product.marginPct < averageMargin)).sort((a, b) => (a.marginPct ?? -Infinity) - (b.marginPct ?? -Infinity) || b.quantity - a.quantity).slice(0, 8),
  };
}
