import "server-only";
import type { BillingProviderName } from "./types";

export interface BillingConfiguration {
  provider: BillingProviderName;
  configured: boolean;
  mockAllowed: boolean;
  webhookConfigured: boolean;
}

export function billingConfiguration(): BillingConfiguration {
  const production = process.env.NODE_ENV === "production";
  const provider = (process.env.BILLING_PROVIDER?.toLowerCase() || (production ? "stripe" : "mock")) as BillingProviderName;
  const mockAllowed = !production || process.env.ALLOW_MOCK_BILLING === "true";
  if (provider === "stripe") {
    return {
      provider,
      configured: Boolean(process.env.STRIPE_SECRET_KEY),
      webhookConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      mockAllowed,
    };
  }
  return {
    provider: "mock",
    configured: mockAllowed,
    webhookConfigured: Boolean(process.env.BILLING_MOCK_WEBHOOK_SECRET) || !production,
    mockAllowed,
  };
}

export function billingPublicOrigin(request?: Request) {
  const explicit = process.env.APP_PUBLIC_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  if (request) {
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    if (forwardedHost) return `${forwardedProto || "https"}://${forwardedHost}`;
    return new URL(request.url).origin.replace(/:3001$/, ":3000");
  }
  return "http://localhost:3000";
}
