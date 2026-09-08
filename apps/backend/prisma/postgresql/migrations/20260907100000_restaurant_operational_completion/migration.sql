ALTER TABLE "Tenant" ADD COLUMN "quotaVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN "taxCategory" TEXT NOT NULL DEFAULT 'GRAVADA';
ALTER TABLE "OrderItem" ADD COLUMN "preparationAreaKey" TEXT NOT NULL DEFAULT 'GENERAL';
ALTER TABLE "OrderItem" ADD COLUMN "preparationAreaName" TEXT NOT NULL DEFAULT 'General';
ALTER TABLE "OrderItem" ADD COLUMN "recipeSnapshot" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "taxCategory" TEXT NOT NULL DEFAULT 'GRAVADA';
ALTER TABLE "RestaurantIntegrationCredential" ADD COLUMN "environment" TEXT NOT NULL DEFAULT 'UNVERIFIED';
ALTER TABLE "RestaurantElectronicDocument" ADD COLUMN "environment" TEXT NOT NULL DEFAULT 'UNVERIFIED';
ALTER TABLE "RestaurantElectronicDocument" ADD COLUMN "requestPayload" TEXT;
CREATE TABLE "SaleRefund" (
  "id" TEXT NOT NULL PRIMARY KEY, "tenantId" TEXT NOT NULL, "branchId" TEXT NOT NULL,
  "saleId" TEXT NOT NULL, "actorId" TEXT NOT NULL, "reason" TEXT NOT NULL, "stockDisposition" TEXT NOT NULL,
  "totalCents" INTEGER NOT NULL, "cashCents" INTEGER NOT NULL, "payments" TEXT NOT NULL, "cashSessionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "creditStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
  "creditSeries" TEXT, "creditNumber" INTEGER, "creditPayload" TEXT, "creditResponse" TEXT, "creditError" TEXT, "creditUpdatedAt" TIMESTAMP(3),
  CONSTRAINT "SaleRefund_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SaleRefund_saleId_key" ON "SaleRefund"("saleId");
CREATE INDEX "SaleRefund_tenantId_branchId_createdAt_idx" ON "SaleRefund"("tenantId", "branchId", "createdAt");
-- Consolidate sequence counters before enforcing one series per issuer across branches.
UPDATE "RestaurantDocumentSequence" SET "nextNumber" = (
  SELECT MAX(other."nextNumber") FROM "RestaurantDocumentSequence" other
  WHERE other."tenantId" = "RestaurantDocumentSequence"."tenantId" AND other."kind" = "RestaurantDocumentSequence"."kind" AND other."series" = "RestaurantDocumentSequence"."series"
);
DELETE FROM "RestaurantDocumentSequence" WHERE "id" NOT IN (SELECT MIN("id") FROM "RestaurantDocumentSequence" GROUP BY "tenantId", "kind", "series");
DROP INDEX "RestaurantDocumentSequence_tenantId_branchId_kind_series_key";
CREATE UNIQUE INDEX "RestaurantDocumentSequence_tenantId_kind_series_key" ON "RestaurantDocumentSequence"("tenantId", "kind", "series");

ALTER TABLE "RestaurantOrder" ADD COLUMN "taxRatePct" DOUBLE PRECISION;

ALTER TABLE "RestaurantOrder" ADD COLUMN "taxIncluded" BOOLEAN;
