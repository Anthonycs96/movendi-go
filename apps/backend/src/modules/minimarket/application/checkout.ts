import { lineAmounts, money, RetailError, type Allocation } from "../domain/retail";

export type CheckoutInput = { idempotencyKey: string; documentKind?: "TICKET" | "BOLETA" | "FACTURA"; cashSessionId: string; customerId?: string; cashReceivedCents?: number; payments: Array<{ method: string; amountCents: number; reference: string | null }>; lines: Array<{ presentationId: string; quantity: number }> };
export type Presentation = { id: string; productId: string; itemId: string; name: string; factor: number; weighted: boolean; priceCents: number; unitCostCents: number; trackExpiry: boolean; taxCategory?: string; unitCode?: string };
export type CheckoutLine = Presentation & { quantity: number; baseQuantity: number; totalCents: number; allocations: Allocation[] };
export interface CheckoutPort {
  checkQuota(): Promise<void>;
  presentation(id: string): Promise<Presentation | null>;
  consume(line: Omit<CheckoutLine, "allocations">): Promise<Allocation[]>;
  validatePayments(totalCents: number, input: CheckoutInput): Promise<{ cashCents: number; changeCents: number | null; paymentMethod: string }>;
  record(lines: CheckoutLine[], input: CheckoutInput, totalCents: number, payment: { cashCents: number; changeCents: number | null; paymentMethod: string }): Promise<{ id: string; code: string; totalCents: number; changeCents: number | null }>;
}
/** All port operations participate in one transaction, including stock, sale and cash. */
export async function checkout(port: CheckoutPort, input: CheckoutInput) {
  if (!input.lines.length || new Set(input.lines.map((line) => line.presentationId)).size !== input.lines.length) throw new RetailError("INVALID_CART", "El carrito está vacío o contiene presentaciones repetidas.");
  await port.checkQuota();
  const lines: CheckoutLine[] = [];
  for (const selected of input.lines) {
    const product = await port.presentation(selected.presentationId);
    if (!product) throw new RetailError("PRODUCT_NOT_FOUND", "La presentación no está disponible en esta sucursal.");
    const line = { ...product, quantity: selected.quantity, ...lineAmounts(product, selected.quantity) };
    lines.push({ ...line, allocations: await port.consume(line) });
  }
  const totalCents = money(lines.reduce((sum, line) => sum + line.totalCents, 0));
  const payment = await port.validatePayments(totalCents, input);
  return port.record(lines, input, totalCents, payment);
}
