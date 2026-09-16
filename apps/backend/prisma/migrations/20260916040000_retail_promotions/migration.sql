-- Additive migration: existing promotions and sales remain unchanged.
ALTER TABLE "Promotion" ADD COLUMN "retailProductId" TEXT REFERENCES "RetailProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Promotion" ADD COLUMN "retailPresentationId" TEXT REFERENCES "RetailPresentation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Promotion" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Promotion" ADD COLUMN "minQuantity" REAL NOT NULL DEFAULT 1;
ALTER TABLE "RetailProduct" ADD COLUMN "expiryAlertDays" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "RetailPresentation" ADD COLUMN "sku" TEXT;
ALTER TABLE "RetailSaleLine" ADD COLUMN "discountCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "RetailSaleLine" ADD COLUMN "promotionName" TEXT;
CREATE UNIQUE INDEX "RetailPresentation_tenantId_branchId_sku_key" ON "RetailPresentation"("tenantId", "branchId", "sku");
