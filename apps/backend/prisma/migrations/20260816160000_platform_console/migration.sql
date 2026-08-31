-- CreateTable
CREATE TABLE "PlatformPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "monthlyPriceCents" INTEGER NOT NULL DEFAULT 0,
    "maxUsers" INTEGER NOT NULL DEFAULT 5,
    "maxMonthlyOperations" INTEGER NOT NULL DEFAULT 500,
    "features" TEXT NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "country" TEXT NOT NULL DEFAULT 'PE';
ALTER TABLE "Tenant" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'America/Lima';
ALTER TABLE "Tenant" ADD COLUMN "planId" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "subscriptionStatus" TEXT NOT NULL DEFAULT 'TRIAL';
ALTER TABLE "Tenant" ADD COLUMN "subscriptionStartedAt" DATETIME NOT NULL DEFAULT '1970-01-01 00:00:00';
ALTER TABLE "Tenant" ADD COLUMN "subscriptionEndsAt" DATETIME;
ALTER TABLE "Tenant" ADD COLUMN "trialEndsAt" DATETIME;
ALTER TABLE "Tenant" ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "PlatformPlan_key_key" ON "PlatformPlan"("key");
CREATE INDEX "PlatformPlan_active_monthlyPriceCents_idx" ON "PlatformPlan"("active", "monthlyPriceCents");
CREATE INDEX "Tenant_planId_subscriptionStatus_idx" ON "Tenant"("planId", "subscriptionStatus");
