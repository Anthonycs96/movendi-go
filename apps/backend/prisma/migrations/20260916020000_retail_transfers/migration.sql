-- CreateTable
CREATE TABLE "RetailTransfer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "sourceBranchId" TEXT NOT NULL,
    "destinationBranchId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "dispatchedById" TEXT,
    "receivedById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "lines" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" DATETIME,
    "receivedAt" DATETIME,
    CONSTRAINT "RetailTransfer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RetailTransfer_sourceBranchId_fkey" FOREIGN KEY ("sourceBranchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RetailTransfer_destinationBranchId_fkey" FOREIGN KEY ("destinationBranchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "RetailTransfer_tenantId_sourceBranchId_status_idx" ON "RetailTransfer"("tenantId", "sourceBranchId", "status");

-- CreateIndex
CREATE INDEX "RetailTransfer_tenantId_destinationBranchId_status_idx" ON "RetailTransfer"("tenantId", "destinationBranchId", "status");

