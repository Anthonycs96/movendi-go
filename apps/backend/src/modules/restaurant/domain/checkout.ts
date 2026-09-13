export class RestaurantCheckoutError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

export function assertOrderPayable(order: { status: string; sale: unknown }) {
  if (order.sale) throw new RestaurantCheckoutError("ALREADY_PAID", "El pedido ya fue cobrado.");
  if (["COMPLETED", "CANCELLED"].includes(order.status)) throw new RestaurantCheckoutError("ORDER_CLOSED", "El pedido está cerrado y no puede cobrarse.");
}
