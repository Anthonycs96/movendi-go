-- Reconciliación versionada del esquema que antes dependía de prisma db push.
-- Este archivo se generó comparando una base vacía migrada con schema.prisma.

-- AlterTable
ALTER TABLE "DiningTable" ADD COLUMN "qrToken" TEXT;
ALTER TABLE "DiningTable" ADD COLUMN "reservationAt" DATETIME;
ALTER TABLE "DiningTable" ADD COLUMN "reservationName" TEXT;
ALTER TABLE "DiningTable" ADD COLUMN "reservationNotes" TEXT;
ALTER TABLE "DiningTable" ADD COLUMN "reservationPartySize" INTEGER;
ALTER TABLE "DiningTable" ADD COLUMN "reservationPhone" TEXT;

-- CreateTable
CREATE TABLE "PrintDevice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "connectionType" TEXT NOT NULL DEFAULT 'LOCAL_AGENT',
    "tokenHash" TEXT,
    "tokenHint" TEXT,
    "paperWidthMm" INTEGER NOT NULL DEFAULT 80,
    "automatic" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PrintDevice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PrintDevice_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PreparationAreaPrinter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "printerId" TEXT NOT NULL,
    "copies" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PreparationAreaPrinter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PreparationAreaPrinter_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PreparationAreaPrinter_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "PreparationArea" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PreparationAreaPrinter_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "PrintDevice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RestaurantPrintSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'SIMPLE',
    "automatic" BOOLEAN NOT NULL DEFAULT true,
    "defaultPrinterId" TEXT,
    "fields" TEXT NOT NULL DEFAULT '["table","orderCode","createdAt","waiter","itemNotes","orderNotes"]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RestaurantPrintSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RestaurantPrintSettings_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RestaurantPrintSettings_defaultPrinterId_fkey" FOREIGN KEY ("defaultPrinterId") REFERENCES "PrintDevice" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RestaurantPrintJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "printedAt" DATETIME,
    "stationId" TEXT,
    "claimedAt" DATETIME,
    "leaseExpiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RestaurantPrintJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RestaurantPrintJob_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RestaurantPrintJob_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "RestaurantOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RestaurantPrintJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RestaurantPrintJob_preparationAreaId_fkey" FOREIGN KEY ("preparationAreaId") REFERENCES "PreparationArea" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RestaurantPrintJob_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "PrintDevice" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Promotion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Promotion_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Promotion_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Promotion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransportInventoryItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'MATERIAL',
    "unit" TEXT NOT NULL DEFAULT 'UND',
    "stock" REAL NOT NULL DEFAULT 0,
    "minimumStock" REAL NOT NULL DEFAULT 0,
    "unitCostCents" INTEGER NOT NULL DEFAULT 0,
    "trackStock" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportInventoryItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportInventoryItem_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransportInventoryMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "itemId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'IN',
    "quantity" REAL NOT NULL,
    "stockBefore" REAL NOT NULL DEFAULT 0,
    "stockAfter" REAL NOT NULL DEFAULT 0,
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
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TransportInventoryMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportInventoryMovement_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportInventoryMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "TransportInventoryItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportInventoryMovement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TransportInventoryMovement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "RestaurantOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TransportInventoryMovement_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TransportInventoryMovement_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "InventoryPurchase" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TransportInventoryMovement_countId_fkey" FOREIGN KEY ("countId") REFERENCES "InventoryCount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryPurchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "documentNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "purchasedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryPurchase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryPurchase_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryPurchase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryPurchaseLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "purchaseId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "unitCostCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    CONSTRAINT "InventoryPurchaseLine_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "InventoryPurchase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryPurchaseLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "TransportInventoryItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryCount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "notes" TEXT,
    "countedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryCount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryCount_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryCount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryCountLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "countId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "expectedQuantity" REAL NOT NULL,
    "countedQuantity" REAL NOT NULL,
    "difference" REAL NOT NULL,
    CONSTRAINT "InventoryCountLine_countId_fkey" FOREIGN KEY ("countId") REFERENCES "InventoryCount" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryCountLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "TransportInventoryItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductRecipe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "yieldQuantity" REAL NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductRecipe_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductRecipeIngredient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recipeId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "wastePercent" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "ProductRecipeIngredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "ProductRecipe" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductRecipeIngredient_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "TransportInventoryItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "preparationAreaId" TEXT,
    "detectedAreaKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Category_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Category_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Category_preparationAreaId_fkey" FOREIGN KEY ("preparationAreaId") REFERENCES "PreparationArea" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Category" ("active", "branchId", "createdAt", "detectedAreaKey", "id", "name", "tenantId") SELECT "active", "branchId", "createdAt", "detectedAreaKey", "id", "name", "tenantId" FROM "Category";
DROP TABLE "Category";
ALTER TABLE "new_Category" RENAME TO "Category";
CREATE INDEX "Category_tenantId_branchId_active_idx" ON "Category"("tenantId", "branchId", "active");
CREATE INDEX "Category_preparationAreaId_idx" ON "Category"("preparationAreaId");
CREATE UNIQUE INDEX "Category_tenantId_branchId_name_key" ON "Category"("tenantId", "branchId", "name");
CREATE TABLE "new_OrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    CONSTRAINT "OrderItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "RestaurantOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_parentProductId_fkey" FOREIGN KEY ("parentProductId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_OrderItem" ("id", "name", "notes", "orderId", "parentProductId", "productId", "quantity", "status", "tenantId", "totalCents", "unitPriceCents") SELECT "id", "name", "notes", "orderId", "parentProductId", "productId", "quantity", "status", "tenantId", "totalCents", "unitPriceCents" FROM "OrderItem";
DROP TABLE "OrderItem";
ALTER TABLE "new_OrderItem" RENAME TO "OrderItem";
CREATE INDEX "OrderItem_tenantId_orderId_idx" ON "OrderItem"("tenantId", "orderId");
CREATE INDEX "OrderItem_tenantId_status_idx" ON "OrderItem"("tenantId", "status");
CREATE INDEX "OrderItem_parentProductId_idx" ON "OrderItem"("parentProductId");
CREATE TABLE "new_PlatformPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "monthlyPriceCents" INTEGER NOT NULL DEFAULT 0,
    "maxUsers" INTEGER NOT NULL DEFAULT 5,
    "maxMonthlyOperations" INTEGER NOT NULL DEFAULT 500,
    "publicWebsiteEnabled" BOOLEAN NOT NULL DEFAULT false,
    "features" TEXT NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_PlatformPlan" ("active", "createdAt", "description", "features", "id", "key", "maxMonthlyOperations", "maxUsers", "monthlyPriceCents", "name", "updatedAt") SELECT "active", "createdAt", "description", "features", "id", "key", "maxMonthlyOperations", "maxUsers", "monthlyPriceCents", "name", "updatedAt" FROM "PlatformPlan";
DROP TABLE "PlatformPlan";
ALTER TABLE "new_PlatformPlan" RENAME TO "PlatformPlan";
CREATE UNIQUE INDEX "PlatformPlan_key_key" ON "PlatformPlan"("key");
CREATE INDEX "PlatformPlan_active_monthlyPriceCents_idx" ON "PlatformPlan"("active", "monthlyPriceCents");
CREATE TABLE "new_Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Product_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Product_preparationAreaId_fkey" FOREIGN KEY ("preparationAreaId") REFERENCES "PreparationArea" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("active", "areaAssignmentMode", "branchId", "categoryId", "costCents", "createdAt", "description", "detectedAreaKey", "id", "kitchenArea", "name", "priceCents", "productType", "tenantId", "updatedAt") SELECT "active", "areaAssignmentMode", "branchId", "categoryId", "costCents", "createdAt", "description", "detectedAreaKey", "id", "kitchenArea", "name", "priceCents", "productType", "tenantId", "updatedAt" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE INDEX "Product_tenantId_branchId_active_idx" ON "Product"("tenantId", "branchId", "active");
CREATE INDEX "Product_tenantId_categoryId_idx" ON "Product"("tenantId", "categoryId");
CREATE INDEX "Product_preparationAreaId_idx" ON "Product"("preparationAreaId");
CREATE UNIQUE INDEX "Product_tenantId_branchId_name_key" ON "Product"("tenantId", "branchId", "name");
CREATE TABLE "new_RestaurantOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    CONSTRAINT "RestaurantOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RestaurantOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RestaurantOrder_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "DiningTable" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RestaurantOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RestaurantOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RestaurantOrder_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_RestaurantOrder" ("branchId", "code", "completedAt", "createdAt", "createdById", "customerId", "id", "notes", "source", "status", "subtotalCents", "tableId", "tenantId", "totalCents", "updatedAt") SELECT "branchId", "code", "completedAt", "createdAt", "createdById", "customerId", "id", "notes", "source", "status", "subtotalCents", "tableId", "tenantId", "totalCents", "updatedAt" FROM "RestaurantOrder";
DROP TABLE "RestaurantOrder";
ALTER TABLE "new_RestaurantOrder" RENAME TO "RestaurantOrder";
CREATE INDEX "RestaurantOrder_tenantId_branchId_status_idx" ON "RestaurantOrder"("tenantId", "branchId", "status");
CREATE INDEX "RestaurantOrder_tenantId_tableId_status_idx" ON "RestaurantOrder"("tenantId", "tableId", "status");
CREATE INDEX "RestaurantOrder_tenantId_createdAt_idx" ON "RestaurantOrder"("tenantId", "createdAt");
CREATE UNIQUE INDEX "RestaurantOrder_tenantId_code_key" ON "RestaurantOrder"("tenantId", "code");
CREATE TABLE "new_Sale" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Sale_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Sale_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Sale_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Sale_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "RestaurantOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Sale_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Sale_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Sale" ("appointmentId", "branchId", "cashSessionId", "code", "createdAt", "customerId", "id", "orderId", "paymentMethod", "status", "tenantId", "totalCents") SELECT "appointmentId", "branchId", "cashSessionId", "code", "createdAt", "customerId", "id", "orderId", "paymentMethod", "status", "tenantId", "totalCents" FROM "Sale";
DROP TABLE "Sale";
ALTER TABLE "new_Sale" RENAME TO "Sale";
CREATE UNIQUE INDEX "Sale_appointmentId_key" ON "Sale"("appointmentId");
CREATE UNIQUE INDEX "Sale_orderId_key" ON "Sale"("orderId");
CREATE INDEX "Sale_tenantId_branchId_createdAt_idx" ON "Sale"("tenantId", "branchId", "createdAt");
CREATE INDEX "Sale_tenantId_cashierId_createdAt_idx" ON "Sale"("tenantId", "cashierId", "createdAt");
CREATE UNIQUE INDEX "Sale_tenantId_code_key" ON "Sale"("tenantId", "code");
CREATE TABLE "new_Tenant" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "subscriptionStartedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subscriptionEndsAt" DATETIME,
    "trialEndsAt" DATETIME,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Tenant_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlatformPlan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Tenant" ("address", "businessHours", "cancelAtPeriodEnd", "country", "createdAt", "currency", "email", "enabledModules", "id", "name", "paymentMethods", "phone", "planId", "shortName", "slug", "status", "subscriptionEndsAt", "subscriptionStartedAt", "subscriptionStatus", "timezone", "trialEndsAt", "type", "updatedAt") SELECT "address", "businessHours", "cancelAtPeriodEnd", "country", "createdAt", "currency", "email", "enabledModules", "id", "name", "paymentMethods", "phone", "planId", "shortName", "slug", "status", "subscriptionEndsAt", "subscriptionStartedAt", "subscriptionStatus", "timezone", "trialEndsAt", "type", "updatedAt" FROM "Tenant";
DROP TABLE "Tenant";
ALTER TABLE "new_Tenant" RENAME TO "Tenant";
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");
CREATE INDEX "Tenant_type_status_idx" ON "Tenant"("type", "status");
CREATE INDEX "Tenant_planId_subscriptionStatus_idx" ON "Tenant"("planId", "subscriptionStatus");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "platformRole" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("active", "createdAt", "email", "id", "name", "passwordHash", "platformRole", "updatedAt") SELECT "active", "createdAt", "email", "id", "name", "passwordHash", "platformRole", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE INDEX "User_email_active_idx" ON "User"("email", "active");
CREATE UNIQUE INDEX "User_email_platformRole_key" ON "User"("email", "platformRole");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

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
CREATE INDEX "RestaurantPrintJob_tenantId_branchId_status_createdAt_idx" ON "RestaurantPrintJob"("tenantId", "branchId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "RestaurantPrintJob_tenantId_branchId_leaseExpiresAt_idx" ON "RestaurantPrintJob"("tenantId", "branchId", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "RestaurantPrintJob_orderId_createdAt_idx" ON "RestaurantPrintJob"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "RestaurantPrintJob_tenantId_branchId_printerId_status_createdAt_idx" ON "RestaurantPrintJob"("tenantId", "branchId", "printerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Promotion_tenantId_branchId_active_idx" ON "Promotion"("tenantId", "branchId", "active");

-- CreateIndex
CREATE INDEX "Promotion_tenantId_startsAt_endsAt_idx" ON "Promotion"("tenantId", "startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Promotion_tenantId_branchId_code_key" ON "Promotion"("tenantId", "branchId", "code");

-- CreateIndex
CREATE INDEX "TransportInventoryItem_tenantId_branchId_active_idx" ON "TransportInventoryItem"("tenantId", "branchId", "active");

-- CreateIndex
CREATE INDEX "TransportInventoryItem_tenantId_branchId_stock_minimumStock_idx" ON "TransportInventoryItem"("tenantId", "branchId", "stock", "minimumStock");

-- CreateIndex
CREATE UNIQUE INDEX "TransportInventoryItem_tenantId_branchId_sku_key" ON "TransportInventoryItem"("tenantId", "branchId", "sku");

-- CreateIndex
CREATE INDEX "TransportInventoryMovement_tenantId_branchId_itemId_occurredAt_idx" ON "TransportInventoryMovement"("tenantId", "branchId", "itemId", "occurredAt");

-- CreateIndex
CREATE INDEX "TransportInventoryMovement_tenantId_branchId_type_occurredAt_idx" ON "TransportInventoryMovement"("tenantId", "branchId", "type", "occurredAt");

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
CREATE INDEX "DiningTable_qrToken_idx" ON "DiningTable"("qrToken");

