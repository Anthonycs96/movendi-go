export interface RestaurantProductPerformance {
  id: string;
  name: string;
  category: string;
  quantity: number;
  salesCents: number;
  profitCents: number;
  marginPct: number | null;
  zeroCostUnits: number;
}

export interface RestaurantGrowthReport {
  previousStartAt: string;
  previousEndAt: string;
  subtotalCents: number;
  discountsCents: number;
  discountedOrders: number;
  discountRatePct: number;
  deliveryFeesCents: number;
  refundsCents: number;
  refundsCount: number;
  pendingOrders: number;
  pendingCents: number;
  identifiedOrders: number;
  anonymousOrders: number;
  customerIdentificationPct: number;
  newCustomers: number;
  returningCustomers: number;
  repeatCustomerRatePct: number;
  unitsPerOrder: number;
  zeroCostUnits: number;
  channels: Array<{ source: string; orders: number; salesCents: number; averageTicketCents: number; sharePct: number }>;
  profitableProducts: RestaurantProductPerformance[];
  productsToReview: RestaurantProductPerformance[];
  unsoldProducts: Array<{ id: string; name: string; category: string }>;
  unsoldProductCount: number;
}
