import "server-only";
import { Prisma } from "@prisma/client";
import { AppError } from "@/core/auth/errors";
import { prisma } from "@/core/database/prisma";
import { initializeBusinessSetup } from "@/core/platform/onboarding";
import type { BillingEventData, BillingProviderName, NormalizedBillingEvent } from "./types";

function addMonth(value = new Date()) {
  const result = new Date(value);
  result.setMonth(result.getMonth() + 1);
  return result;
}

function subscriptionStatus(value?: string) {
  if (value === "trialing") return "TRIAL";
  if (value === "active") return "ACTIVE";
  if (value === "canceled" || value === "incomplete_expired") return "CANCELLED";
  if (value === "past_due" || value === "unpaid" || value === "incomplete" || value === "paused") return "PAST_DUE";
  return "ACTIVE";
}

async function completeCheckout(provider: BillingProviderName, data: BillingEventData) {
  if (!data.checkoutId) throw new AppError("CHECKOUT_REFERENCE_MISSING", 400, "El evento no identifica la contratación.");
  return prisma.$transaction(async (tx) => {
    const checkout = await tx.billingCheckoutSession.findUnique({ where: { id: data.checkoutId }, include: { plan: true, tenant: true } });
    if (!checkout) throw new AppError("CHECKOUT_NOT_FOUND", 404, "La contratación indicada no existe.");
    if (checkout.provider !== provider) throw new AppError("BILLING_PROVIDER_MISMATCH", 409, "La contratación pertenece a otro proveedor.");
    if (checkout.status === "COMPLETED" && checkout.tenant) return checkout.tenant.id;
    if (checkout.status !== "OPEN") throw new AppError("CHECKOUT_NOT_OPEN", 409, "La contratación ya no está abierta.");
    if (checkout.expiresAt < new Date()) throw new AppError("CHECKOUT_EXPIRED", 409, "La contratación expiró; inicia un nuevo intento.");
    if (!checkout.businessSlug || !checkout.businessName || !checkout.businessShortName || !checkout.businessType || !checkout.adminName || !checkout.adminPasswordHash || !checkout.branchName) {
      throw new AppError("CHECKOUT_INCOMPLETE", 409, "La contratación no contiene todos los datos de alta.");
    }
    const [slugExists, userExists] = await Promise.all([
      tx.tenant.findUnique({ where: { slug: checkout.businessSlug }, select: { id: true } }),
      tx.user.findFirst({ where: { email: checkout.email }, select: { id: true } }),
    ]);
    if (slugExists || userExists) throw new AppError("PROVISIONING_CONFLICT", 409, "El negocio o el administrador ya fue registrado por otro proceso.");

    const now = new Date();
    const pilot = provider === "pilot";
    const periodEnd = pilot ? null : data.currentPeriodEnd ?? addMonth(now);
    const tenant = await tx.tenant.create({ data: {
      slug: checkout.businessSlug,
      name: checkout.businessName,
      shortName: checkout.businessShortName,
      type: checkout.businessType,
      country: checkout.country,
      currency: checkout.currency,
      email: checkout.email,
      planId: checkout.planId,
      status: "ACTIVE",
      subscriptionStatus: pilot ? "TRIAL" : "ACTIVE",
      subscriptionStartedAt: now,
      subscriptionEndsAt: periodEnd,
    } });
    const branch = await tx.branch.create({ data: { tenantId: tenant.id, name: checkout.branchName } });
    const role = await tx.role.create({ data: { tenantId: tenant.id, key: "ADMIN", name: "Administrador", permissions: JSON.stringify(["*"]) } });
    const user = await tx.user.create({ data: { name: checkout.adminName, email: checkout.email, passwordHash: checkout.adminPasswordHash } });
    await tx.membership.create({ data: { tenantId: tenant.id, userId: user.id, roleId: role.id, branchId: branch.id } });
    await initializeBusinessSetup(tenant.id, branch.id, checkout.businessType as "MINIMARKET" | "RESTAURANT" | "TRANSPORT" | "BARBERSHOP", undefined, user.id, tx);
    await tx.billingCustomer.create({ data: {
      tenantId: tenant.id,
      provider,
      providerCustomerRef: data.customerRef,
      billingEmail: checkout.email,
      legalName: checkout.businessName,
      country: checkout.country,
      currency: checkout.currency,
    } });
    const subscription = await tx.billingSubscription.create({ data: {
      tenantId: tenant.id,
      planId: checkout.planId,
      checkoutSessionId: checkout.id,
      provider,
      providerSubscriptionRef: data.subscriptionRef,
      status: pilot ? "TRIAL" : "ACTIVE",
      amountCents: pilot ? 0 : checkout.amountCents,
      currency: checkout.currency,
      currentPeriodStart: data.currentPeriodStart ?? now,
      currentPeriodEnd: periodEnd,
    } });
    if (provider === "mock") {
      const invoiceRef = data.invoiceRef ?? `mock_in_${checkout.id}`;
      const invoice = await tx.billingInvoice.create({ data: {
        tenantId: tenant.id,
        subscriptionId: subscription.id,
        provider,
        providerInvoiceRef: invoiceRef,
        invoiceNumber: data.invoiceNumber ?? `SIM-${checkout.id.slice(-8).toUpperCase()}`,
        status: "PAID",
        currency: checkout.currency,
        amountDueCents: checkout.amountCents,
        amountPaidCents: data.amountPaidCents ?? checkout.amountCents,
        paidAt: now,
      } });
      await tx.billingPayment.create({ data: {
        tenantId: tenant.id,
        invoiceId: invoice.id,
        provider,
        providerPaymentRef: data.paymentRef ?? `mock_py_${checkout.id}`,
        status: "SUCCEEDED",
        amountCents: data.amountPaidCents ?? checkout.amountCents,
        currency: checkout.currency,
        paidAt: now,
      } });
    }
    await tx.billingCheckoutSession.update({ where: { id: checkout.id }, data: { tenantId: tenant.id, status: "COMPLETED", completedAt: now, adminPasswordHash: null } });
    await tx.emailOutbox.create({ data: { tenantId: tenant.id, recipient: checkout.email, template: pilot ? "WELCOME_PILOT" : "WELCOME_PAID", subject: `Bienvenido a Movendi, ${checkout.businessShortName}`, payload: JSON.stringify({ tenantSlug: tenant.slug, plan: checkout.plan.name, pilot }) } });
    await tx.auditLog.create({ data: { tenantId: tenant.id, branchId: branch.id, userId: user.id, action: "BILLING_CHECKOUT_COMPLETED", entityType: "BillingCheckoutSession", entityId: checkout.id, metadata: JSON.stringify({ provider, planId: checkout.planId, amountCents: checkout.amountCents }) } });
    return tenant.id;
  });
}

async function findSubscription(provider: BillingProviderName, data: BillingEventData) {
  if (!data.subscriptionRef) throw new AppError("SUBSCRIPTION_REFERENCE_MISSING", 400, "El evento no identifica la suscripción.");
  const subscription = await prisma.billingSubscription.findUnique({ where: { provider_providerSubscriptionRef: { provider, providerSubscriptionRef: data.subscriptionRef } } });
  if (!subscription) throw new AppError("SUBSCRIPTION_NOT_FOUND", 409, "La suscripción aún no ha sido aprovisionada.");
  return subscription;
}

async function invoicePaid(provider: BillingProviderName, data: BillingEventData) {
  const subscription = await findSubscription(provider, data);
  if (!data.invoiceRef) throw new AppError("INVOICE_REFERENCE_MISSING", 400, "El evento no identifica la factura.");
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const invoice = await tx.billingInvoice.upsert({
      where: { provider_providerInvoiceRef: { provider, providerInvoiceRef: data.invoiceRef! } },
      update: { status: "PAID", amountPaidCents: data.amountPaidCents ?? data.amountDueCents ?? subscription.amountCents, paidAt: now, hostedInvoiceUrl: data.hostedInvoiceUrl, invoiceNumber: data.invoiceNumber },
      create: { tenantId: subscription.tenantId, subscriptionId: subscription.id, provider, providerInvoiceRef: data.invoiceRef, invoiceNumber: data.invoiceNumber, status: "PAID", currency: data.currency ?? subscription.currency, amountDueCents: data.amountDueCents ?? subscription.amountCents, amountPaidCents: data.amountPaidCents ?? data.amountDueCents ?? subscription.amountCents, paidAt: now, hostedInvoiceUrl: data.hostedInvoiceUrl },
    });
    const paymentRef = data.paymentRef ?? `invoice:${data.invoiceRef}`;
    await tx.billingPayment.upsert({
      where: { provider_providerPaymentRef: { provider, providerPaymentRef: paymentRef } },
      update: { status: "SUCCEEDED", failureCode: null, failureMessage: null, paidAt: now },
      create: { tenantId: subscription.tenantId, invoiceId: invoice.id, provider, providerPaymentRef: paymentRef, status: "SUCCEEDED", amountCents: data.amountPaidCents ?? data.amountDueCents ?? subscription.amountCents, currency: data.currency ?? subscription.currency, paidAt: now },
    });
    const periodEnd = data.currentPeriodEnd ?? addMonth(now);
    await tx.billingSubscription.update({ where: { id: subscription.id }, data: { status: "ACTIVE", currentPeriodEnd: periodEnd } });
    await tx.tenant.update({ where: { id: subscription.tenantId }, data: { subscriptionStatus: "ACTIVE", subscriptionEndsAt: periodEnd } });
    await tx.emailOutbox.create({ data: { tenantId: subscription.tenantId, recipient: (await tx.billingCustomer.findUnique({ where: { tenantId: subscription.tenantId } }))?.billingEmail ?? "", template: "INVOICE_PAID", subject: "Pago de suscripción confirmado", payload: JSON.stringify({ invoiceId: invoice.id, amountCents: invoice.amountPaidCents, currency: invoice.currency }) } });
    return subscription.tenantId;
  });
}

async function invoiceFailed(provider: BillingProviderName, data: BillingEventData) {
  const subscription = await findSubscription(provider, data);
  if (!data.invoiceRef) throw new AppError("INVOICE_REFERENCE_MISSING", 400, "El evento no identifica la factura.");
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.billingInvoice.upsert({
      where: { provider_providerInvoiceRef: { provider, providerInvoiceRef: data.invoiceRef! } },
      update: { status: "OPEN", hostedInvoiceUrl: data.hostedInvoiceUrl, invoiceNumber: data.invoiceNumber },
      create: { tenantId: subscription.tenantId, subscriptionId: subscription.id, provider, providerInvoiceRef: data.invoiceRef, invoiceNumber: data.invoiceNumber, status: "OPEN", currency: data.currency ?? subscription.currency, amountDueCents: data.amountDueCents ?? subscription.amountCents, hostedInvoiceUrl: data.hostedInvoiceUrl },
    });
    const paymentRef = data.paymentRef ?? `failed:${data.invoiceRef}`;
    await tx.billingPayment.upsert({
      where: { provider_providerPaymentRef: { provider, providerPaymentRef: paymentRef } },
      update: { status: "FAILED", failureCode: data.failureCode, failureMessage: data.failureMessage },
      create: { tenantId: subscription.tenantId, invoiceId: invoice.id, provider, providerPaymentRef: paymentRef, status: "FAILED", amountCents: data.amountDueCents ?? subscription.amountCents, currency: data.currency ?? subscription.currency, failureCode: data.failureCode, failureMessage: data.failureMessage },
    });
    await tx.billingSubscription.update({ where: { id: subscription.id }, data: { status: "PAST_DUE" } });
    await tx.tenant.update({ where: { id: subscription.tenantId }, data: { subscriptionStatus: "PAST_DUE" } });
    const customer = await tx.billingCustomer.findUnique({ where: { tenantId: subscription.tenantId } });
    if (customer) await tx.emailOutbox.create({ data: { tenantId: subscription.tenantId, recipient: customer.billingEmail, template: "PAYMENT_FAILED", subject: "No pudimos procesar tu suscripción", payload: JSON.stringify({ invoiceId: invoice.id, failureMessage: data.failureMessage }) } });
    return subscription.tenantId;
  });
}

async function updateSubscription(provider: BillingProviderName, data: BillingEventData, deleted: boolean) {
  const subscription = await findSubscription(provider, data);
  const status = deleted ? "CANCELLED" : subscriptionStatus(data.status);
  await prisma.$transaction([
    prisma.billingSubscription.update({ where: { id: subscription.id }, data: { status, currentPeriodStart: data.currentPeriodStart, currentPeriodEnd: data.currentPeriodEnd, cancelAtPeriodEnd: data.cancelAtPeriodEnd, canceledAt: status === "CANCELLED" ? new Date() : undefined, endedAt: deleted ? new Date() : undefined } }),
    prisma.tenant.update({ where: { id: subscription.tenantId }, data: { subscriptionStatus: status, subscriptionEndsAt: data.currentPeriodEnd, cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? deleted } }),
  ]);
  return subscription.tenantId;
}

export async function processBillingEvent(provider: BillingProviderName, event: NormalizedBillingEvent) {
  let record: { id: string; status: string };
  try {
    record = await prisma.billingWebhookEvent.create({ data: { provider, externalEventId: event.id, type: event.originalType, payload: event.payload } });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const existing = await prisma.billingWebhookEvent.findUniqueOrThrow({ where: { provider_externalEventId: { provider, externalEventId: event.id } } });
    if (existing.status === "PROCESSED" || existing.status === "IGNORED" || existing.status === "PROCESSING") return { duplicate: true, status: existing.status };
    record = await prisma.billingWebhookEvent.update({ where: { id: existing.id }, data: { status: "PROCESSING", attempts: { increment: 1 }, lastError: null } });
  }

  try {
    let tenantId: string | undefined;
    if (event.type === "checkout.completed") tenantId = await completeCheckout(provider, event.data);
    else if (event.type === "invoice.paid") tenantId = await invoicePaid(provider, event.data);
    else if (event.type === "invoice.payment_failed") tenantId = await invoiceFailed(provider, event.data);
    else if (event.type === "subscription.updated") tenantId = await updateSubscription(provider, event.data, false);
    else if (event.type === "subscription.deleted") tenantId = await updateSubscription(provider, event.data, true);
    await prisma.billingWebhookEvent.update({ where: { id: record.id }, data: { tenantId, status: event.type === "ignored" ? "IGNORED" : "PROCESSED", processedAt: new Date() } });
    return { duplicate: false, status: event.type === "ignored" ? "IGNORED" : "PROCESSED" };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Error de procesamiento desconocido";
    await prisma.billingWebhookEvent.update({ where: { id: record.id }, data: { status: "FAILED", lastError: message } });
    throw error;
  }
}
