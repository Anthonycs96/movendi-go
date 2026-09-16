export interface MinimarketProduct {
  id: string; itemId: string; name: string; sku: string; category: string; taxCategory: string; unit: string; stock: number; minimumStock: number; unitCostCents: number | null; active: boolean; trackExpiry: boolean; expiryAlertDays: number;
  presentations: Array<{ id: string; name: string; sku: string | null; barcode: string | null; factor: number; priceCents: number; weighted: boolean; active: boolean }>;
  lots: Array<{ id: string; code: string; expiresOn: string; stock: number }>;
}
export interface MinimarketSale {
  id: string; code: string; currency: string; status: string; totalCents: number; refundedCents: number; createdAt: string; paymentMethod: string;
  lines: Array<{ id: string; name: string; quantity: number; returnedQuantity: number; unitPriceCents: number; totalCents: number; discountCents: number; promotionName: string | null; refundedCents: number }>;
  payments: Array<{ method: string; amountCents: number }>;
  fiscalJobs: Array<{ id: string; kind: string; series: string; number: number; status: string; environment: string; lastError: string | null; pdfUrl: string | null; xmlUrl: string | null; cdrUrl: string | null }>;
}
export interface MinimarketPromotion { id: string; name: string; kind: string; value: number; retailProductId: string | null; retailPresentationId: string | null; priority: number; minQuantity: number; startsAt: string | null; endsAt: string | null; active: boolean }
export interface MinimarketReport {
  truncated: boolean; analyzedSales: number; currency: string; costCents: number | null; marginCents: number | null; unknownCostLines: number;
  byCashier: Array<{ name: string; salesCents: number; refundedCents: number; count: number }>; byCash: MinimarketReport["byCashier"]; byBranch: MinimarketReport["byCashier"]; byPayment: Array<{ name: string; salesCents: number; refundedCents: number }>;
  topProducts: Array<{ name: string; quantity: number; netCents: number }>; lowStock: Array<{ id: string; name: string; stock: number; minimumStock: number; unit: string }>; noStockCount: number; expiringCount: number; expiring: Array<{ name: string; code: string; stock: number; expiresOn: string; alertDays: number }>;
  purchases: { count: number; totalCents: number; currencyVerified: boolean }; payables: Array<{ currency: string; count: number; balanceCents: number }>;
}
export interface MinimarketData {
  report: MinimarketReport | null;
  promotions: MinimarketPromotion[];
  suppliers: Array<{ id: string; documentType: string; documentNumber: string; name: string; phone: string | null; email: string | null; address: string | null; contact: string | null; active: boolean; purchases: Array<{ code: string; totalCents: number; createdAt: string }> }>;
  payables: Array<{ id: string; supplierName: string; purchaseCode: string; currency: string; totalCents: number; paidCents: number; dueOn: string; status: string; payments: Array<{ id: string; amountCents: number; method: string; reference: string | null; createdAt: string }> }>;
  transfers: MinimarketTransfer[];
  transferBranches: Array<{ id: string; name: string }>;
  scope: { tenantId: string; branchId: string; actorId: string };
  cashSessions: Array<{ id: string; registerName: string; openedById: string; openingCents: number; expectedCents: number; openedAt: string }>;
  fiscal: { enabled: boolean; environment: "BETA" | "PRODUCTION"; taxRatePct: number; invoiceSeries: string; receiptSeries: string };
  fiscalConnection: { configured: boolean; status: string; tokenHint: string; apiUrl: string } | null;
  today: string; currency: string; paymentMethods: string[]; products: MinimarketProduct[]; sales: MinimarketSale[];
  purchases: Array<{ id: string; code: string; supplierName: string; documentNumber: string | null; totalCents: number; createdAt: string }>;
  movements: Array<{ id: string; name: string; type: string; direction: string; quantity: number; stockBefore: number; actorName: string; reference: string | null; stockAfter: number; notes: string | null; createdAt: string }>;
  customers: Array<{ id: string; name: string; dni: string | null; phone: string | null; email: string | null }>;
  cash: { id: string; openingCents: number; expectedCents: number; openedAt: string } | null;
  cashHistory: Array<{ id: string; registerName: string; status: string; openingCents: number; expectedCents: number; countedCents: number | null; openedAt: string }>;
  cashMovements: Array<{ id: string; type: string; amountCents: number; reason: string; createdAt: string }>;
  page: number; pages: number; totalRows: number;
  summary: { salesCents: number; refundedCents: number; count: number; lowStock: number; expiringLots: number } | null;
}

export interface MinimarketTransfer {
  id: string; sourceBranchId: string; destinationBranchId: string; sourceName: string; destinationName: string; status: string; createdAt: string; notes: string | null;
  lines: Array<{ presentationId: string; sourceProductId: string; destinationProductId: string; name: string; sku: string; quantity: number; factor: number; baseQuantity: number; unitCostCents: number; lots: Array<{ code: string; expiresOn: string; quantity: number }> }>;
}
