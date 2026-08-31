CREATE TABLE "TransportConfiguration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "settings" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportConfiguration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TransportConfiguration_tenantId_key" ON "TransportConfiguration"("tenantId");
CREATE INDEX "TransportConfiguration_updatedAt_idx" ON "TransportConfiguration"("updatedAt");

ALTER TABLE "TransportDriver" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'PAYROLL';
