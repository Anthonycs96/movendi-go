import { z } from "zod";
import { AppError, errorResponse } from "@/core/auth/errors";
import { billingConfiguration } from "@/core/billing/configuration";
import { processBillingEvent } from "@/core/billing/processor";
import type { NormalizedBillingEvent } from "@/core/billing/types";
import { signMockWebhook } from "@/core/billing/webhook";
import { prisma } from "@/core/database/prisma";

const bodySchema = z.object({ outcome: z.enum(["success", "renewal_paid", "renewal_failed", "cancel"]).default("success"), eventId: z.string().trim().min(4).max(120).optional() });

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const configuration = billingConfiguration();
    if (configuration.provider !== "mock" || !configuration.mockAllowed) throw new AppError("NOT_FOUND", 404, "El simulador de cobro no está disponible.");
    const { id } = await context.params;
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", 400, "La simulación solicitada no es válida.");
    const checkout = await prisma.billingCheckoutSession.findUnique({ where: { id }, include: { subscription: true } });
    if (!checkout) throw new AppError("CHECKOUT_NOT_FOUND", 404, "La contratación no existe.");
    const outcome = parsed.data.outcome;
    const suffix = parsed.data.eventId ?? `mock_evt_${outcome}_${id}`;
    const base = { checkoutId: id, customerRef: `mock_cus_${id}`, subscriptionRef: checkout.subscription?.providerSubscriptionRef ?? `mock_sub_${id}`, currency: checkout.currency, amountDueCents: checkout.amountCents, amountPaidCents: checkout.amountCents };
    const eventType: NormalizedBillingEvent["type"] = outcome === "success" ? "checkout.completed" : outcome === "renewal_paid" ? "invoice.paid" : outcome === "renewal_failed" ? "invoice.payment_failed" : "subscription.deleted";
    const data = eventType === "checkout.completed" ? base : eventType.startsWith("invoice.") ? { ...base, invoiceRef: `mock_in_${suffix}`, paymentRef: `mock_py_${suffix}`, failureCode: eventType.endsWith("failed") ? "card_declined" : undefined, failureMessage: eventType.endsWith("failed") ? "La tarjeta fue rechazada en la simulación." : undefined } : base;
    const payload = JSON.stringify({ id: suffix, type: eventType, data });
    const signature = signMockWebhook(payload);
    if (!signature) throw new AppError("WEBHOOK_SIGNATURE_INVALID", 500, "No se pudo firmar el evento local.");
    const result = await processBillingEvent("mock", { id: suffix, type: eventType, originalType: eventType, data, payload });
    const updated = await prisma.billingCheckoutSession.findUniqueOrThrow({ where: { id }, include: { tenant: { select: { slug: true } } } });
    return Response.json({ message: outcome === "success" ? "Pago simulado y negocio activado." : "Evento de facturación simulado.", result, checkout: { status: updated.status, tenantSlug: updated.tenant?.slug ?? null } });
  } catch (error) {
    return errorResponse(error);
  }
}
