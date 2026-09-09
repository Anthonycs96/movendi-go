import "server-only";
import { prisma } from "@/core/database/prisma";
import type { PlatformSection } from "./access";
import type { PlatformData, PlatformPlanView } from "./types";
import { storageConfiguration } from "@/core/storage/provider";
import { billingConfiguration } from "@/core/billing/configuration";
import { emailConfiguration } from "@/core/billing/outbox";
import { setupTemplates } from "./onboarding";

function parseFeatures(value: string) {
  try {
    const result = JSON.parse(value);
    return Array.isArray(result) ? result.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseStringArray(value: string) {
  try {
    const result = JSON.parse(value);
    return Array.isArray(result) ? result.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseObject(value: string) {
  try {
    const result = JSON.parse(value);
    return result && typeof result === "object" && !Array.isArray(result) ? result as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export async function getPlatformData(currentTenantId: string, section?: PlatformSection): Promise<PlatformData> {
  const needed = (...sections: PlatformSection[]) => !section || sections.includes(section);
  const businessNeeded = needed("dashboard", "businesses", "subscriptions", "catalog");
  const plansNeeded = needed("dashboard", "businesses", "subscriptions", "plans");
  const systemNeeded = needed("settings");
  const billingNeeded = needed("billing");
  const billingMetricsNeeded = needed("billing", "settings");
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const staleBefore = new Date(Date.now() - Math.max(1, Number(process.env.JOB_STALE_MINUTES ?? 15)) * 60_000);
  const [tenantRecords, planRecords, userRecords, auditRecords, monthlySales, monthlyAppointments, monthlyOrders, monthlyTrips, monthlyTransportPayments, jobGroups, activeSessions, auditEvents, staleJobs, storedObjects, checkoutRecords, invoiceRecords, paymentRecords, billingEventRecords, emailRecords, invoiceGroups, paymentGroups, openCheckouts, failedBillingEvents, queuedEmails] = await Promise.all([
    businessNeeded ? prisma.tenant.findMany({
      include: {
        plan: { include: { _count: { select: { tenants: true } } } },
        _count: { select: { branches: true, memberships: true, customers: true, appointments: true, orders: true, sales: true } },
        auditLogs: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
        setup: true,
        branches: { where: { active: true }, orderBy: { createdAt: "asc" }, take: 1, select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }) : [],
    plansNeeded ? prisma.platformPlan.findMany({ include: { _count: { select: { tenants: true } } }, orderBy: [{ active: "desc" }, { monthlyPriceCents: "asc" }] }) : [],
    needed("users") ? prisma.user.findMany({ where: { platformRole: { not: null } }, include: { _count: { select: { memberships: true } } }, orderBy: { createdAt: "asc" } }) : [],
    needed("audit") ? prisma.auditLog.findMany({ take: 100, orderBy: { createdAt: "desc" }, include: { tenant: { select: { id: true, name: true, slug: true } }, user: { select: { id: true, name: true, email: true } }, branch: { select: { id: true, name: true } } } }) : [],
    businessNeeded ? prisma.sale.groupBy({ by: ["tenantId"], where: { createdAt: { gte: monthStart } }, _sum: { totalCents: true }, _count: { id: true } }) : [],
    businessNeeded ? prisma.appointment.groupBy({ by: ["tenantId"], where: { createdAt: { gte: monthStart } }, _count: { id: true } }) : [],
    businessNeeded ? prisma.restaurantOrder.groupBy({ by: ["tenantId"], where: { createdAt: { gte: monthStart } }, _count: { id: true } }) : [],
    businessNeeded ? prisma.transportTrip.groupBy({ by: ["tenantId"], where: { createdAt: { gte: monthStart } }, _count: { id: true } }) : [],
    businessNeeded ? prisma.transportPayment.groupBy({ by: ["tenantId"], where: { paidAt: { gte: monthStart }, direction: "IN", status: "POSTED" }, _sum: { amountCents: true }, _count: { id: true } }) : [],
    systemNeeded ? prisma.transportDataJob.groupBy({ by: ["status"], _count: { id: true } }) : [],
    systemNeeded ? prisma.session.count({ where: { expiresAt: { gt: new Date() } } }) : 0,
    systemNeeded ? prisma.auditLog.count() : 0,
    systemNeeded ? prisma.transportDataJob.count({ where: { status: "PROCESSING", startedAt: { lte: staleBefore } } }) : 0,
    systemNeeded ? prisma.storedObject.aggregate({ where: { status: "ACTIVE" }, _count: { id: true }, _sum: { sizeBytes: true } }) : { _count: { id: 0 }, _sum: { sizeBytes: 0 } },
    billingNeeded ? prisma.billingCheckoutSession.findMany({ take: 30, orderBy: { createdAt: "desc" }, include: { plan: { select: { name: true } }, tenant: { select: { slug: true } } } }) : [],
    billingNeeded ? prisma.billingInvoice.findMany({ take: 30, orderBy: { createdAt: "desc" }, include: { tenant: { select: { name: true } }, subscription: { include: { plan: { select: { name: true } } } } } }) : [],
    billingNeeded ? prisma.billingPayment.findMany({ take: 30, orderBy: { createdAt: "desc" }, include: { tenant: { select: { name: true } } } }) : [],
    billingNeeded ? prisma.billingWebhookEvent.findMany({ take: 30, orderBy: { createdAt: "desc" }, include: { tenant: { select: { name: true } } } }) : [],
    billingNeeded ? prisma.emailOutbox.findMany({ take: 30, orderBy: { createdAt: "desc" }, include: { tenant: { select: { name: true } } } }) : [],
    billingMetricsNeeded ? prisma.billingInvoice.groupBy({ by: ["status"], _count: { id: true }, _sum: { amountPaidCents: true } }) : [],
    billingMetricsNeeded ? prisma.billingPayment.groupBy({ by: ["status"], _count: { id: true } }) : [],
    billingMetricsNeeded ? prisma.billingCheckoutSession.count({ where: { status: "OPEN", expiresAt: { gt: new Date() } } }) : 0,
    billingMetricsNeeded ? prisma.billingWebhookEvent.count({ where: { status: "FAILED" } }) : 0,
    billingMetricsNeeded ? prisma.emailOutbox.count({ where: { status: { in: ["QUEUED", "FAILED"] } } }) : 0,
  ]);

  const salesByTenant = new Map(monthlySales.map((row) => [row.tenantId, { count: row._count.id, cents: row._sum.totalCents ?? 0 }]));
  const appointmentsByTenant = new Map(monthlyAppointments.map((row) => [row.tenantId, row._count.id]));
  const ordersByTenant = new Map(monthlyOrders.map((row) => [row.tenantId, row._count.id]));
  const tripsByTenant = new Map(monthlyTrips.map((row) => [row.tenantId, row._count.id]));
  const transportRevenueByTenant = new Map(monthlyTransportPayments.map((row) => [row.tenantId, { count: row._count.id, cents: row._sum.amountCents ?? 0 }]));
  const jobsByStatus = new Map(jobGroups.map((row) => [row.status, row._count.id]));
  const invoicesByStatus = new Map(invoiceGroups.map((row) => [row.status, { count: row._count.id, paidCents: row._sum.amountPaidCents ?? 0 }]));
  const paymentsByStatus = new Map(paymentGroups.map((row) => [row.status, row._count.id]));
  const billing = billingConfiguration();
  const email = emailConfiguration();
  const planView = (plan: typeof planRecords[number]): PlatformPlanView => ({
    id: plan.id,
    key: plan.key,
    name: plan.name,
    description: plan.description,
    monthlyPriceCents: plan.monthlyPriceCents,
    maxUsers: plan.maxUsers,
    maxMonthlyOperations: plan.maxMonthlyOperations,
    publicWebsiteEnabled: plan.publicWebsiteEnabled,
    features: parseFeatures(plan.features),
    active: plan.active,
    tenantCount: plan._count.tenants,
  });
  const plansById = new Map(planRecords.map((plan) => [plan.id, planView(plan)]));

  const businesses = tenantRecords.map((tenant) => {
    const sales = salesByTenant.get(tenant.id) ?? { count: 0, cents: 0 };
    const transportRevenue = transportRevenueByTenant.get(tenant.id) ?? { count: 0, cents: 0 };
    const operations = (appointmentsByTenant.get(tenant.id) ?? 0) + (ordersByTenant.get(tenant.id) ?? 0) + (tripsByTenant.get(tenant.id) ?? 0);
    return {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      shortName: tenant.shortName,
      type: tenant.type as "BARBERSHOP" | "RESTAURANT" | "TRANSPORT",
      status: tenant.status,
      country: tenant.country,
      currency: tenant.currency,
      timezone: tenant.timezone,
      email: tenant.email,
      phone: tenant.phone,
      address: tenant.address,
      branchName: tenant.branches[0]?.name ?? "Sede principal",
      createdAt: tenant.createdAt.toISOString(),
      updatedAt: tenant.updatedAt.toISOString(),
      subscriptionStatus: tenant.subscriptionStatus,
      subscriptionStartedAt: tenant.subscriptionStartedAt.toISOString(),
      subscriptionEndsAt: tenant.subscriptionEndsAt?.toISOString() ?? null,
      trialEndsAt: tenant.trialEndsAt?.toISOString() ?? null,
      cancelAtPeriodEnd: tenant.cancelAtPeriodEnd,
      plan: tenant.planId ? plansById.get(tenant.planId) ?? null : null,
      counts: { branches: tenant._count.branches, users: tenant._count.memberships, customers: tenant._count.customers, operations, sales: sales.count + transportRevenue.count },
      monthlyRevenueCents: sales.cents + transportRevenue.cents,
      lastActivityAt: tenant.auditLogs[0]?.createdAt.toISOString() ?? null,
      enabledModules: parseStringArray(tenant.enabledModules),
      setup: (() => {
        if (!tenant.setup) return { status: "NOT_STARTED" as const, currentStep: "BUSINESS", completedSteps: [], progress: 0, templateKey: null, updatedAt: null, data: {} };
        const completedSteps = parseStringArray(tenant.setup.completedSteps);
        const required = tenant.type === "RESTAURANT" ? ["BUSINESS", "MODULES", "CATALOG", "TEAM", "OPERATIONS", "TABLES", "PRINTING"] : ["BUSINESS", "MODULES", "CATALOG", "TEAM", "OPERATIONS"];
        const completedCount = required.filter((step) => completedSteps.includes(step)).length;
        return { status: tenant.setup.status as "DRAFT" | "READY", currentStep: tenant.setup.currentStep, completedSteps, progress: tenant.setup.status === "READY" ? 100 : Math.round((completedCount / required.length) * 100), templateKey: tenant.setup.templateKey, updatedAt: tenant.setup.updatedAt.toISOString(), data: parseObject(tenant.setup.data) };
      })(),
    };
  });

  return {
    currentTenantId,
    metrics: {
      totalBusinesses: businesses.length,
      activeBusinesses: businesses.filter((item) => item.status === "ACTIVE").length,
      trialBusinesses: businesses.filter((item) => item.subscriptionStatus === "TRIAL").length,
      suspendedBusinesses: businesses.filter((item) => item.status === "SUSPENDED").length,
      activeSubscriptions: businesses.filter((item) => item.subscriptionStatus === "ACTIVE").length,
      monthlyRecurringRevenueCents: businesses.filter((item) => item.status === "ACTIVE" && item.subscriptionStatus === "ACTIVE").reduce((sum, item) => sum + (item.plan?.monthlyPriceCents ?? 0), 0),
      monthlyOperations: businesses.reduce((sum, item) => sum + item.counts.operations, 0),
      monthlySalesCents: businesses.reduce((sum, item) => sum + item.monthlyRevenueCents, 0),
    },
    businesses,
    plans: planRecords.map(planView),
    users: userRecords.map((user) => ({ id: user.id, name: user.name, email: user.email, active: user.active, platformRole: user.platformRole!, createdAt: user.createdAt.toISOString(), tenantCount: user._count.memberships })),
    audit: auditRecords.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
    billing: {
      configuration: { provider: billing.provider, configured: billing.configured, webhookConfigured: billing.webhookConfigured, emailProvider: email.provider, emailConfigured: email.configured },
      metrics: { openCheckouts, paidInvoices: invoicesByStatus.get("PAID")?.count ?? 0, openInvoices: invoicesByStatus.get("OPEN")?.count ?? 0, failedPayments: paymentsByStatus.get("FAILED") ?? 0, collectedCents: invoicesByStatus.get("PAID")?.paidCents ?? 0, failedEvents: failedBillingEvents, queuedEmails },
      checkouts: checkoutRecords.map((item) => ({ id: item.id, email: item.email, businessName: item.businessName, businessSlug: item.businessSlug, status: item.status, provider: item.provider, amountCents: item.amountCents, currency: item.currency, createdAt: item.createdAt.toISOString(), expiresAt: item.expiresAt.toISOString(), planName: item.plan.name, tenantSlug: item.tenant?.slug ?? null })),
      invoices: invoiceRecords.map((item) => ({ id: item.id, invoiceNumber: item.invoiceNumber, status: item.status, provider: item.provider, amountDueCents: item.amountDueCents, amountPaidCents: item.amountPaidCents, currency: item.currency, createdAt: item.createdAt.toISOString(), paidAt: item.paidAt?.toISOString() ?? null, businessName: item.tenant.name, planName: item.subscription?.plan.name ?? null })),
      payments: paymentRecords.map((item) => ({ id: item.id, status: item.status, provider: item.provider, amountCents: item.amountCents, currency: item.currency, createdAt: item.createdAt.toISOString(), paidAt: item.paidAt?.toISOString() ?? null, failureMessage: item.failureMessage, businessName: item.tenant.name })),
      events: billingEventRecords.map((item) => ({ id: item.id, externalEventId: item.externalEventId, type: item.type, status: item.status, attempts: item.attempts, lastError: item.lastError, createdAt: item.createdAt.toISOString(), businessName: item.tenant?.name ?? null })),
      emails: emailRecords.map((item) => ({ id: item.id, recipient: item.recipient, template: item.template, status: item.status, attempts: item.attempts, createdAt: item.createdAt.toISOString(), sentAt: item.sentAt?.toISOString() ?? null, businessName: item.tenant?.name ?? null })),
    },
    catalog: [
      { key: "BARBERSHOP", name: "Barberías y salones", description: "Agenda, profesionales, servicios, clientes, cobros y caja.", businessCount: businesses.filter((item) => item.type === "BARBERSHOP").length, modules: ["Panel", "Agenda", "Equipo", "Servicios", "Clientes", "Caja"], color: "#7758d8" },
      { key: "RESTAURANT", name: "Restaurantes", description: "Salón, mesas, carta, pedidos, cocina, clientes y caja.", businessCount: businesses.filter((item) => item.type === "RESTAURANT").length, modules: ["Panel", "Mesas", "Carta", "Pedidos", "Cocina", "Caja"], color: "#de7a38" },
      { key: "TRANSPORT", name: "Transporte y logística", description: "Viajes, flota, conductores, descansos, trazabilidad, finanzas y mantenimiento.", businessCount: businesses.filter((item) => item.type === "TRANSPORT").length, modules: ["Operaciones", "Flota", "Conductores", "Finanzas", "Combustible", "Mantenimiento", "Neumáticos"], color: "#187f71" },
    ],
    system: { activeSessions, auditEvents, queuedJobs: jobsByStatus.get("QUEUED") ?? 0, processingJobs: jobsByStatus.get("PROCESSING") ?? 0, failedJobs: jobsByStatus.get("FAILED") ?? 0, staleJobs, storedObjects: storedObjects._count.id, storedBytes: storedObjects._sum.sizeBytes ?? 0, storageProvider: storageConfiguration().provider, generatedAt: new Date().toISOString() },
    setupTemplates: (needed("dashboard", "businesses") ? setupTemplates : []).map((template) => ({ key: template.key, type: template.type, name: template.name, description: template.description, modules: [...template.modules], preparationAreaSuggestions: [...template.preparationAreas], restaurantConfiguration: "restaurantConfiguration" in template ? template.restaurantConfiguration : undefined, transportConfiguration: "transportConfiguration" in template ? template.transportConfiguration : undefined })),
  };
}
