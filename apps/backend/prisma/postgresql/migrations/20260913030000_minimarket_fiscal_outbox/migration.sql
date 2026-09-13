-- AlterTable
ALTER TABLE "RetailProduct" ADD COLUMN     "taxCategory" TEXT NOT NULL DEFAULT 'UNCLASSIFIED';

-- CreateTable
CREATE TABLE "FiscalConfiguration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "environment" TEXT NOT NULL DEFAULT 'BETA',
    "taxRatePct" DOUBLE PRECISION NOT NULL DEFAULT 18,
    "invoiceSeries" TEXT NOT NULL DEFAULT 'F001',
    "receiptSeries" TEXT NOT NULL DEFAULT 'B001',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "originKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "environment" TEXT NOT NULL,
    "apiUrl" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "response" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FiscalConfiguration_branchId_key" ON "FiscalConfiguration"("branchId");

-- CreateIndex
CREATE INDEX "FiscalConfiguration_tenantId_idx" ON "FiscalConfiguration"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalJob_originKey_key" ON "FiscalJob"("originKey");

-- CreateIndex
CREATE INDEX "FiscalJob_status_nextAttemptAt_idx" ON "FiscalJob"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "FiscalJob_tenantId_branchId_saleId_idx" ON "FiscalJob"("tenantId", "branchId", "saleId");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalJob_tenantId_kind_series_number_key" ON "FiscalJob"("tenantId", "kind", "series", "number");

-- AddForeignKey
ALTER TABLE "FiscalConfiguration" ADD CONSTRAINT "FiscalConfiguration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalConfiguration" ADD CONSTRAINT "FiscalConfiguration_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalJob" ADD CONSTRAINT "FiscalJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalJob" ADD CONSTRAINT "FiscalJob_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalJob" ADD CONSTRAINT "FiscalJob_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

