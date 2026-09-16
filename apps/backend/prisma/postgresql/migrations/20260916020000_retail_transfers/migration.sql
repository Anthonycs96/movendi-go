-- CreateTable
CREATE TABLE "RetailTransfer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceBranchId" TEXT NOT NULL,
    "destinationBranchId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "dispatchedById" TEXT,
    "receivedById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "lines" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),

    CONSTRAINT "RetailTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RetailTransfer_tenantId_sourceBranchId_status_idx" ON "RetailTransfer"("tenantId", "sourceBranchId", "status");

-- CreateIndex
CREATE INDEX "RetailTransfer_tenantId_destinationBranchId_status_idx" ON "RetailTransfer"("tenantId", "destinationBranchId", "status");

-- AddForeignKey
ALTER TABLE "RetailTransfer" ADD CONSTRAINT "RetailTransfer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailTransfer" ADD CONSTRAINT "RetailTransfer_sourceBranchId_fkey" FOREIGN KEY ("sourceBranchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailTransfer" ADD CONSTRAINT "RetailTransfer_destinationBranchId_fkey" FOREIGN KEY ("destinationBranchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

