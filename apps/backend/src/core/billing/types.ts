export type BillingProviderName = "mock" | "stripe";

export interface CheckoutRequestData {
  planId: string;
  email: string;
  businessName: string;
  businessShortName: string;
  businessSlug: string;
  businessType: "BARBERSHOP" | "RESTAURANT" | "TRANSPORT";
  adminName: string;
  adminPasswordHash: string;
  branchName: string;
  country: string;
  currency: string;
  amountCents: number;
  planName: string;
  publicOrigin: string;
}

export interface ProviderCheckoutResult {
  providerSessionRef: string;
  url: string;
  expiresAt: Date;
}

export interface BillingEventData {
  checkoutId?: string;
  customerRef?: string;
  subscriptionRef?: string;
  invoiceRef?: string;
  paymentRef?: string;
  invoiceNumber?: string;
  hostedInvoiceUrl?: string;
  status?: string;
  currency?: string;
  amountDueCents?: number;
  amountPaidCents?: number;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
  failureCode?: string;
  failureMessage?: string;
}

export interface NormalizedBillingEvent {
  id: string;
  type: "checkout.completed" | "invoice.paid" | "invoice.payment_failed" | "subscription.updated" | "subscription.deleted" | "ignored";
  originalType: string;
  data: BillingEventData;
  payload: string;
}
