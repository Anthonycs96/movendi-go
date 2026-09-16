import "server-only";
import { hash } from "bcryptjs";
import { z } from "zod";
import { AppError } from "@/core/auth/errors";
import { prisma } from "@/core/database/prisma";
import { billingConfiguration, billingPublicOrigin } from "./configuration";
import { createProviderCheckout } from "./provider";
import { randomBytes } from "node:crypto";
import { businessSlugFromName } from "@movendi/contracts";
import { processBillingEvent } from "./processor";

export const publicCheckoutSchema = z.object({
  planKey: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]+$/).max(30),
  businessName: z.string().trim().min(2).max(120),
  businessShortName: z.string().trim().min(2).max(40),
  businessSlug: z.string().trim().transform(businessSlugFromName).pipe(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(60)).optional(),
  businessType: z.enum(["BARBERSHOP", "RESTAURANT", "TRANSPORT", "MINIMARKET"]),
  branchName: z.string().trim().min(2).max(100).default("Sede principal"),
  adminName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(160),
  password: z.string().min(10).max(100)
    .regex(/[a-z]/, "La contraseña debe incluir una minúscula.")
    .regex(/[A-Z]/, "La contraseña debe incluir una mayúscula.")
    .regex(/[0-9]/, "La contraseña debe incluir un número.")
    .regex(/[^A-Za-z0-9]/, "La contraseña debe incluir un símbolo."),
  country: z.string().trim().toUpperCase().length(2).default("PE"),
  acceptedTerms: z.literal(true),
  website: z.string().max(0).optional(),
});

export async function listPublicPlans() {
  const plans = await prisma.platformPlan.findMany({ where: { active: true }, orderBy: { monthlyPriceCents: "asc" } });
  return plans.map((plan) => ({
    id: plan.id,
    key: plan.key,
    name: plan.name,
    description: plan.description,
    monthlyPriceCents: plan.monthlyPriceCents,
    maxUsers: plan.maxUsers,
    maxMonthlyOperations: plan.maxMonthlyOperations,
    publicWebsiteEnabled: plan.publicWebsiteEnabled,
    features: (() => { try { const parsed = JSON.parse(plan.features); return Array.isArray(parsed) ? parsed : []; } catch { return []; } })(),
  }));
}

export async function createPublicCheckout(body: unknown, request: Request) {
  const parsed = publicCheckoutSchema.safeParse(body);
  if (!parsed.success) throw new AppError("VALIDATION_ERROR", 400, "Revisa los datos de contratación.", parsed.error.flatten());
  const input = parsed.data;
  if (!input.businessSlug) {
    const base = businessSlugFromName(input.businessShortName) || "negocio";
    input.businessSlug = base.length < 3 ? `negocio-${base}` : base;
    // Keep the readable name; add a suffix when another business already uses it.
    for (let attempt = 0; attempt < 6; attempt++) {
      const [tenant, pending] = await Promise.all([
        prisma.tenant.findUnique({ where: { slug: input.businessSlug }, select: { id: true } }),
        prisma.billingCheckoutSession.findFirst({ where: { businessSlug: input.businessSlug, status: "OPEN", expiresAt: { gt: new Date() } }, select: { id: true } }),
      ]);
      if (!tenant && !pending) break;
      input.businessSlug = `${base}-${randomBytes(4).toString("hex")}`;
    }
  }
  const recentSince = new Date(Date.now() - 15 * 60_000);
  const [plan, tenantExists, userExists, recentAttempts, openCheckout] = await Promise.all([
    prisma.platformPlan.findFirst({ where: { key: input.planKey, active: true } }),
    prisma.tenant.findUnique({ where: { slug: input.businessSlug }, select: { id: true } }),
    prisma.user.findFirst({ where: { email: input.email }, select: { id: true } }),
    prisma.billingCheckoutSession.count({ where: { email: input.email, createdAt: { gte: recentSince } } }),
    prisma.billingCheckoutSession.findFirst({ where: { businessSlug: input.businessSlug, status: "OPEN", expiresAt: { gt: new Date() } }, select: { id: true } }),
  ]);
  if (!plan) throw new AppError("PLAN_NOT_FOUND", 404, "El plan seleccionado no está disponible.");
  if (tenantExists) throw new AppError("TENANT_EXISTS", 409, "Ese identificador de negocio ya está registrado.");
  if (userExists) throw new AppError("USER_EXISTS", 409, "El correo del administrador ya está registrado.");
  if (openCheckout) throw new AppError("CHECKOUT_EXISTS", 409, "Ya existe una contratación abierta para ese negocio.");
  if (recentAttempts >= 5) throw new AppError("CHECKOUT_THROTTLED", 429, "Se alcanzó el límite temporal de intentos de contratación.");

  const configuration = billingConfiguration();
  const publicOrigin = billingPublicOrigin(request);
  const provisionalExpiry = new Date(Date.now() + 30 * 60_000);
  const checkout = await prisma.billingCheckoutSession.create({ data: {
    planId: plan.id,
    provider: configuration.provider,
    email: input.email,
    businessName: input.businessName,
    businessShortName: input.businessShortName,
    businessSlug: input.businessSlug,
    businessType: input.businessType,
    adminName: input.adminName,
    adminPasswordHash: await hash(input.password, 12),
    branchName: input.branchName,
    country: input.country,
    currency: "PEN",
    amountCents: configuration.provider === "pilot" ? 0 : plan.monthlyPriceCents,
    expiresAt: provisionalExpiry,
    successUrl: `${publicOrigin}/checkout/success`,
    cancelUrl: `${publicOrigin}/planes?checkout=cancelado`,
  } });

  try {
    const providerCheckout = await createProviderCheckout(checkout.id, {
      planId: plan.id,
      email: input.email,
      businessName: input.businessName,
      businessShortName: input.businessShortName,
      businessSlug: input.businessSlug,
      businessType: input.businessType,
      adminName: input.adminName,
      adminPasswordHash: checkout.adminPasswordHash!,
      branchName: input.branchName,
      country: input.country,
      currency: "PEN",
      amountCents: plan.monthlyPriceCents,
      planName: plan.name,
      publicOrigin,
    });
    await prisma.billingCheckoutSession.update({ where: { id: checkout.id }, data: {
      providerSessionRef: providerCheckout.providerSessionRef,
      expiresAt: providerCheckout.expiresAt,
    } });
    if (configuration.provider === "pilot") await activatePilotCheckout(checkout.id);
    return { checkoutId: checkout.id, provider: configuration.provider, url: providerCheckout.url, expiresAt: providerCheckout.expiresAt.toISOString() };
  } catch (error) {
    await prisma.billingCheckoutSession.update({ where: { id: checkout.id }, data: { status: "FAILED", adminPasswordHash: null } });
    throw error;
  }
}

export async function getPublicCheckout(id: string) {
  const checkout = await prisma.billingCheckoutSession.findUnique({ where: { id }, include: { plan: true, tenant: { select: { slug: true } } } });
  if (!checkout) throw new AppError("CHECKOUT_NOT_FOUND", 404, "La contratación no existe.");
  return {
    id: checkout.id,
    provider: checkout.provider,
    pilot: checkout.provider === "pilot" || (checkout.provider === "mock" && billingConfiguration().provider === "pilot"),
    status: checkout.status,
    businessName: checkout.businessName,
    email: checkout.email,
    amountCents: checkout.amountCents,
    currency: checkout.currency,
    expiresAt: checkout.expiresAt.toISOString(),
    completedAt: checkout.completedAt?.toISOString() ?? null,
    tenantSlug: checkout.tenant?.slug ?? null,
    plan: { key: checkout.plan.key, name: checkout.plan.name },
  };
}

export async function activatePilotCheckout(id: string) {
  if (billingConfiguration().provider !== "pilot") throw new AppError("NOT_FOUND", 404, "El registro piloto no está habilitado.");
  const checkout = await prisma.billingCheckoutSession.findUnique({ where: { id } });
  if (!checkout || !["pilot", "mock"].includes(checkout.provider)) throw new AppError("NOT_FOUND", 404, "El registro piloto no existe.");
  if (checkout.status === "COMPLETED") return getPublicCheckout(id);
  if (checkout.status !== "OPEN" || checkout.expiresAt < new Date()) throw new AppError("CHECKOUT_EXPIRED", 409, "El registro expiró. Vuelve a registrarte desde Planes.");
  // Pending registrations from the previous simulator can enter the pilot without a payment.
  if (checkout.provider === "mock") await prisma.billingCheckoutSession.updateMany({ where: { id, provider: "mock", status: "OPEN" }, data: { provider: "pilot", amountCents: 0 } });
  const data = { checkoutId: id, customerRef: `pilot_cus_${id}`, subscriptionRef: `pilot_sub_${id}` };
  await processBillingEvent("pilot", { id: `pilot_registration_${id}`, type: "checkout.completed", originalType: "pilot.registration", data, payload: JSON.stringify(data) });
  return getPublicCheckout(id);
}
