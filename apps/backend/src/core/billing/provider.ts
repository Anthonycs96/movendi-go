import "server-only";
import Stripe from "stripe";
import { AppError } from "@/core/auth/errors";
import { billingConfiguration } from "./configuration";
import type { CheckoutRequestData, ProviderCheckoutResult } from "./types";

let stripeClient: Stripe | null = null;

export function getStripeClient() {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new AppError("BILLING_NOT_CONFIGURED", 503, "Stripe todavía no tiene una clave privada configurada.");
  stripeClient ??= new Stripe(secret, { maxNetworkRetries: 2, timeout: 15_000 });
  return stripeClient;
}

export async function createProviderCheckout(checkoutId: string, input: CheckoutRequestData): Promise<ProviderCheckoutResult> {
  const configuration = billingConfiguration();
  if (!configuration.configured) throw new AppError("BILLING_NOT_CONFIGURED", 503, "El proveedor de cobro no está configurado.");

  if (configuration.provider === "mock") {
    if (!configuration.mockAllowed) throw new AppError("MOCK_BILLING_DISABLED", 503, "El simulador de cobro está deshabilitado en producción.");
    return {
      providerSessionRef: `mock_cs_${checkoutId}`,
      url: `${input.publicOrigin}/checkout/${checkoutId}`,
      expiresAt: new Date(Date.now() + 30 * 60_000),
    };
  }

  const session = await getStripeClient().checkout.sessions.create({
    mode: "subscription",
    customer_email: input.email,
    client_reference_id: checkoutId,
    metadata: { checkoutId, planId: input.planId, businessSlug: input.businessSlug },
    subscription_data: { metadata: { checkoutId, planId: input.planId, businessSlug: input.businessSlug } },
    line_items: [{
      quantity: 1,
      price_data: {
        currency: input.currency.toLowerCase(),
        unit_amount: input.amountCents,
        recurring: { interval: "month" },
        product_data: { name: `Movendi ${input.planName}`, description: `Suscripción mensual para ${input.businessName}` },
      },
    }],
    success_url: `${input.publicOrigin}/checkout/${checkoutId}?resultado=exito`,
    cancel_url: `${input.publicOrigin}/planes?checkout=cancelado`,
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
  }, { idempotencyKey: `checkout:${checkoutId}` });

  if (!session.url) throw new AppError("CHECKOUT_URL_MISSING", 502, "Stripe no devolvió una URL de pago.");
  return { providerSessionRef: session.id, url: session.url, expiresAt: new Date(session.expires_at * 1000) };
}
