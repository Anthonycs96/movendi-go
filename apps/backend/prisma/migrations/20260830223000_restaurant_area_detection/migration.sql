ALTER TABLE "Category" ADD COLUMN "detectedAreaKey" TEXT;
ALTER TABLE "Product" ADD COLUMN "productType" TEXT NOT NULL DEFAULT 'FOOD';
ALTER TABLE "Product" ADD COLUMN "areaAssignmentMode" TEXT NOT NULL DEFAULT 'SPECIFIC_AREA';
ALTER TABLE "Product" ADD COLUMN "detectedAreaKey" TEXT;
ALTER TABLE "PreparationArea" ADD COLUMN "normalizedKey" TEXT;
ALTER TABLE "PreparationArea" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'CUSTOM';
ALTER TABLE "PreparationArea" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "PreparationArea" ADD COLUMN "dispatchMode" TEXT NOT NULL DEFAULT 'KDS';
CREATE UNIQUE INDEX "PreparationArea_tenantId_branchId_normalizedKey_key" ON "PreparationArea"("tenantId", "branchId", "normalizedKey");
