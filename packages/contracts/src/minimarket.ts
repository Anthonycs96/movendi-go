export interface MinimarketProduct {
  id: string; itemId: string; name: string; sku: string; category: string; taxCategory: string; unit: string; stock: number; minimumStock: number; unitCostCents: number | null; active: boolean; trackExpiry: boolean;
  presentations: Array<{ id: string; name: string; barcode: string | null; factor: number; priceCents: number; weighted: boolean; active: boolean }>;
  lots: Array<{ id: string; code: string; expiresOn: string; stock: number }>;
}
export interface MinimarketSale {
  id: string; code: string; currency: string; status: string; totalCents: number; refundedCents: number; createdAt: string; paymentMethod: string;
  lines: Array<{ id: string; name: string; quantity: number; returnedQuantity: number; unitPriceCents: number; totalCents: number; refundedCents: number }>;
  payments: Array<{ method: string; amountCents: number }>;
  fiscalJobs: Array<{ id: string; kind: string; series: string; number: number; status: string; environment: string; lastError: string | null; pdfUrl: string | null; xmlUrl: string | null; cdrUrl: string | null }>;
}
export interface MinimarketData {
  fiscal: { enabled: boolean; environment: "BETA" | "PRODUCTION"; taxRatePct: number; invoiceSeries: string; receiptSeries: string };
  fiscalConnection: { configured: boolean; status: string; tokenHint: string; apiUrl: string } | null;
  today: string; currency: string; paymentMethods: string[]; products: MinimarketProduct[]; sales: MinimarketSale[];
  purchases: Array<{ id: string; code: string; supplierName: string; documentNumber: string | null; totalCents: number; createdAt: string }>;
  movements: Array<{ id: string; name: string; type: string; direction: string; quantity: number; stockAfter: number; notes: string | null; createdAt: string }>;
  customers: Array<{ id: string; name: string; dni: string | null; phone: string | null; email: string | null }>;
  cash: { id: string; openingCents: number; expectedCents: number; openedAt: string } | null;
  cashHistory: Array<{ id: string; registerName: string; status: string; openingCents: number; expectedCents: number; countedCents: number | null; openedAt: string }>;
  cashMovements: Array<{ id: string; type: string; amountCents: number; reason: string; createdAt: string }>;
  page: number; pages: number; totalRows: number;
  summary: { salesCents: number; refundedCents: number; count: number; lowStock: number; expiringLots: number } | null;
}
