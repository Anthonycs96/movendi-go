-- CreateTable
CREATE TABLE "PlatformIntegration" (
    "provider" TEXT NOT NULL PRIMARY KEY,
    "encryptedToken" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "tokenHint" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "lastTestedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ExternalBackupRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    "prefix" TEXT NOT NULL,
    "files" INTEGER NOT NULL DEFAULT 0,
    "bytes" REAL NOT NULL DEFAULT 0,
    "restoreVerified" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT
);

-- CreateTable
CREATE TABLE "RestaurantLaunchPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "owner" TEXT NOT NULL DEFAULT '',
    "supportContact" TEXT NOT NULL DEFAULT '',
    "supportHours" TEXT NOT NULL DEFAULT '',
    "escalation" TEXT NOT NULL DEFAULT '',
    "participants" TEXT NOT NULL DEFAULT '',
    "devices" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "checks" TEXT NOT NULL DEFAULT '{}',
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RestaurantSupportTicket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "assignedTo" TEXT NOT NULL DEFAULT '',
    "resolution" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "ExternalBackupRun_startedAt_idx" ON "ExternalBackupRun"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantLaunchPlan_tenantId_branchId_key" ON "RestaurantLaunchPlan"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "RestaurantSupportTicket_tenantId_branchId_createdAt_idx" ON "RestaurantSupportTicket"("tenantId", "branchId", "createdAt");

-- CreateIndex
CREATE INDEX "RestaurantSupportTicket_status_priority_createdAt_idx" ON "RestaurantSupportTicket"("status", "priority", "createdAt");

