CREATE TABLE "RestaurantConfiguration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "settings" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RestaurantConfiguration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "RestaurantConfiguration_tenantId_key" ON "RestaurantConfiguration"("tenantId");
CREATE INDEX "RestaurantConfiguration_updatedAt_idx" ON "RestaurantConfiguration"("updatedAt");
