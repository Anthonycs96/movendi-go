CREATE TABLE "BillingCustomer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerCustomerRef" TEXT,
    "billingEmail" TEXT NOT NULL,
    "legalName" TEXT,
    "taxId" TEXT,
    "country" TEXT NOT NULL DEFAULT 'PE',
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BillingCustomer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "BillingCheckoutSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT,
    "planId" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'NEW_TENANT',
    "provider" TEXT NOT NULL,
    "providerSessionRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "email" TEXT NOT NULL,
    "businessName" TEXT,
    "businessShortName" TEXT,
    "businessSlug" TEXT,
    "businessType" TEXT,
    "adminName" TEXT,
    "adminPasswordHash" TEXT,
    "branchName" TEXT,
    "country" TEXT NOT NULL DEFAULT 'PE',
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "amountCents" INTEGER NOT NULL,
    "successUrl" TEXT,
    "cancelUrl" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BillingCheckoutSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BillingCheckoutSession_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlatformPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "BillingSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "checkoutSessionId" TEXT,
    "provider" TEXT NOT NULL,
    "providerSubscriptionRef" TEXT,
    "status" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "currentPeriodStart" DATETIME,
    "currentPeriodEnd" DATETIME,
    "trialEndsAt" DATETIME,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" DATETIME,
    "endedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BillingSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BillingSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlatformPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BillingSubscription_checkoutSessionId_fkey" FOREIGN KEY ("checkoutSessionId") REFERENCES "BillingCheckoutSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "BillingInvoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "provider" TEXT NOT NULL,
    "providerInvoiceRef" TEXT,
    "invoiceNumber" TEXT,
    "status" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "amountDueCents" INTEGER NOT NULL,
    "amountPaidCents" INTEGER NOT NULL DEFAULT 0,
    "dueAt" DATETIME,
    "paidAt" DATETIME,
    "hostedInvoiceUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BillingInvoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BillingInvoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "BillingSubscription" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "BillingPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "provider" TEXT NOT NULL,
    "providerPaymentRef" TEXT,
    "status" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BillingPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BillingPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "BillingInvoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "BillingWebhookEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT,
    "provider" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "payload" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "lastError" TEXT,
    "processedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BillingWebhookEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "EmailOutbox" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT,
    "recipient" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EmailOutbox_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "BillingCustomer_tenantId_key" ON "BillingCustomer"("tenantId");
CREATE INDEX "BillingCustomer_provider_billingEmail_idx" ON "BillingCustomer"("provider", "billingEmail");
CREATE UNIQUE INDEX "BillingCustomer_provider_providerCustomerRef_key" ON "BillingCustomer"("provider", "providerCustomerRef");
CREATE INDEX "BillingCheckoutSession_status_expiresAt_idx" ON "BillingCheckoutSession"("status", "expiresAt");
CREATE INDEX "BillingCheckoutSession_email_createdAt_idx" ON "BillingCheckoutSession"("email", "createdAt");
CREATE INDEX "BillingCheckoutSession_businessSlug_status_idx" ON "BillingCheckoutSession"("businessSlug", "status");
CREATE UNIQUE INDEX "BillingCheckoutSession_provider_providerSessionRef_key" ON "BillingCheckoutSession"("provider", "providerSessionRef");
CREATE UNIQUE INDEX "BillingSubscription_checkoutSessionId_key" ON "BillingSubscription"("checkoutSessionId");
CREATE INDEX "BillingSubscription_tenantId_status_idx" ON "BillingSubscription"("tenantId", "status");
CREATE INDEX "BillingSubscription_status_currentPeriodEnd_idx" ON "BillingSubscription"("status", "currentPeriodEnd");
CREATE UNIQUE INDEX "BillingSubscription_provider_providerSubscriptionRef_key" ON "BillingSubscription"("provider", "providerSubscriptionRef");
CREATE INDEX "BillingInvoice_tenantId_status_createdAt_idx" ON "BillingInvoice"("tenantId", "status", "createdAt");
CREATE UNIQUE INDEX "BillingInvoice_provider_providerInvoiceRef_key" ON "BillingInvoice"("provider", "providerInvoiceRef");
CREATE INDEX "BillingPayment_tenantId_status_createdAt_idx" ON "BillingPayment"("tenantId", "status", "createdAt");
CREATE UNIQUE INDEX "BillingPayment_provider_providerPaymentRef_key" ON "BillingPayment"("provider", "providerPaymentRef");
CREATE INDEX "BillingWebhookEvent_status_createdAt_idx" ON "BillingWebhookEvent"("status", "createdAt");
CREATE INDEX "BillingWebhookEvent_tenantId_createdAt_idx" ON "BillingWebhookEvent"("tenantId", "createdAt");
CREATE UNIQUE INDEX "BillingWebhookEvent_provider_externalEventId_key" ON "BillingWebhookEvent"("provider", "externalEventId");
CREATE INDEX "EmailOutbox_status_availableAt_idx" ON "EmailOutbox"("status", "availableAt");
CREATE INDEX "EmailOutbox_tenantId_createdAt_idx" ON "EmailOutbox"("tenantId", "createdAt");
