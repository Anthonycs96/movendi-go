import type { RestaurantConfiguration, RestaurantGrowthReport } from "@movendi/contracts";

export interface RestaurantCategoryDto { id: string; name: string; active: boolean; preparationArea: { id: string; name: string } | null }
export interface RestaurantProductDto { stockMode?: string; inventoryItemId?: string | null; showInMenu?: boolean; imageUrl?: string | null; sortOrder?: number; availableStock?: number | null; stockBlocked?: boolean; taxCategory: string; id: string; name: string; description: string | null; priceCents: number; costCents: number; kitchenArea: string; productType: string; areaAssignmentMode: string; detectedAreaKey: string | null; active: boolean; category: { id: string; name: string }; preparationArea: { id: string; name: string } | null }
export interface PreparationAreaDto { id: string; name: string; normalizedKey: string | null; type: string; source: string; dispatchMode: string; active: boolean; printers: Array<{ id: string; printerId: string; name: string; copies: number; active: boolean }> }
export interface PrintDeviceDto { id: string; name: string; connectionType: string; paperWidthMm: number; automatic: boolean; active: boolean; tokenHint: string | null; lastSeenAt: string | null }
export interface RestaurantPrintSettingsDto { mode: "SIMPLE" | "ADVANCED"; automatic: boolean; defaultPrinterId: string | null; fields: string[] }
export interface RestaurantPromotionDto { id: string; name: string; code: string | null; kind: string; value: number; buyQuantity: number; freeQuantity: number; scope: string; categoryId: string | null; productId: string | null; minSubtotalCents: number; maxDiscountCents: number | null; automatic: boolean; weekdays: string; startTime: string | null; endTime: string | null; startsAt: string | null; endsAt: string | null; active: boolean }
export interface RestaurantOrderDto { id: string; code: string; source: string; deliveryPhone: string | null; deliveryAddress: string | null; deliveryReference: string | null; deliveryFeeCents: number; deliveryStatus: string | null; status: string; notes: string | null; subtotalCents: number; discountCents: number; totalCents: number; promotionName: string | null; promotionCode: string | null; createdAt: string; table: { id: string; name: string } | null; customer: { id: string; name: string; loyaltyPoints?: number; active?: boolean } | null; waiter: { id: string; name: string }; items: Array<{ stockModeSnapshot?: string; startedAt?: string | null; readyAt?: string | null; servedAt?: string | null; startedByUserId?: string | null; readyByUserId?: string | null; servedByUserId?: string | null; preparationAreaKey: string; preparationAreaName: string; id: string; productId: string; parentProductId: string | null; productType: string; name: string; quantity: number; totalCents: number; status: string; notes: string | null }>; kitchenTicket: { id: string; status: string; createdAt: string } | null; paid: boolean }
export interface RestaurantTableDto { id: string; name: string; seats: number; status: string; active: boolean; qrToken: string | null; area: { id: string; name: string }; reservation: { name: string; phone: string | null; reservedAt: string | null; partySize: number | null; notes: string | null } | null; activeOrder: RestaurantOrderDto | null }
export type RestaurantReportPeriod = "7d" | "30d" | "90d" | "12m";
export interface RestaurantReportPoint { key: string; label: string; salesCents: number; orders: number }
export interface RestaurantReportsData {
  growth: RestaurantGrowthReport;
  estimatedCostLines: number;
  includeCancelledOrders: boolean;
  period: RestaurantReportPeriod;
  periodLabel: string;
  startAt: string;
  endAt: string;
  generatedAt: string;
  timezone: string;
  metrics: { salesCents: number; costCents: number; profitCents: number; marginPct: number; attentions: number; averageTicketCents: number; itemsSold: number; uniqueCustomers: number; repeatCustomers: number; cancelledOrders: number; cancellationRatePct: number };
  comparison: { salesPct: number | null; profitPct: number | null; attentionsPct: number | null; averageTicketPct: number | null };
  trend: { granularity: "day" | "week" | "month"; points: RestaurantReportPoint[] };
  salesByDay: RestaurantReportPoint[];
  salesByWeek: RestaurantReportPoint[];
  salesByMonth: RestaurantReportPoint[];
  salesByHour: Array<{ hour: number; label: string; salesCents: number; orders: number }>;
  salesByWeekday: Array<{ key: string; label: string; salesCents: number; orders: number }>;
  topProducts: Array<{ id: string; name: string; category: string; quantity: number; salesCents: number; profitCents: number }>;
  topCategories: Array<{ id: string; name: string; quantity: number; salesCents: number; sharePct: number }>;
  topCustomers: Array<{ id: string; name: string; dni: string | null; orders: number; salesCents: number; averageTicketCents: number }>;
  paymentMethods: Array<{ method: string; orders: number; salesCents: number; sharePct: number }>;
}
export interface RestaurantData {
  stockItems?: Array<{ id: string; name: string; sku: string; productId: string | null }>;
  canApproveRefund: boolean;
  configuration: RestaurantConfiguration;
  paymentMethods: string[];
  categories: RestaurantCategoryDto[];
  products: RestaurantProductDto[];
  promotions: RestaurantPromotionDto[];
  preparationAreas: PreparationAreaDto[];
  printDevices: PrintDeviceDto[];
  printSettings: RestaurantPrintSettingsDto;
  areas: Array<{ id: string; name: string; active: boolean }>;
  tables: RestaurantTableDto[];
  customers: Array<{ id: string; name: string; dni: string | null; documentType: string | null; segment: string | null; loyaltyPoints: number; phone: string | null; email: string | null; notes: string | null; active: boolean }>;
  orders: RestaurantOrderDto[];
  kitchen: RestaurantOrderDto[];
  sales: Array<{ status: string; refund: { id: string; creditStatus: string; reason: string; creditError: string | null; pdfUrl: string | null; xmlUrl: string | null; cdrUrl: string | null } | null; id: string; code: string; paymentMethod: string; payments: Array<{ id: string; method: string; amountCents: number; reference: string | null }>; electronicDocument: { id: string; kind: string; series: string; number: number; status: string; pdfUrl: string | null; xmlUrl: string | null; cdrUrl: string | null; lastError: string | null } | null; subtotalCents: number; discountCents: number; promotionName: string | null; totalCents: number; createdAt: string; orderCode: string | null; waiter: { id: string; name: string } | null; cashier: { id: string; name: string } | null }>;
  cashSessions?: Array<{ id: string; registerName: string }>;
  cashSession: { id: string; status: string; openingCents: number; expectedCents: number; openedAt: string; movements: Array<{ id: string; type: string; amountCents: number; reason: string; createdAt: string; createdBy: string }> } | null;
  metrics: { occupiedTables: number; reservedTables: number; cleaningTables: number; activeOrders: number; kitchenPending: number; todayRevenueCents: number };
  reports: RestaurantReportsData | null;
}
