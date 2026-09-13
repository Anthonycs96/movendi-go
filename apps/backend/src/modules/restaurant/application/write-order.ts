export interface OrderWritePort<Order> {
  claim(): Promise<void>;
  writeLines(): Promise<Order>;
  reserveIngredients(order: Order): Promise<void>;
  updatePreparation(order: Order): Promise<void>;
  print(order: Order): Promise<void>;
  audit(order: Order): Promise<void>;
}
export async function writeOrder<Order>(port: OrderWritePort<Order>) {
  await port.claim();
  const order = await port.writeLines();
  await port.reserveIngredients(order);
  await port.updatePreparation(order);
  await port.print(order);
  await port.audit(order);
  return order;
}
