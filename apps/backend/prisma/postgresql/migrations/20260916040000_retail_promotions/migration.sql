-- AlterTable
ALTER TABLE "Promotion" ADD COLUMN     "minQuantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "retailPresentationId" TEXT,
ADD COLUMN     "retailProductId" TEXT;

-- AlterTable
ALTER TABLE "RetailProduct" ADD COLUMN     "expiryAlertDays" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "RetailPresentation" ADD COLUMN     "sku" TEXT;

-- AlterTable
ALTER TABLE "RetailSaleLine" ADD COLUMN     "discountCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "promotionName" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "RetailPresentation_tenantId_branchId_sku_key" ON "RetailPresentation"("tenantId", "branchId", "sku");

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_retailProductId_fkey" FOREIGN KEY ("retailProductId") REFERENCES "RetailProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_retailPresentationId_fkey" FOREIGN KEY ("retailPresentationId") REFERENCES "RetailPresentation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

