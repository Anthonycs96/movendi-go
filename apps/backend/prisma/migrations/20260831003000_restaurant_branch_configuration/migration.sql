CREATE TABLE "RestaurantBranchConfiguration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "settings" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RestaurantBranchConfiguration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RestaurantBranchConfiguration_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "RestaurantBranchConfiguration_branchId_key" ON "RestaurantBranchConfiguration"("branchId");
CREATE INDEX "RestaurantBranchConfiguration_tenantId_updatedAt_idx" ON "RestaurantBranchConfiguration"("tenantId", "updatedAt");

CREATE TABLE "RestaurantConfigurationVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "actorId" TEXT,
    "scope" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RestaurantConfigurationVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RestaurantConfigurationVersion_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RestaurantConfigurationVersion_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "RestaurantConfigurationVersion_tenantId_branchId_createdAt_idx" ON "RestaurantConfigurationVersion"("tenantId", "branchId", "createdAt");
CREATE INDEX "RestaurantConfigurationVersion_tenantId_section_version_idx" ON "RestaurantConfigurationVersion"("tenantId", "section", "version");
