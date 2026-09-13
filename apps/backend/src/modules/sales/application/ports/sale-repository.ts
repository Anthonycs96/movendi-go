import type { CommercialSnapshot, SaleLineSnapshot } from "../../domain/sale";
import type { PaymentAllocation } from "../../domain/payments";

export type SaleScope = { tenantId: string; branchId: string };
export type SaleOrigin = { kind: "ORDER" | "APPOINTMENT" | "RETAIL"; id: string };
export type RecordSaleInput = {
  origin: SaleOrigin;
  code: string;
  customerId: string | null;
  cashSessionId: string | null;
  cashierId?: string;
  paymentMethod: string;
  payments?: PaymentAllocation[];
  // Omitted for the legacy appointment column (default 0). The snapshot always
  // records its actual subtotal; existing reports keep their original columns.
  subtotalCents?: number;
  discountCents?: number;
  promotionName?: string | null;
  totalCents: number;
  cashReceivedCents?: number | null;
  changeCents?: number | null;
  loyaltyPointsEarned?: number;
  loyaltyPointsRedeemed?: number;
  loyaltyDiscountCents?: number;
  detail: { lines: SaleLineSnapshot[]; subtotalCents: number; chargesCents: number; fiscal?: CommercialSnapshot["fiscal"] };
};
export type RecordedSale = { id: string; code: string; totalCents: number; cashReceivedCents: number | null; changeCents: number | null; loyaltyPointsEarned: number };

export interface SaleRepository {
  currencyForContext(input: Pick<RecordSaleInput, "customerId" | "cashSessionId" | "origin">): Promise<string | null>;
  existsForOrigin(origin: SaleOrigin): Promise<boolean>;
  create(input: RecordSaleInput, snapshot: CommercialSnapshot): Promise<RecordedSale>;
}
