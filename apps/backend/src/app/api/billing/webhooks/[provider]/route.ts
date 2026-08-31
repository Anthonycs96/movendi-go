import { errorResponse } from "@/core/auth/errors";
import { parseBillingWebhook } from "@/core/billing/webhook";
import { processBillingEvent } from "@/core/billing/processor";
import type { BillingProviderName } from "@/core/billing/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ provider: string }> }) {
  try {
    const { provider } = await context.params;
    const payload = await request.text();
    const signature = request.headers.get(provider === "stripe" ? "stripe-signature" : "x-billing-signature");
    const event = await parseBillingWebhook(provider, payload, signature);
    const result = await processBillingEvent(provider as BillingProviderName, event);
    return Response.json({ received: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}
