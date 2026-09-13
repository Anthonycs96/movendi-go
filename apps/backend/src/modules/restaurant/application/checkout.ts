export interface RestaurantCheckoutPort<Sale> {
  claim(): Promise<void>;
  redeemPoints(): Promise<void>;
  receiveCash(): Promise<void>;
  recordSale(): Promise<Sale>;
  consumeInventory(sale: Sale): Promise<void>;
  completeOrder(sale: Sale): Promise<void>;
  audit(sale: Sale): Promise<void>;
  queueDocument(sale: Sale): Promise<void>;
}

/** All ports participate in the same transaction, including the fiscal intent. */
export async function checkoutOrderUseCase<Sale>(port: RestaurantCheckoutPort<Sale>) {
  await port.claim();
  await port.redeemPoints();
  await port.receiveCash();
  const sale = await port.recordSale();
  await port.consumeInventory(sale);
  await port.completeOrder(sale);
  await port.audit(sale);
  await port.queueDocument(sale);
  return sale;
}
