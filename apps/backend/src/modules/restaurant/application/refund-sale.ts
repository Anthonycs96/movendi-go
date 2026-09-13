export interface RefundPort<Refund, Result> {
  claim(): Promise<void>;
  refundCash(): Promise<void>;
  restock(): Promise<void>;
  cancelPreparation(): Promise<void>;
  restorePoints(): Promise<void>;
  record(): Promise<Refund>;
  audit(refund: Refund): Promise<void>;
  queueDocument(refund: Refund): Promise<Result>;
}
export async function refundSaleUseCase<Refund, Result>(port: RefundPort<Refund, Result>) {
  await port.claim();
  await port.refundCash();
  await port.restock();
  await port.cancelPreparation();
  await port.restorePoints();
  const refund = await port.record();
  await port.audit(refund);
  return port.queueDocument(refund);
}
