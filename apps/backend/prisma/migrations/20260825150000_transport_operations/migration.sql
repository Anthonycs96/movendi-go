CREATE TABLE "TransportOperation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "customerId" TEXT,
    "plannedStartAt" DATETIME NOT NULL,
    "plannedEndAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "description" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportOperation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportOperation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "TransportParty" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

ALTER TABLE "TransportTrip" ADD COLUMN "operationId" TEXT REFERENCES "TransportOperation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "TransportOperation_tenantId_code_key" ON "TransportOperation"("tenantId", "code");
CREATE INDEX "TransportOperation_tenantId_branchId_status_plannedStartAt_idx" ON "TransportOperation"("tenantId", "branchId", "status", "plannedStartAt");
CREATE INDEX "TransportOperation_tenantId_customerId_idx" ON "TransportOperation"("tenantId", "customerId");
CREATE INDEX "TransportTrip_tenantId_branchId_operationId_scheduledStartAt_idx" ON "TransportTrip"("tenantId", "branchId", "operationId", "scheduledStartAt");
