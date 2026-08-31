-- Phase 4: object storage metadata for exports and transport documents.
CREATE TABLE "StoredObject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "scanStatus" TEXT NOT NULL DEFAULT 'SKIPPED',
    "expiresAt" DATETIME,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StoredObject_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StoredObject_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "TransportDocument" ADD COLUMN "storageObjectId" TEXT REFERENCES "StoredObject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TransportDataJob" ADD COLUMN "storageObjectId" TEXT REFERENCES "StoredObject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "StoredObject_provider_bucket_key_key" ON "StoredObject"("provider", "bucket", "key");
CREATE INDEX "StoredObject_tenantId_purpose_status_createdAt_idx" ON "StoredObject"("tenantId", "purpose", "status", "createdAt");
CREATE INDEX "StoredObject_status_expiresAt_idx" ON "StoredObject"("status", "expiresAt");
CREATE INDEX "TransportDocument_storageObjectId_idx" ON "TransportDocument"("storageObjectId");
CREATE INDEX "TransportDataJob_storageObjectId_idx" ON "TransportDataJob"("storageObjectId");
