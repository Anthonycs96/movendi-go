/** Fiscal payloads and sale snapshots remain immutable sources for future thermal adapters. */
export type ReceiptPrintRequest = { tenantId: string; branchId: string; saleId: string; copyId: string; title: string; lines: Array<{ name: string; quantity: number; totalCents: number; discountCents: number }>; totalCents: number; currency: string };
export interface ReceiptPrintPort {
  transport: "BROWSER" | "LOCAL_AGENT" | "NETWORK" | "BLUETOOTH";
  capabilities(): Promise<{ available: boolean; automatic: boolean; paperWidthMm: number | null }>;
  /** UNKNOWN requires reconciliation; never interpret timeout as permission for another physical copy. */
  print(request: ReceiptPrintRequest): Promise<{ state: "QUEUED" | "CONFIRMED" | "UNKNOWN" | "UNAVAILABLE"; jobId: string | null }>;
}
