-- Phase 2: durable data jobs and composite indexes for server-side filters.
CREATE TABLE "TransportDataJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "parameters" TEXT NOT NULL,
    "resultName" TEXT,
    "resultMime" TEXT,
    "resultData" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "runAfter" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportDataJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportDataJob_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TransportParty_tenantId_active_legalName_idx" ON "TransportParty"("tenantId", "active", "legalName");
CREATE INDEX "TransportVehicle_tenantId_active_plate_idx" ON "TransportVehicle"("tenantId", "active", "plate");
CREATE INDEX "TransportDriver_tenantId_active_lastName_idx" ON "TransportDriver"("tenantId", "active", "lastName");
CREATE INDEX "TransportTrip_tenantId_branchId_status_scheduledStartAt_idx" ON "TransportTrip"("tenantId", "branchId", "status", "scheduledStartAt");
CREATE INDEX "TransportDocument_tenantId_status_expiresAt_idx" ON "TransportDocument"("tenantId", "status", "expiresAt");
CREATE INDEX "TransportExpense_tenantId_status_occurredAt_idx" ON "TransportExpense"("tenantId", "status", "occurredAt");
CREATE INDEX "TransportPayment_tenantId_status_paidAt_idx" ON "TransportPayment"("tenantId", "status", "paidAt");
CREATE INDEX "TransportFuelLog_tenantId_status_loadedAt_idx" ON "TransportFuelLog"("tenantId", "status", "loadedAt");
CREATE INDEX "TransportTire_tenantId_active_serialNo_idx" ON "TransportTire"("tenantId", "active", "serialNo");
CREATE INDEX "TransportDataJob_status_runAfter_idx" ON "TransportDataJob"("status", "runAfter");
CREATE INDEX "TransportDataJob_tenantId_createdAt_idx" ON "TransportDataJob"("tenantId", "createdAt");
