ALTER TABLE "Tenant" ADD COLUMN "enabledModules" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "Tenant" ADD COLUMN "businessHours" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "Tenant" ADD COLUMN "paymentMethods" TEXT NOT NULL DEFAULT '["CASH","CARD","TRANSFER","YAPE","PLIN"]';

CREATE TABLE "BusinessSetup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "templateKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "currentStep" TEXT NOT NULL DEFAULT 'BUSINESS',
    "completedSteps" TEXT NOT NULL DEFAULT '[]',
    "data" TEXT NOT NULL DEFAULT '{}',
    "updatedById" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BusinessSetup_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "BusinessSetup_tenantId_key" ON "BusinessSetup"("tenantId");
CREATE INDEX "BusinessSetup_status_updatedAt_idx" ON "BusinessSetup"("status", "updatedAt");
