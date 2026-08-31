-- Baseline PostgreSQL del esquema operativo completo de MOVENDI GO.
-- Las migraciones PostgreSQL anteriores nunca fueron aplicadas en producción;
-- este baseline reemplaza esa historia incompleta y habilita migrate deploy.

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "country" TEXT NOT NULL DEFAULT 'PE',
    "locale" TEXT NOT NULL DEFAULT 'es-PE',
    "timezone" TEXT NOT NULL DEFAULT 'America/Lima',
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "enabledModules" TEXT NOT NULL DEFAULT '[]',
    "businessHours" TEXT NOT NULL DEFAULT '{}',
    "paymentMethods" TEXT NOT NULL DEFAULT '["CASH","CARD","TRANSFER","YAPE","PLIN"]',
    "publicSitePublished" BOOLEAN NOT NULL DEFAULT false,
    "publicSiteHeadline" TEXT,
    "publicSiteDescription" TEXT,
    "publicSitePrimaryColor" TEXT NOT NULL DEFAULT '#F2A900',
    "publicSiteWhatsapp" TEXT,
    "publicSiteInstagram" TEXT,
    "planId" TEXT,
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'TRIAL',
    "subscriptionStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subscriptionEndsAt" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessSetup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "templateKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "currentStep" TEXT NOT NULL DEFAULT 'BUSINESS',
    "completedSteps" TEXT NOT NULL DEFAULT '[]',
    "data" TEXT NOT NULL DEFAULT '{}',
    "updatedById" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessSetup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportConfiguration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "settings" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantConfiguration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "settings" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantBranchConfiguration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "settings" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantBranchConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantConfigurationVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "actorId" TEXT,
    "scope" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RestaurantConfigurationVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformPlan" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "monthlyPriceCents" INTEGER NOT NULL DEFAULT 0,
    "maxUsers" INTEGER NOT NULL DEFAULT 5,
    "maxMonthlyOperations" INTEGER NOT NULL DEFAULT 500,
    "publicWebsiteEnabled" BOOLEAN NOT NULL DEFAULT false,
    "features" TEXT NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingCustomer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerCustomerRef" TEXT,
    "billingEmail" TEXT NOT NULL,
    "legalName" TEXT,
    "taxId" TEXT,
    "country" TEXT NOT NULL DEFAULT 'PE',
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingCheckoutSession" (
    "id" TEXT NOT NULL,
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
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingCheckoutSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingSubscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "checkoutSessionId" TEXT,
    "provider" TEXT NOT NULL,
    "providerSubscriptionRef" TEXT,
    "status" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingInvoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "provider" TEXT NOT NULL,
    "providerInvoiceRef" TEXT,
    "invoiceNumber" TEXT,
    "status" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "amountDueCents" INTEGER NOT NULL,
    "amountPaidCents" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "hostedInvoiceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingPayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "provider" TEXT NOT NULL,
    "providerPaymentRef" TEXT,
    "status" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingWebhookEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "provider" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "payload" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "lastError" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailOutbox" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "recipient" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "platformRole" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "branchId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginThrottle" (
    "id" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginThrottle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "name" TEXT NOT NULL,
    "dni" TEXT,
    "documentType" TEXT,
    "segment" TEXT,
    "loyaltyPoints" INTEGER NOT NULL DEFAULT 0,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffMember" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "specialty" TEXT,
    "commissionPct" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffSchedule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startsAt" TEXT NOT NULL,
    "endsAt" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "StaffSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "durationMinutes" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "priceCents" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "preparationAreaId" TEXT,
    "detectedAreaKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceCents" INTEGER NOT NULL,
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "kitchenArea" TEXT NOT NULL DEFAULT 'KITCHEN',
    "productType" TEXT NOT NULL DEFAULT 'FOOD',
    "areaAssignmentMode" TEXT NOT NULL DEFAULT 'SPECIFIC_AREA',
    "detectedAreaKey" TEXT,
    "preparationAreaId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreparationArea" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedKey" TEXT,
    "type" TEXT NOT NULL DEFAULT 'CUSTOM',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "dispatchMode" TEXT NOT NULL DEFAULT 'KDS',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreparationArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintDevice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "connectionType" TEXT NOT NULL DEFAULT 'LOCAL_AGENT',
    "tokenHash" TEXT,
    "tokenHint" TEXT,
    "paperWidthMm" INTEGER NOT NULL DEFAULT 80,
    "automatic" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrintDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreparationAreaPrinter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "printerId" TEXT NOT NULL,
    "copies" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreparationAreaPrinter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantPrintSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'SIMPLE',
    "automatic" BOOLEAN NOT NULL DEFAULT true,
    "defaultPrinterId" TEXT,
    "fields" TEXT NOT NULL DEFAULT '["table","orderCode","createdAt","waiter","itemNotes","orderNotes"]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantPrintSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiningArea" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiningArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiningTable" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "seats" INTEGER NOT NULL DEFAULT 2,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "qrToken" TEXT,
    "reservationName" TEXT,
    "reservationPhone" TEXT,
    "reservationAt" TIMESTAMP(3),
    "reservationPartySize" INTEGER,
    "reservationNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiningTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "tableId" TEXT,
    "customerId" TEXT,
    "createdById" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'DINE_IN',
    "deliveryPhone" TEXT,
    "deliveryAddress" TEXT,
    "deliveryReference" TEXT,
    "deliveryFeeCents" INTEGER NOT NULL DEFAULT 0,
    "deliveryStatus" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "promotionId" TEXT,
    "promotionName" TEXT,
    "promotionCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "RestaurantOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantPrintJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "orderId" TEXT,
    "createdById" TEXT NOT NULL,
    "preparationAreaId" TEXT,
    "printerId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payload" TEXT NOT NULL,
    "copies" INTEGER NOT NULL DEFAULT 1,
    "automatic" BOOLEAN NOT NULL DEFAULT true,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "printedAt" TIMESTAMP(3),
    "stationId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "leaseExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantPrintJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "kind" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "buyQuantity" INTEGER NOT NULL DEFAULT 2,
    "freeQuantity" INTEGER NOT NULL DEFAULT 1,
    "scope" TEXT NOT NULL DEFAULT 'ORDER',
    "categoryId" TEXT,
    "productId" TEXT,
    "minSubtotalCents" INTEGER NOT NULL DEFAULT 0,
    "maxDiscountCents" INTEGER,
    "automatic" BOOLEAN NOT NULL DEFAULT true,
    "weekdays" TEXT NOT NULL DEFAULT '0,1,2,3,4,5,6',
    "startTime" TEXT,
    "endTime" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "parentProductId" TEXT,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPriceCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitchenTicket" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KitchenTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "openedById" TEXT NOT NULL,
    "closedById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "openingCents" INTEGER NOT NULL DEFAULT 0,
    "expectedCents" INTEGER NOT NULL DEFAULT 0,
    "countedCents" INTEGER,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "CashSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT,
    "appointmentId" TEXT,
    "orderId" TEXT,
    "cashSessionId" TEXT,
    "cashierId" TEXT,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PAID',
    "paymentMethod" TEXT NOT NULL,
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "promotionName" TEXT,
    "totalCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalePayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "cashSessionId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantIntegrationCredential" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "apiUrl" TEXT NOT NULL,
    "encryptedToken" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "tokenHint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "lastTestedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantIntegrationCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantDocumentSequence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "RestaurantDocumentSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantElectronicDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestId" TEXT,
    "response" TEXT,
    "pdfUrl" TEXT,
    "xmlUrl" TEXT,
    "cdrUrl" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "issuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantElectronicDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportParty" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "documentType" TEXT NOT NULL DEFAULT 'RUC',
    "documentNo" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportParty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportOperation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "customerId" TEXT,
    "plannedStartAt" TIMESTAMP(3) NOT NULL,
    "plannedEndAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "description" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportLocation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "district" TEXT,
    "province" TEXT,
    "department" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportRoute" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "originId" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "distanceKm" DOUBLE PRECISION NOT NULL,
    "estimatedMinutes" INTEGER NOT NULL,
    "tollEstimateCents" INTEGER NOT NULL DEFAULT 0,
    "baseFreightCents" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportVehicle" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "capacityKg" DOUBLE PRECISION,
    "odometerKm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "technicalDueAt" TIMESTAMP(3),
    "soatDueAt" TIMESTAMP(3),
    "gpsDeviceId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportVehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportTrailer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "type" TEXT NOT NULL,
    "capacityKg" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportTrailer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportDriver" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentNo" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'PAYROLL',
    "phone" TEXT,
    "email" TEXT,
    "licenseNo" TEXT NOT NULL,
    "licenseClass" TEXT NOT NULL,
    "licenseDueAt" TIMESTAMP(3) NOT NULL,
    "hireDate" TIMESTAMP(3),
    "workRegimeName" TEXT NOT NULL DEFAULT '6x1',
    "workDays" INTEGER NOT NULL DEFAULT 6,
    "restDays" INTEGER NOT NULL DEFAULT 1,
    "workCycleAnchor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportDriver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportDriverLeave" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportDriverLeave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportWorkLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "workDate" TIMESTAMP(3) NOT NULL,
    "scheduledType" TEXT NOT NULL DEFAULT 'WORK',
    "clockInAt" TIMESTAMP(3),
    "clockOutAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportWorkLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportTrip" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "operationId" TEXT,
    "customerId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "cargoDescription" TEXT NOT NULL,
    "cargoWeightKg" DOUBLE PRECISION,
    "scheduledStartAt" TIMESTAMP(3) NOT NULL,
    "scheduledEndAt" TIMESTAMP(3) NOT NULL,
    "actualStartAt" TIMESTAMP(3),
    "actualEndAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "referenceNo" TEXT,
    "notes" TEXT,
    "freightCents" INTEGER NOT NULL DEFAULT 0,
    "budgetCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportTrip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "trailerId" TEXT,
    "driverId" TEXT NOT NULL,
    "secondDriverId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    "reason" TEXT,

    CONSTRAINT "TransportAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportTrackingEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "odometerKm" DOUBLE PRECISION,
    "description" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',

    CONSTRAINT "TransportTrackingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "number" TEXT,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'VALID',
    "fileUrl" TEXT,
    "storageObjectId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportIncident" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportExpense" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tripId" TEXT,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "receiptNo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportSettlement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "incomeCents" INTEGER NOT NULL,
    "expenseCents" INTEGER NOT NULL,
    "balanceCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportPayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tripId" TEXT,
    "direction" TEXT NOT NULL,
    "partyType" TEXT NOT NULL,
    "partyId" TEXT,
    "category" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportFuelLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tripId" TEXT,
    "vehicleId" TEXT NOT NULL,
    "loadedAt" TIMESTAMP(3) NOT NULL,
    "station" TEXT NOT NULL,
    "liters" DOUBLE PRECISION NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "odometerKm" DOUBLE PRECISION NOT NULL,
    "invoiceNo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportFuelLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportMaintenanceOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "scheduledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "odometerKm" DOUBLE PRECISION,
    "estimatedCents" INTEGER NOT NULL DEFAULT 0,
    "actualCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportMaintenanceOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportInventoryItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'MATERIAL',
    "unit" TEXT NOT NULL DEFAULT 'UND',
    "stock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minimumStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitCostCents" INTEGER NOT NULL DEFAULT 0,
    "trackStock" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportInventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportInventoryMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "itemId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'IN',
    "quantity" DOUBLE PRECISION NOT NULL,
    "stockBefore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stockAfter" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitCostCents" INTEGER NOT NULL DEFAULT 0,
    "totalCostCents" INTEGER NOT NULL DEFAULT 0,
    "originType" TEXT NOT NULL DEFAULT 'MANUAL',
    "originId" TEXT,
    "idempotencyKey" TEXT,
    "orderId" TEXT,
    "saleId" TEXT,
    "purchaseId" TEXT,
    "countId" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportInventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryPurchase" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "documentNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryPurchaseLine" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitCostCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,

    CONSTRAINT "InventoryPurchaseLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryCount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "notes" TEXT,
    "countedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryCountLine" (
    "id" TEXT NOT NULL,
    "countId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "expectedQuantity" DOUBLE PRECISION NOT NULL,
    "countedQuantity" DOUBLE PRECISION NOT NULL,
    "difference" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "InventoryCountLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductRecipe" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "yieldQuantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductRecipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductRecipeIngredient" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "wastePercent" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "ProductRecipeIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportTire" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "serialNo" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT,
    "size" TEXT NOT NULL,
    "purchaseAt" TIMESTAMP(3),
    "purchaseCents" INTEGER NOT NULL DEFAULT 0,
    "initialTreadMm" DOUBLE PRECISION,
    "currentTreadMm" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'STOCK',
    "currentVehicleId" TEXT,
    "currentPosition" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportTire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportDataJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "parameters" TEXT NOT NULL,
    "resultName" TEXT,
    "resultMime" TEXT,
    "resultData" TEXT,
    "storageObjectId" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportDataJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoredObject" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "scanStatus" TEXT NOT NULL DEFAULT 'SKIPPED',
    "expiresAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoredObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportTireEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tireId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "type" TEXT NOT NULL,
    "position" TEXT,
    "treadMm" DOUBLE PRECISION,
    "odometerKm" DOUBLE PRECISION,
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportTireEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Tenant_type_status_idx" ON "Tenant"("type", "status");

-- CreateIndex
CREATE INDEX "Tenant_planId_subscriptionStatus_idx" ON "Tenant"("planId", "subscriptionStatus");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessSetup_tenantId_key" ON "BusinessSetup"("tenantId");

-- CreateIndex
CREATE INDEX "BusinessSetup_status_updatedAt_idx" ON "BusinessSetup"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TransportConfiguration_tenantId_key" ON "TransportConfiguration"("tenantId");

-- CreateIndex
CREATE INDEX "TransportConfiguration_updatedAt_idx" ON "TransportConfiguration"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantConfiguration_tenantId_key" ON "RestaurantConfiguration"("tenantId");

-- CreateIndex
CREATE INDEX "RestaurantConfiguration_updatedAt_idx" ON "RestaurantConfiguration"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantBranchConfiguration_branchId_key" ON "RestaurantBranchConfiguration"("branchId");

-- CreateIndex
CREATE INDEX "RestaurantBranchConfiguration_tenantId_updatedAt_idx" ON "RestaurantBranchConfiguration"("tenantId", "updatedAt");

-- CreateIndex
CREATE INDEX "RestaurantConfigurationVersion_tenantId_branchId_createdAt_idx" ON "RestaurantConfigurationVersion"("tenantId", "branchId", "createdAt");

-- CreateIndex
CREATE INDEX "RestaurantConfigurationVersion_tenantId_section_version_idx" ON "RestaurantConfigurationVersion"("tenantId", "section", "version");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformPlan_key_key" ON "PlatformPlan"("key");

-- CreateIndex
CREATE INDEX "PlatformPlan_active_monthlyPriceCents_idx" ON "PlatformPlan"("active", "monthlyPriceCents");

-- CreateIndex
CREATE UNIQUE INDEX "BillingCustomer_tenantId_key" ON "BillingCustomer"("tenantId");

-- CreateIndex
CREATE INDEX "BillingCustomer_provider_billingEmail_idx" ON "BillingCustomer"("provider", "billingEmail");

-- CreateIndex
CREATE UNIQUE INDEX "BillingCustomer_provider_providerCustomerRef_key" ON "BillingCustomer"("provider", "providerCustomerRef");

-- CreateIndex
CREATE INDEX "BillingCheckoutSession_status_expiresAt_idx" ON "BillingCheckoutSession"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "BillingCheckoutSession_email_createdAt_idx" ON "BillingCheckoutSession"("email", "createdAt");

-- CreateIndex
CREATE INDEX "BillingCheckoutSession_businessSlug_status_idx" ON "BillingCheckoutSession"("businessSlug", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BillingCheckoutSession_provider_providerSessionRef_key" ON "BillingCheckoutSession"("provider", "providerSessionRef");

-- CreateIndex
CREATE UNIQUE INDEX "BillingSubscription_checkoutSessionId_key" ON "BillingSubscription"("checkoutSessionId");

-- CreateIndex
CREATE INDEX "BillingSubscription_tenantId_status_idx" ON "BillingSubscription"("tenantId", "status");

-- CreateIndex
CREATE INDEX "BillingSubscription_status_currentPeriodEnd_idx" ON "BillingSubscription"("status", "currentPeriodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "BillingSubscription_provider_providerSubscriptionRef_key" ON "BillingSubscription"("provider", "providerSubscriptionRef");

-- CreateIndex
CREATE INDEX "BillingInvoice_tenantId_status_createdAt_idx" ON "BillingInvoice"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingInvoice_provider_providerInvoiceRef_key" ON "BillingInvoice"("provider", "providerInvoiceRef");

-- CreateIndex
CREATE INDEX "BillingPayment_tenantId_status_createdAt_idx" ON "BillingPayment"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingPayment_provider_providerPaymentRef_key" ON "BillingPayment"("provider", "providerPaymentRef");

-- CreateIndex
CREATE INDEX "BillingWebhookEvent_status_createdAt_idx" ON "BillingWebhookEvent"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BillingWebhookEvent_tenantId_createdAt_idx" ON "BillingWebhookEvent"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingWebhookEvent_provider_externalEventId_key" ON "BillingWebhookEvent"("provider", "externalEventId");

-- CreateIndex
CREATE INDEX "EmailOutbox_status_availableAt_idx" ON "EmailOutbox"("status", "availableAt");

-- CreateIndex
CREATE INDEX "EmailOutbox_tenantId_createdAt_idx" ON "EmailOutbox"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Branch_tenantId_active_idx" ON "Branch"("tenantId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_tenantId_name_key" ON "Branch"("tenantId", "name");

-- CreateIndex
CREATE INDEX "User_email_active_idx" ON "User"("email", "active");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_platformRole_key" ON "User"("email", "platformRole");

-- CreateIndex
CREATE INDEX "Role_tenantId_idx" ON "Role"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_tenantId_key_key" ON "Role"("tenantId", "key");

-- CreateIndex
CREATE INDEX "Membership_tenantId_active_idx" ON "Membership"("tenantId", "active");

-- CreateIndex
CREATE INDEX "Membership_userId_active_idx" ON "Membership"("userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_tenantId_userId_key" ON "Membership"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "Session_tenantId_expiresAt_idx" ON "Session"("tenantId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "LoginThrottle_keyHash_key" ON "LoginThrottle"("keyHash");

-- CreateIndex
CREATE INDEX "LoginThrottle_blockedUntil_idx" ON "LoginThrottle"("blockedUntil");

-- CreateIndex
CREATE INDEX "Customer_tenantId_branchId_active_idx" ON "Customer"("tenantId", "branchId", "active");

-- CreateIndex
CREATE INDEX "Customer_tenantId_name_idx" ON "Customer"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_tenantId_phone_key" ON "Customer"("tenantId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_tenantId_dni_key" ON "Customer"("tenantId", "dni");

-- CreateIndex
CREATE INDEX "StaffMember_tenantId_branchId_active_idx" ON "StaffMember"("tenantId", "branchId", "active");

-- CreateIndex
CREATE INDEX "StaffMember_tenantId_name_idx" ON "StaffMember"("tenantId", "name");

-- CreateIndex
CREATE INDEX "StaffSchedule_tenantId_branchId_weekday_idx" ON "StaffSchedule"("tenantId", "branchId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "StaffSchedule_staffId_weekday_key" ON "StaffSchedule"("staffId", "weekday");

-- CreateIndex
CREATE INDEX "Service_tenantId_branchId_active_idx" ON "Service"("tenantId", "branchId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Service_tenantId_branchId_name_key" ON "Service"("tenantId", "branchId", "name");

-- CreateIndex
CREATE INDEX "Appointment_tenantId_branchId_startsAt_idx" ON "Appointment"("tenantId", "branchId", "startsAt");

-- CreateIndex
CREATE INDEX "Appointment_tenantId_branchId_status_idx" ON "Appointment"("tenantId", "branchId", "status");

-- CreateIndex
CREATE INDEX "Appointment_tenantId_staffId_startsAt_idx" ON "Appointment"("tenantId", "staffId", "startsAt");

-- CreateIndex
CREATE INDEX "Category_tenantId_branchId_active_idx" ON "Category"("tenantId", "branchId", "active");

-- CreateIndex
CREATE INDEX "Category_preparationAreaId_idx" ON "Category"("preparationAreaId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_tenantId_branchId_name_key" ON "Category"("tenantId", "branchId", "name");

-- CreateIndex
CREATE INDEX "Product_tenantId_branchId_active_idx" ON "Product"("tenantId", "branchId", "active");

-- CreateIndex
CREATE INDEX "Product_tenantId_categoryId_idx" ON "Product"("tenantId", "categoryId");

-- CreateIndex
CREATE INDEX "Product_preparationAreaId_idx" ON "Product"("preparationAreaId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_tenantId_branchId_name_key" ON "Product"("tenantId", "branchId", "name");

-- CreateIndex
CREATE INDEX "PreparationArea_tenantId_branchId_active_idx" ON "PreparationArea"("tenantId", "branchId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "PreparationArea_tenantId_branchId_name_key" ON "PreparationArea"("tenantId", "branchId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "PreparationArea_tenantId_branchId_normalizedKey_key" ON "PreparationArea"("tenantId", "branchId", "normalizedKey");

-- CreateIndex
CREATE UNIQUE INDEX "PrintDevice_tokenHash_key" ON "PrintDevice"("tokenHash");

-- CreateIndex
CREATE INDEX "PrintDevice_tenantId_branchId_active_idx" ON "PrintDevice"("tenantId", "branchId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "PrintDevice_tenantId_branchId_name_key" ON "PrintDevice"("tenantId", "branchId", "name");

-- CreateIndex
CREATE INDEX "PreparationAreaPrinter_tenantId_branchId_active_idx" ON "PreparationAreaPrinter"("tenantId", "branchId", "active");

-- CreateIndex
CREATE INDEX "PreparationAreaPrinter_printerId_idx" ON "PreparationAreaPrinter"("printerId");

-- CreateIndex
CREATE UNIQUE INDEX "PreparationAreaPrinter_areaId_printerId_key" ON "PreparationAreaPrinter"("areaId", "printerId");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantPrintSettings_branchId_key" ON "RestaurantPrintSettings"("branchId");

-- CreateIndex
CREATE INDEX "RestaurantPrintSettings_tenantId_branchId_idx" ON "RestaurantPrintSettings"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "DiningArea_tenantId_branchId_active_idx" ON "DiningArea"("tenantId", "branchId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "DiningArea_tenantId_branchId_name_key" ON "DiningArea"("tenantId", "branchId", "name");

-- CreateIndex
CREATE INDEX "DiningTable_tenantId_branchId_status_idx" ON "DiningTable"("tenantId", "branchId", "status");

-- CreateIndex
CREATE INDEX "DiningTable_qrToken_idx" ON "DiningTable"("qrToken");

-- CreateIndex
CREATE UNIQUE INDEX "DiningTable_tenantId_branchId_name_key" ON "DiningTable"("tenantId", "branchId", "name");

-- CreateIndex
CREATE INDEX "RestaurantOrder_tenantId_branchId_status_idx" ON "RestaurantOrder"("tenantId", "branchId", "status");

-- CreateIndex
CREATE INDEX "RestaurantOrder_tenantId_tableId_status_idx" ON "RestaurantOrder"("tenantId", "tableId", "status");

-- CreateIndex
CREATE INDEX "RestaurantOrder_tenantId_createdAt_idx" ON "RestaurantOrder"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantOrder_tenantId_code_key" ON "RestaurantOrder"("tenantId", "code");

-- CreateIndex
CREATE INDEX "RestaurantPrintJob_tenantId_branchId_status_createdAt_idx" ON "RestaurantPrintJob"("tenantId", "branchId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "RestaurantPrintJob_tenantId_branchId_leaseExpiresAt_idx" ON "RestaurantPrintJob"("tenantId", "branchId", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "RestaurantPrintJob_orderId_createdAt_idx" ON "RestaurantPrintJob"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "RestaurantPrintJob_tenantId_branchId_printerId_status_creat_idx" ON "RestaurantPrintJob"("tenantId", "branchId", "printerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Promotion_tenantId_branchId_active_idx" ON "Promotion"("tenantId", "branchId", "active");

-- CreateIndex
CREATE INDEX "Promotion_tenantId_startsAt_endsAt_idx" ON "Promotion"("tenantId", "startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Promotion_tenantId_branchId_code_key" ON "Promotion"("tenantId", "branchId", "code");

-- CreateIndex
CREATE INDEX "OrderItem_tenantId_orderId_idx" ON "OrderItem"("tenantId", "orderId");

-- CreateIndex
CREATE INDEX "OrderItem_tenantId_status_idx" ON "OrderItem"("tenantId", "status");

-- CreateIndex
CREATE INDEX "OrderItem_parentProductId_idx" ON "OrderItem"("parentProductId");

-- CreateIndex
CREATE UNIQUE INDEX "KitchenTicket_orderId_key" ON "KitchenTicket"("orderId");

-- CreateIndex
CREATE INDEX "KitchenTicket_tenantId_branchId_status_idx" ON "KitchenTicket"("tenantId", "branchId", "status");

-- CreateIndex
CREATE INDEX "KitchenTicket_tenantId_createdAt_idx" ON "KitchenTicket"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "CashSession_tenantId_branchId_status_idx" ON "CashSession"("tenantId", "branchId", "status");

-- CreateIndex
CREATE INDEX "CashSession_tenantId_openedAt_idx" ON "CashSession"("tenantId", "openedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_appointmentId_key" ON "Sale"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_orderId_key" ON "Sale"("orderId");

-- CreateIndex
CREATE INDEX "Sale_tenantId_branchId_createdAt_idx" ON "Sale"("tenantId", "branchId", "createdAt");

-- CreateIndex
CREATE INDEX "Sale_tenantId_cashierId_createdAt_idx" ON "Sale"("tenantId", "cashierId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_tenantId_code_key" ON "Sale"("tenantId", "code");

-- CreateIndex
CREATE INDEX "SalePayment_tenantId_branchId_createdAt_idx" ON "SalePayment"("tenantId", "branchId", "createdAt");

-- CreateIndex
CREATE INDEX "SalePayment_saleId_idx" ON "SalePayment"("saleId");

-- CreateIndex
CREATE INDEX "CashMovement_tenantId_branchId_createdAt_idx" ON "CashMovement"("tenantId", "branchId", "createdAt");

-- CreateIndex
CREATE INDEX "CashMovement_cashSessionId_idx" ON "CashMovement"("cashSessionId");

-- CreateIndex
CREATE INDEX "RestaurantIntegrationCredential_tenantId_status_idx" ON "RestaurantIntegrationCredential"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantIntegrationCredential_tenantId_provider_key" ON "RestaurantIntegrationCredential"("tenantId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantDocumentSequence_tenantId_branchId_kind_series_key" ON "RestaurantDocumentSequence"("tenantId", "branchId", "kind", "series");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantElectronicDocument_saleId_key" ON "RestaurantElectronicDocument"("saleId");

-- CreateIndex
CREATE INDEX "RestaurantElectronicDocument_tenantId_branchId_createdAt_idx" ON "RestaurantElectronicDocument"("tenantId", "branchId", "createdAt");

-- CreateIndex
CREATE INDEX "RestaurantElectronicDocument_tenantId_status_updatedAt_idx" ON "RestaurantElectronicDocument"("tenantId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantElectronicDocument_tenantId_kind_series_number_key" ON "RestaurantElectronicDocument"("tenantId", "kind", "series", "number");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_entityType_entityId_idx" ON "AuditLog"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "TransportParty_tenantId_kind_active_idx" ON "TransportParty"("tenantId", "kind", "active");

-- CreateIndex
CREATE INDEX "TransportParty_tenantId_active_legalName_idx" ON "TransportParty"("tenantId", "active", "legalName");

-- CreateIndex
CREATE UNIQUE INDEX "TransportParty_tenantId_documentNo_kind_key" ON "TransportParty"("tenantId", "documentNo", "kind");

-- CreateIndex
CREATE INDEX "TransportOperation_tenantId_branchId_status_plannedStartAt_idx" ON "TransportOperation"("tenantId", "branchId", "status", "plannedStartAt");

-- CreateIndex
CREATE INDEX "TransportOperation_tenantId_customerId_idx" ON "TransportOperation"("tenantId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportOperation_tenantId_code_key" ON "TransportOperation"("tenantId", "code");

-- CreateIndex
CREATE INDEX "TransportLocation_tenantId_active_idx" ON "TransportLocation"("tenantId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "TransportLocation_tenantId_code_key" ON "TransportLocation"("tenantId", "code");

-- CreateIndex
CREATE INDEX "TransportRoute_tenantId_originId_destinationId_active_idx" ON "TransportRoute"("tenantId", "originId", "destinationId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "TransportRoute_tenantId_code_key" ON "TransportRoute"("tenantId", "code");

-- CreateIndex
CREATE INDEX "TransportVehicle_tenantId_status_active_idx" ON "TransportVehicle"("tenantId", "status", "active");

-- CreateIndex
CREATE INDEX "TransportVehicle_tenantId_active_plate_idx" ON "TransportVehicle"("tenantId", "active", "plate");

-- CreateIndex
CREATE UNIQUE INDEX "TransportVehicle_tenantId_plate_key" ON "TransportVehicle"("tenantId", "plate");

-- CreateIndex
CREATE INDEX "TransportTrailer_tenantId_status_active_idx" ON "TransportTrailer"("tenantId", "status", "active");

-- CreateIndex
CREATE UNIQUE INDEX "TransportTrailer_tenantId_plate_key" ON "TransportTrailer"("tenantId", "plate");

-- CreateIndex
CREATE INDEX "TransportDriver_tenantId_status_active_idx" ON "TransportDriver"("tenantId", "status", "active");

-- CreateIndex
CREATE INDEX "TransportDriver_tenantId_active_lastName_idx" ON "TransportDriver"("tenantId", "active", "lastName");

-- CreateIndex
CREATE UNIQUE INDEX "TransportDriver_tenantId_documentNo_key" ON "TransportDriver"("tenantId", "documentNo");

-- CreateIndex
CREATE UNIQUE INDEX "TransportDriver_tenantId_licenseNo_key" ON "TransportDriver"("tenantId", "licenseNo");

-- CreateIndex
CREATE INDEX "TransportDriverLeave_tenantId_driverId_startsAt_endsAt_idx" ON "TransportDriverLeave"("tenantId", "driverId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "TransportWorkLog_tenantId_workDate_status_idx" ON "TransportWorkLog"("tenantId", "workDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TransportWorkLog_driverId_workDate_key" ON "TransportWorkLog"("driverId", "workDate");

-- CreateIndex
CREATE INDEX "TransportTrip_tenantId_branchId_scheduledStartAt_idx" ON "TransportTrip"("tenantId", "branchId", "scheduledStartAt");

-- CreateIndex
CREATE INDEX "TransportTrip_tenantId_branchId_operationId_scheduledStartA_idx" ON "TransportTrip"("tenantId", "branchId", "operationId", "scheduledStartAt");

-- CreateIndex
CREATE INDEX "TransportTrip_tenantId_status_idx" ON "TransportTrip"("tenantId", "status");

-- CreateIndex
CREATE INDEX "TransportTrip_tenantId_branchId_status_scheduledStartAt_idx" ON "TransportTrip"("tenantId", "branchId", "status", "scheduledStartAt");

-- CreateIndex
CREATE UNIQUE INDEX "TransportTrip_tenantId_code_key" ON "TransportTrip"("tenantId", "code");

-- CreateIndex
CREATE INDEX "TransportAssignment_tenantId_tripId_status_idx" ON "TransportAssignment"("tenantId", "tripId", "status");

-- CreateIndex
CREATE INDEX "TransportAssignment_tenantId_driverId_startsAt_endsAt_idx" ON "TransportAssignment"("tenantId", "driverId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "TransportAssignment_tenantId_secondDriverId_startsAt_endsAt_idx" ON "TransportAssignment"("tenantId", "secondDriverId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "TransportAssignment_tenantId_vehicleId_startsAt_endsAt_idx" ON "TransportAssignment"("tenantId", "vehicleId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "TransportAssignment_tenantId_trailerId_startsAt_endsAt_idx" ON "TransportAssignment"("tenantId", "trailerId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "TransportTrackingEvent_tenantId_tripId_recordedAt_idx" ON "TransportTrackingEvent"("tenantId", "tripId", "recordedAt");

-- CreateIndex
CREATE INDEX "TransportDocument_tenantId_ownerType_ownerId_idx" ON "TransportDocument"("tenantId", "ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "TransportDocument_tenantId_expiresAt_status_idx" ON "TransportDocument"("tenantId", "expiresAt", "status");

-- CreateIndex
CREATE INDEX "TransportDocument_tenantId_status_expiresAt_idx" ON "TransportDocument"("tenantId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "TransportDocument_storageObjectId_idx" ON "TransportDocument"("storageObjectId");

-- CreateIndex
CREATE INDEX "TransportIncident_tenantId_status_severity_idx" ON "TransportIncident"("tenantId", "status", "severity");

-- CreateIndex
CREATE INDEX "TransportExpense_tenantId_tripId_status_idx" ON "TransportExpense"("tenantId", "tripId", "status");

-- CreateIndex
CREATE INDEX "TransportExpense_tenantId_status_occurredAt_idx" ON "TransportExpense"("tenantId", "status", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "TransportSettlement_tripId_key" ON "TransportSettlement"("tripId");

-- CreateIndex
CREATE INDEX "TransportSettlement_tenantId_status_idx" ON "TransportSettlement"("tenantId", "status");

-- CreateIndex
CREATE INDEX "TransportPayment_tenantId_tripId_paidAt_idx" ON "TransportPayment"("tenantId", "tripId", "paidAt");

-- CreateIndex
CREATE INDEX "TransportPayment_tenantId_status_paidAt_idx" ON "TransportPayment"("tenantId", "status", "paidAt");

-- CreateIndex
CREATE INDEX "TransportFuelLog_tenantId_vehicleId_loadedAt_idx" ON "TransportFuelLog"("tenantId", "vehicleId", "loadedAt");

-- CreateIndex
CREATE INDEX "TransportFuelLog_tenantId_status_loadedAt_idx" ON "TransportFuelLog"("tenantId", "status", "loadedAt");

-- CreateIndex
CREATE INDEX "TransportMaintenanceOrder_tenantId_status_scheduledAt_idx" ON "TransportMaintenanceOrder"("tenantId", "status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "TransportMaintenanceOrder_tenantId_code_key" ON "TransportMaintenanceOrder"("tenantId", "code");

-- CreateIndex
CREATE INDEX "TransportInventoryItem_tenantId_branchId_active_idx" ON "TransportInventoryItem"("tenantId", "branchId", "active");

-- CreateIndex
CREATE INDEX "TransportInventoryItem_tenantId_branchId_stock_minimumStock_idx" ON "TransportInventoryItem"("tenantId", "branchId", "stock", "minimumStock");

-- CreateIndex
CREATE UNIQUE INDEX "TransportInventoryItem_tenantId_branchId_sku_key" ON "TransportInventoryItem"("tenantId", "branchId", "sku");

-- CreateIndex
CREATE INDEX "TransportInventoryMovement_tenantId_branchId_itemId_occurre_idx" ON "TransportInventoryMovement"("tenantId", "branchId", "itemId", "occurredAt");

-- CreateIndex
CREATE INDEX "TransportInventoryMovement_tenantId_branchId_type_occurredA_idx" ON "TransportInventoryMovement"("tenantId", "branchId", "type", "occurredAt");

-- CreateIndex
CREATE INDEX "TransportInventoryMovement_saleId_idx" ON "TransportInventoryMovement"("saleId");

-- CreateIndex
CREATE INDEX "TransportInventoryMovement_orderId_idx" ON "TransportInventoryMovement"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportInventoryMovement_tenantId_idempotencyKey_key" ON "TransportInventoryMovement"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "InventoryPurchase_tenantId_branchId_purchasedAt_idx" ON "InventoryPurchase"("tenantId", "branchId", "purchasedAt");

-- CreateIndex
CREATE INDEX "InventoryPurchase_tenantId_branchId_supplierName_idx" ON "InventoryPurchase"("tenantId", "branchId", "supplierName");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryPurchase_tenantId_code_key" ON "InventoryPurchase"("tenantId", "code");

-- CreateIndex
CREATE INDEX "InventoryPurchaseLine_purchaseId_idx" ON "InventoryPurchaseLine"("purchaseId");

-- CreateIndex
CREATE INDEX "InventoryPurchaseLine_itemId_idx" ON "InventoryPurchaseLine"("itemId");

-- CreateIndex
CREATE INDEX "InventoryCount_tenantId_branchId_countedAt_idx" ON "InventoryCount"("tenantId", "branchId", "countedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCount_tenantId_code_key" ON "InventoryCount"("tenantId", "code");

-- CreateIndex
CREATE INDEX "InventoryCountLine_itemId_idx" ON "InventoryCountLine"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCountLine_countId_itemId_key" ON "InventoryCountLine"("countId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductRecipe_productId_key" ON "ProductRecipe"("productId");

-- CreateIndex
CREATE INDEX "ProductRecipeIngredient_itemId_idx" ON "ProductRecipeIngredient"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductRecipeIngredient_recipeId_itemId_key" ON "ProductRecipeIngredient"("recipeId", "itemId");

-- CreateIndex
CREATE INDEX "TransportTire_tenantId_status_active_idx" ON "TransportTire"("tenantId", "status", "active");

-- CreateIndex
CREATE INDEX "TransportTire_tenantId_active_serialNo_idx" ON "TransportTire"("tenantId", "active", "serialNo");

-- CreateIndex
CREATE UNIQUE INDEX "TransportTire_tenantId_serialNo_key" ON "TransportTire"("tenantId", "serialNo");

-- CreateIndex
CREATE INDEX "TransportDataJob_status_runAfter_idx" ON "TransportDataJob"("status", "runAfter");

-- CreateIndex
CREATE INDEX "TransportDataJob_status_startedAt_idx" ON "TransportDataJob"("status", "startedAt");

-- CreateIndex
CREATE INDEX "TransportDataJob_expiresAt_idx" ON "TransportDataJob"("expiresAt");

-- CreateIndex
CREATE INDEX "TransportDataJob_tenantId_createdAt_idx" ON "TransportDataJob"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "TransportDataJob_storageObjectId_idx" ON "TransportDataJob"("storageObjectId");

-- CreateIndex
CREATE INDEX "StoredObject_tenantId_purpose_status_createdAt_idx" ON "StoredObject"("tenantId", "purpose", "status", "createdAt");

-- CreateIndex
CREATE INDEX "StoredObject_status_expiresAt_idx" ON "StoredObject"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoredObject_provider_bucket_key_key" ON "StoredObject"("provider", "bucket", "key");

-- CreateIndex
CREATE INDEX "TransportTireEvent_tenantId_tireId_occurredAt_idx" ON "TransportTireEvent"("tenantId", "tireId", "occurredAt");

-- AddForeignKey
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlatformPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessSetup" ADD CONSTRAINT "BusinessSetup_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportConfiguration" ADD CONSTRAINT "TransportConfiguration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantConfiguration" ADD CONSTRAINT "RestaurantConfiguration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantBranchConfiguration" ADD CONSTRAINT "RestaurantBranchConfiguration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantBranchConfiguration" ADD CONSTRAINT "RestaurantBranchConfiguration_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantConfigurationVersion" ADD CONSTRAINT "RestaurantConfigurationVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantConfigurationVersion" ADD CONSTRAINT "RestaurantConfigurationVersion_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantConfigurationVersion" ADD CONSTRAINT "RestaurantConfigurationVersion_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingCustomer" ADD CONSTRAINT "BillingCustomer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingCheckoutSession" ADD CONSTRAINT "BillingCheckoutSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingCheckoutSession" ADD CONSTRAINT "BillingCheckoutSession_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlatformPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingSubscription" ADD CONSTRAINT "BillingSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingSubscription" ADD CONSTRAINT "BillingSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlatformPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingSubscription" ADD CONSTRAINT "BillingSubscription_checkoutSessionId_fkey" FOREIGN KEY ("checkoutSessionId") REFERENCES "BillingCheckoutSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingInvoice" ADD CONSTRAINT "BillingInvoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingInvoice" ADD CONSTRAINT "BillingInvoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "BillingSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "BillingInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingWebhookEvent" ADD CONSTRAINT "BillingWebhookEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailOutbox" ADD CONSTRAINT "EmailOutbox_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffSchedule" ADD CONSTRAINT "StaffSchedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffSchedule" ADD CONSTRAINT "StaffSchedule_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffSchedule" ADD CONSTRAINT "StaffSchedule_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_preparationAreaId_fkey" FOREIGN KEY ("preparationAreaId") REFERENCES "PreparationArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_preparationAreaId_fkey" FOREIGN KEY ("preparationAreaId") REFERENCES "PreparationArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreparationArea" ADD CONSTRAINT "PreparationArea_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreparationArea" ADD CONSTRAINT "PreparationArea_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintDevice" ADD CONSTRAINT "PrintDevice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintDevice" ADD CONSTRAINT "PrintDevice_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreparationAreaPrinter" ADD CONSTRAINT "PreparationAreaPrinter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreparationAreaPrinter" ADD CONSTRAINT "PreparationAreaPrinter_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreparationAreaPrinter" ADD CONSTRAINT "PreparationAreaPrinter_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "PreparationArea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreparationAreaPrinter" ADD CONSTRAINT "PreparationAreaPrinter_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "PrintDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantPrintSettings" ADD CONSTRAINT "RestaurantPrintSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantPrintSettings" ADD CONSTRAINT "RestaurantPrintSettings_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantPrintSettings" ADD CONSTRAINT "RestaurantPrintSettings_defaultPrinterId_fkey" FOREIGN KEY ("defaultPrinterId") REFERENCES "PrintDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiningArea" ADD CONSTRAINT "DiningArea_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiningArea" ADD CONSTRAINT "DiningArea_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiningTable" ADD CONSTRAINT "DiningTable_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiningTable" ADD CONSTRAINT "DiningTable_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiningTable" ADD CONSTRAINT "DiningTable_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "DiningArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantOrder" ADD CONSTRAINT "RestaurantOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantOrder" ADD CONSTRAINT "RestaurantOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantOrder" ADD CONSTRAINT "RestaurantOrder_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "DiningTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantOrder" ADD CONSTRAINT "RestaurantOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantOrder" ADD CONSTRAINT "RestaurantOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantOrder" ADD CONSTRAINT "RestaurantOrder_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantPrintJob" ADD CONSTRAINT "RestaurantPrintJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantPrintJob" ADD CONSTRAINT "RestaurantPrintJob_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantPrintJob" ADD CONSTRAINT "RestaurantPrintJob_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "RestaurantOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantPrintJob" ADD CONSTRAINT "RestaurantPrintJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantPrintJob" ADD CONSTRAINT "RestaurantPrintJob_preparationAreaId_fkey" FOREIGN KEY ("preparationAreaId") REFERENCES "PreparationArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantPrintJob" ADD CONSTRAINT "RestaurantPrintJob_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "PrintDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "RestaurantOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_parentProductId_fkey" FOREIGN KEY ("parentProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenTicket" ADD CONSTRAINT "KitchenTicket_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenTicket" ADD CONSTRAINT "KitchenTicket_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenTicket" ADD CONSTRAINT "KitchenTicket_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "RestaurantOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "RestaurantOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalePayment" ADD CONSTRAINT "SalePayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalePayment" ADD CONSTRAINT "SalePayment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalePayment" ADD CONSTRAINT "SalePayment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantIntegrationCredential" ADD CONSTRAINT "RestaurantIntegrationCredential_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantIntegrationCredential" ADD CONSTRAINT "RestaurantIntegrationCredential_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantDocumentSequence" ADD CONSTRAINT "RestaurantDocumentSequence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantDocumentSequence" ADD CONSTRAINT "RestaurantDocumentSequence_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantElectronicDocument" ADD CONSTRAINT "RestaurantElectronicDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantElectronicDocument" ADD CONSTRAINT "RestaurantElectronicDocument_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantElectronicDocument" ADD CONSTRAINT "RestaurantElectronicDocument_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportParty" ADD CONSTRAINT "TransportParty_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportOperation" ADD CONSTRAINT "TransportOperation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportOperation" ADD CONSTRAINT "TransportOperation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "TransportParty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportLocation" ADD CONSTRAINT "TransportLocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportRoute" ADD CONSTRAINT "TransportRoute_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportRoute" ADD CONSTRAINT "TransportRoute_originId_fkey" FOREIGN KEY ("originId") REFERENCES "TransportLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportRoute" ADD CONSTRAINT "TransportRoute_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "TransportLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportVehicle" ADD CONSTRAINT "TransportVehicle_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportTrailer" ADD CONSTRAINT "TransportTrailer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportDriver" ADD CONSTRAINT "TransportDriver_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportDriverLeave" ADD CONSTRAINT "TransportDriverLeave_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportDriverLeave" ADD CONSTRAINT "TransportDriverLeave_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "TransportDriver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportWorkLog" ADD CONSTRAINT "TransportWorkLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportWorkLog" ADD CONSTRAINT "TransportWorkLog_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "TransportDriver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportTrip" ADD CONSTRAINT "TransportTrip_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportTrip" ADD CONSTRAINT "TransportTrip_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "TransportOperation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportTrip" ADD CONSTRAINT "TransportTrip_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "TransportParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportTrip" ADD CONSTRAINT "TransportTrip_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "TransportRoute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportAssignment" ADD CONSTRAINT "TransportAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportAssignment" ADD CONSTRAINT "TransportAssignment_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "TransportTrip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportAssignment" ADD CONSTRAINT "TransportAssignment_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "TransportVehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportAssignment" ADD CONSTRAINT "TransportAssignment_trailerId_fkey" FOREIGN KEY ("trailerId") REFERENCES "TransportTrailer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportAssignment" ADD CONSTRAINT "TransportAssignment_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "TransportDriver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportAssignment" ADD CONSTRAINT "TransportAssignment_secondDriverId_fkey" FOREIGN KEY ("secondDriverId") REFERENCES "TransportDriver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportTrackingEvent" ADD CONSTRAINT "TransportTrackingEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportTrackingEvent" ADD CONSTRAINT "TransportTrackingEvent_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "TransportTrip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportDocument" ADD CONSTRAINT "TransportDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportDocument" ADD CONSTRAINT "TransportDocument_storageObjectId_fkey" FOREIGN KEY ("storageObjectId") REFERENCES "StoredObject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportIncident" ADD CONSTRAINT "TransportIncident_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportIncident" ADD CONSTRAINT "TransportIncident_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "TransportTrip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportExpense" ADD CONSTRAINT "TransportExpense_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportExpense" ADD CONSTRAINT "TransportExpense_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "TransportTrip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportSettlement" ADD CONSTRAINT "TransportSettlement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportSettlement" ADD CONSTRAINT "TransportSettlement_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "TransportTrip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportPayment" ADD CONSTRAINT "TransportPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportPayment" ADD CONSTRAINT "TransportPayment_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "TransportTrip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportFuelLog" ADD CONSTRAINT "TransportFuelLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportFuelLog" ADD CONSTRAINT "TransportFuelLog_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "TransportTrip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportFuelLog" ADD CONSTRAINT "TransportFuelLog_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "TransportVehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportMaintenanceOrder" ADD CONSTRAINT "TransportMaintenanceOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportMaintenanceOrder" ADD CONSTRAINT "TransportMaintenanceOrder_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "TransportVehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportInventoryItem" ADD CONSTRAINT "TransportInventoryItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportInventoryItem" ADD CONSTRAINT "TransportInventoryItem_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportInventoryMovement" ADD CONSTRAINT "TransportInventoryMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportInventoryMovement" ADD CONSTRAINT "TransportInventoryMovement_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportInventoryMovement" ADD CONSTRAINT "TransportInventoryMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "TransportInventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportInventoryMovement" ADD CONSTRAINT "TransportInventoryMovement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportInventoryMovement" ADD CONSTRAINT "TransportInventoryMovement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "RestaurantOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportInventoryMovement" ADD CONSTRAINT "TransportInventoryMovement_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportInventoryMovement" ADD CONSTRAINT "TransportInventoryMovement_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "InventoryPurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportInventoryMovement" ADD CONSTRAINT "TransportInventoryMovement_countId_fkey" FOREIGN KEY ("countId") REFERENCES "InventoryCount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryPurchase" ADD CONSTRAINT "InventoryPurchase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryPurchase" ADD CONSTRAINT "InventoryPurchase_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryPurchase" ADD CONSTRAINT "InventoryPurchase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryPurchaseLine" ADD CONSTRAINT "InventoryPurchaseLine_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "InventoryPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryPurchaseLine" ADD CONSTRAINT "InventoryPurchaseLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "TransportInventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "InventoryCountLine_countId_fkey" FOREIGN KEY ("countId") REFERENCES "InventoryCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "InventoryCountLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "TransportInventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRecipe" ADD CONSTRAINT "ProductRecipe_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRecipeIngredient" ADD CONSTRAINT "ProductRecipeIngredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "ProductRecipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRecipeIngredient" ADD CONSTRAINT "ProductRecipeIngredient_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "TransportInventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportTire" ADD CONSTRAINT "TransportTire_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportDataJob" ADD CONSTRAINT "TransportDataJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportDataJob" ADD CONSTRAINT "TransportDataJob_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportDataJob" ADD CONSTRAINT "TransportDataJob_storageObjectId_fkey" FOREIGN KEY ("storageObjectId") REFERENCES "StoredObject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoredObject" ADD CONSTRAINT "StoredObject_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoredObject" ADD CONSTRAINT "StoredObject_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportTireEvent" ADD CONSTRAINT "TransportTireEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportTireEvent" ADD CONSTRAINT "TransportTireEvent_tireId_fkey" FOREIGN KEY ("tireId") REFERENCES "TransportTire"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportTireEvent" ADD CONSTRAINT "TransportTireEvent_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "TransportVehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

