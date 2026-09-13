export interface PlatformPlanView {
  id: string;
  key: string;
  name: string;
  description: string | null;
  monthlyPriceCents: number;
  maxUsers: number;
  maxMonthlyOperations: number;
  publicWebsiteEnabled: boolean;
  features: string[];
  active: boolean;
  tenantCount: number;
}

export interface PlatformBusinessView {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  type: "BARBERSHOP" | "RESTAURANT" | "TRANSPORT" | "MINIMARKET";
  status: string;
  country: string;
  currency: string;
  timezone: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  branchName: string;
  createdAt: string;
  updatedAt: string;
  subscriptionStatus: string;
  subscriptionStartedAt: string;
  subscriptionEndsAt: string | null;
  trialEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  plan: PlatformPlanView | null;
  counts: { branches: number; users: number; customers: number; operations: number; sales: number };
  monthlyRevenueCents: number;
  lastActivityAt: string | null;
  enabledModules: string[];
  setup: PlatformSetupView;
}

export interface PlatformSetupView {
  status: "NOT_STARTED" | "DRAFT" | "READY";
  currentStep: string;
  completedSteps: string[];
  progress: number;
  templateKey: string | null;
  updatedAt: string | null;
  data: Record<string, unknown>;
}

export interface PlatformSetupTemplate {
  key: string;
  type: "BARBERSHOP" | "RESTAURANT" | "TRANSPORT" | "MINIMARKET";
  name: string;
  description: string;
  modules: string[];
  restaurantConfiguration?: import("@movendi/contracts").RestaurantConfiguration;
  transportConfiguration?: import("@movendi/contracts").TransportConfiguration;
}

export interface PlatformUserView {
  id: string;
  name: string;
  email: string;
  active: boolean;
  platformRole: string;
  createdAt: string;
  tenantCount: number;
}

export interface PlatformAuditView {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: string | null;
  createdAt: string;
  tenant: { id: string; name: string; slug: string };
  user: { id: string; name: string; email: string } | null;
  branch: { id: string; name: string } | null;
}

export interface PlatformBillingData {
  configuration: { provider: string; configured: boolean; webhookConfigured: boolean; emailProvider: string; emailConfigured: boolean };
  metrics: { openCheckouts: number; paidInvoices: number; openInvoices: number; failedPayments: number; collectedCents: number; failedEvents: number; queuedEmails: number };
  checkouts: Array<{ id: string; email: string; businessName: string | null; businessSlug: string | null; status: string; provider: string; amountCents: number; currency: string; createdAt: string; expiresAt: string; planName: string; tenantSlug: string | null }>;
  invoices: Array<{ id: string; invoiceNumber: string | null; status: string; provider: string; amountDueCents: number; amountPaidCents: number; currency: string; createdAt: string; paidAt: string | null; businessName: string; planName: string | null }>;
  payments: Array<{ id: string; status: string; provider: string; amountCents: number; currency: string; createdAt: string; paidAt: string | null; failureMessage: string | null; businessName: string }>;
  events: Array<{ id: string; externalEventId: string; type: string; status: string; attempts: number; lastError: string | null; createdAt: string; businessName: string | null }>;
  emails: Array<{ id: string; recipient: string; template: string; status: string; attempts: number; createdAt: string; sentAt: string | null; businessName: string | null }>;
}

export interface PlatformData {
  currentTenantId: string;
  metrics: {
    totalBusinesses: number;
    activeBusinesses: number;
    trialBusinesses: number;
    suspendedBusinesses: number;
    activeSubscriptions: number;
    monthlyRecurringRevenueCents: number;
    monthlyOperations: number;
    monthlySalesCents: number;
  };
  businesses: PlatformBusinessView[];
  plans: PlatformPlanView[];
  users: PlatformUserView[];
  audit: PlatformAuditView[];
  billing: PlatformBillingData;
  catalog: Array<{ key: string; name: string; description: string; businessCount: number; modules: string[]; color: string }>;
  system: { activeSessions: number; auditEvents: number; queuedJobs: number; processingJobs: number; failedJobs: number; staleJobs: number; storedObjects: number; storedBytes: number; storageProvider: string; generatedAt: string };
  setupTemplates: PlatformSetupTemplate[];
}
