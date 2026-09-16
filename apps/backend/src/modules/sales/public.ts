export { recordSaleUseCase } from "./application/record-sale";
export { SalesError } from "./domain/sale";
export { PaymentError, validatePaymentAllocation } from "./domain/payments";
export type { PaymentAllocation } from "./domain/payments";
export type { CommercialSnapshot, SaleLineSnapshot } from "./domain/sale";
export type { RecordSaleInput, RecordedSale, SaleScope, SaleOrigin, SaleRepository } from "./application/ports/sale-repository";

export type { PaymentIntent, PaymentConfirmation, PaymentConfirmationPort } from "./application/ports/payment-confirmation";
