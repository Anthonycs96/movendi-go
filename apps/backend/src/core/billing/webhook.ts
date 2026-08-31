import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type Stripe from "stripe";
import { AppError } from "@/core/auth/errors";
import { billingConfiguration } from "./configuration";
import { getStripeClient } from "./provider";
import type { BillingEventData, NormalizedBillingEvent } from "./types";

type JsonObject = Record<string, unknown>;

function objectValue(value: unknown): JsonObject {
  return value && typeof value === "object" ? value as JsonObject : {};
}

function stringValue(value: unknown) {
  if (typeof value === "string") return value;
  const object = objectValue(value);
  return typeof object.id === "string" ? object.id : undefined;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function dateValue(value: unknown) {
  const seconds = numberValue(value);
  return seconds === undefined ? undefined : new Date(seconds * 1000);
}

function subscriptionRefFromInvoice(object: JsonObject) {
  const direct = stringValue(object.subscription);
  if (direct) return direct;
  const parent = objectValue(object.parent);
  const details = objectValue(parent.subscription_details);
  return stringValue(details.subscription);
}

function normalizeStripeEvent(event: Stripe.Event, payload: string): NormalizedBillingEvent {
  const object = objectValue(event.data.object);
  const metadata = objectValue(object.metadata);
  const common: BillingEventData = {
    checkoutId: typeof metadata.checkoutId === "string" ? metadata.checkoutId : undefined,
    customerRef: stringValue(object.customer),
    subscriptionRef: stringValue(object.subscription),
    currency: typeof object.currency === "string" ? object.currency.toUpperCase() : undefined,
  };

  if (event.type === "checkout.session.completed") {
    return { id: event.id, type: "checkout.completed", originalType: event.type, payload, data: {
      ...common,
      checkoutId: common.checkoutId ?? (typeof object.client_reference_id === "string" ? object.client_reference_id : undefined),
      amountPaidCents: numberValue(object.amount_total),
    } };
  }
  if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    const failure = objectValue(object.last_finalization_error);
    return { id: event.id, type: event.type === "invoice.paid" ? "invoice.paid" : "invoice.payment_failed", originalType: event.type, payload, data: {
      ...common,
      subscriptionRef: subscriptionRefFromInvoice(object),
      invoiceRef: stringValue(object.id),
      paymentRef: stringValue(object.payment_intent),
      invoiceNumber: typeof object.number === "string" ? object.number : undefined,
      hostedInvoiceUrl: typeof object.hosted_invoice_url === "string" ? object.hosted_invoice_url : undefined,
      amountDueCents: numberValue(object.amount_due),
      amountPaidCents: numberValue(object.amount_paid),
      failureCode: typeof failure.code === "string" ? failure.code : undefined,
      failureMessage: typeof failure.message === "string" ? failure.message : undefined,
    } };
  }
  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    return { id: event.id, type: event.type.endsWith("deleted") ? "subscription.deleted" : "subscription.updated", originalType: event.type, payload, data: {
      ...common,
      subscriptionRef: stringValue(object.id),
      status: typeof object.status === "string" ? object.status : undefined,
      currentPeriodStart: dateValue(object.current_period_start),
      currentPeriodEnd: dateValue(object.current_period_end),
      cancelAtPeriodEnd: typeof object.cancel_at_period_end === "boolean" ? object.cancel_at_period_end : undefined,
    } };
  }
  return { id: event.id, type: "ignored", originalType: event.type, payload, data: common };
}

function verifyMockSignature(payload: string, signature: string | null) {
  const secret = process.env.BILLING_MOCK_WEBHOOK_SECRET || "movendi-local-billing-secret";
  if (!signature) throw new AppError("WEBHOOK_SIGNATURE_MISSING", 400, "Falta la firma del webhook.");
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const receivedBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (receivedBuffer.length !== expectedBuffer.length || !timingSafeEqual(receivedBuffer, expectedBuffer)) {
    throw new AppError("WEBHOOK_SIGNATURE_INVALID", 400, "La firma del webhook no es válida.");
  }
}

export function signMockWebhook(payload: string) {
  const secret = process.env.BILLING_MOCK_WEBHOOK_SECRET || "movendi-local-billing-secret";
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export async function parseBillingWebhook(provider: string, payload: string, signature: string | null): Promise<NormalizedBillingEvent> {
  const configuration = billingConfiguration();
  if (provider !== configuration.provider) throw new AppError("BILLING_PROVIDER_MISMATCH", 404, "El proveedor de cobro indicado no está habilitado.");
  if (provider === "mock") {
    if (!configuration.mockAllowed) throw new AppError("MOCK_BILLING_DISABLED", 404, "El simulador de cobro no está disponible.");
    verifyMockSignature(payload, signature);
    let parsed: unknown;
    try { parsed = JSON.parse(payload); } catch { throw new AppError("WEBHOOK_INVALID", 400, "El webhook no contiene JSON válido."); }
    const object = objectValue(parsed);
    const data = objectValue(object.data) as BillingEventData;
    if (typeof object.id !== "string" || typeof object.type !== "string") throw new AppError("WEBHOOK_INVALID", 400, "El webhook no contiene un evento válido.");
    const accepted = ["checkout.completed", "invoice.paid", "invoice.payment_failed", "subscription.updated", "subscription.deleted"];
    return { id: object.id, type: accepted.includes(object.type) ? object.type as NormalizedBillingEvent["type"] : "ignored", originalType: object.type, data, payload };
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new AppError("BILLING_NOT_CONFIGURED", 503, "Falta configurar la firma de webhooks de Stripe.");
  if (!signature) throw new AppError("WEBHOOK_SIGNATURE_MISSING", 400, "Falta la firma de Stripe.");
  let event: Stripe.Event;
  try { event = await getStripeClient().webhooks.constructEventAsync(payload, signature, secret); }
  catch { throw new AppError("WEBHOOK_SIGNATURE_INVALID", 400, "La firma de Stripe no es válida."); }
  return normalizeStripeEvent(event, payload);
}
