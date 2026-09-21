-- AlterTable
ALTER TABLE "TransportInventoryItem" ADD COLUMN "inventoryCategory" TEXT;

-- CreateTable
CREATE TABLE "InventoryPresentation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "factor" REAL NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "InventoryPresentation_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "TransportInventoryItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Product" (
    "stockMode" TEXT NOT NULL DEFAULT 'RECIPE',
    "inventoryItemId" TEXT,
    "showInMenu" BOOLEAN NOT NULL DEFAULT true,
    "imageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "taxCategory" TEXT NOT NULL DEFAULT 'GRAVADA',
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
    CONSTRAINT "Product_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "TransportInventoryItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Product_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Product_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Product_preparationAreaId_fkey" FOREIGN KEY ("preparationAreaId") REFERENCES "PreparationArea" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("active", "areaAssignmentMode", "branchId", "categoryId", "costCents", "createdAt", "description", "detectedAreaKey", "id", "kitchenArea", "name", "preparationAreaId", "priceCents", "productType", "taxCategory", "tenantId", "updatedAt") SELECT "active", "areaAssignmentMode", "branchId", "categoryId", "costCents", "createdAt", "description", "detectedAreaKey", "id", "kitchenArea", "name", "preparationAreaId", "priceCents", "productType", "taxCategory", "tenantId", "updatedAt" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE UNIQUE INDEX "Product_inventoryItemId_key" ON "Product"("inventoryItemId");
CREATE INDEX "Product_tenantId_branchId_active_idx" ON "Product"("tenantId", "branchId", "active");
CREATE INDEX "Product_tenantId_categoryId_idx" ON "Product"("tenantId", "categoryId");
CREATE INDEX "Product_preparationAreaId_idx" ON "Product"("preparationAreaId");
CREATE UNIQUE INDEX "Product_tenantId_branchId_name_key" ON "Product"("tenantId", "branchId", "name");
CREATE TABLE "new_OrderItem" (
    "startedAt" DATETIME,
    "readyAt" DATETIME,
    "servedAt" DATETIME,
    "startedByUserId" TEXT,
    "readyByUserId" TEXT,
    "servedByUserId" TEXT,
    "preparationAreaKey" TEXT NOT NULL DEFAULT 'GENERAL',
    "preparationAreaName" TEXT NOT NULL DEFAULT 'General',
    "stockModeSnapshot" TEXT NOT NULL DEFAULT 'RECIPE',
    "recipeSnapshot" TEXT,
    "taxCategory" TEXT NOT NULL DEFAULT 'GRAVADA',
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "parentProductId" TEXT,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPriceCents" INTEGER NOT NULL,
    "unitCostCents" INTEGER,
    "totalCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    CONSTRAINT "OrderItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "RestaurantOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_parentProductId_fkey" FOREIGN KEY ("parentProductId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_OrderItem" ("id", "name", "notes", "orderId", "parentProductId", "preparationAreaKey", "preparationAreaName", "productId", "quantity", "readyAt", "readyByUserId", "recipeSnapshot", "servedAt", "servedByUserId", "startedAt", "startedByUserId", "status", "taxCategory", "tenantId", "totalCents", "unitCostCents", "unitPriceCents") SELECT "id", "name", "notes", "orderId", "parentProductId", "preparationAreaKey", "preparationAreaName", "productId", "quantity", "readyAt", "readyByUserId", "recipeSnapshot", "servedAt", "servedByUserId", "startedAt", "startedByUserId", "status", "taxCategory", "tenantId", "totalCents", "unitCostCents", "unitPriceCents" FROM "OrderItem";
DROP TABLE "OrderItem";
ALTER TABLE "new_OrderItem" RENAME TO "OrderItem";
CREATE INDEX "OrderItem_tenantId_orderId_idx" ON "OrderItem"("tenantId", "orderId");
CREATE INDEX "OrderItem_tenantId_status_idx" ON "OrderItem"("tenantId", "status");
CREATE INDEX "OrderItem_parentProductId_idx" ON "OrderItem"("parentProductId");
CREATE TABLE "new_InventoryPurchaseLine" (
    "presentationName" TEXT NOT NULL DEFAULT 'Unidad base',
    "presentationFactor" REAL NOT NULL DEFAULT 1,
    "purchasedQuantity" REAL,
    "presentationCostCents" INTEGER,
    "id" TEXT NOT NULL PRIMARY KEY,
    "purchaseId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "unitCostCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    CONSTRAINT "InventoryPurchaseLine_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "InventoryPurchase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryPurchaseLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "TransportInventoryItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_InventoryPurchaseLine" ("id", "itemId", "purchaseId", "quantity", "totalCents", "unitCostCents") SELECT "id", "itemId", "purchaseId", "quantity", "totalCents", "unitCostCents" FROM "InventoryPurchaseLine";
DROP TABLE "InventoryPurchaseLine";
ALTER TABLE "new_InventoryPurchaseLine" RENAME TO "InventoryPurchaseLine";
CREATE INDEX "InventoryPurchaseLine_purchaseId_idx" ON "InventoryPurchaseLine"("purchaseId");
CREATE INDEX "InventoryPurchaseLine_itemId_idx" ON "InventoryPurchaseLine"("itemId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "InventoryPresentation_itemId_name_key" ON "InventoryPresentation"("itemId", "name");

