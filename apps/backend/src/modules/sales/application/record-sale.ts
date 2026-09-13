import { SalesError, validateCommercialSnapshot, type CommercialSnapshot } from "../domain/sale";
import type { RecordSaleInput, SaleRepository } from "./ports/sale-repository";
import { validatePaymentAllocation } from "../domain/payments";

export async function recordSaleUseCase(repository: SaleRepository, input: RecordSaleInput) {
  const currency = await repository.currencyForContext(input);
  if (!currency) throw new SalesError("SALE_SCOPE_MISMATCH", "La venta contiene relaciones ajenas a esta empresa o sucursal.");
  if (await repository.existsForOrigin(input.origin)) throw new SalesError("ALREADY_PAID", "El origen de esta venta ya fue cobrado.");
  const snapshot: CommercialSnapshot = { version: 1, currency, ...input.detail, discountCents: input.discountCents ?? 0, totalCents: input.totalCents };
  validateCommercialSnapshot(snapshot);
  if (input.subtotalCents !== undefined && input.subtotalCents !== snapshot.subtotalCents) throw new SalesError("INVALID_SALE", "El subtotal de la venta no coincide con su detalle.");
  const allocation = validatePaymentAllocation(input.totalCents, input.payments ?? [{ method: input.paymentMethod, amountCents: input.totalCents, reference: null }], input.cashReceivedCents);
  if (input.paymentMethod !== allocation.paymentMethod || (input.changeCents ?? null) !== allocation.changeCents) throw new SalesError("INVALID_SALE", "El método de pago o el vuelto no coincide con el cobro.");
  return repository.create(input, snapshot);
}
