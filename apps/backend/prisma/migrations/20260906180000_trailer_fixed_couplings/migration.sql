CREATE TABLE "TransportTrailerCoupling" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportTrailerCoupling_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TransportTrailerCoupling_tenantId_code_key" ON "TransportTrailerCoupling"("tenantId", "code");
CREATE INDEX "TransportTrailerCoupling_tenantId_active_name_idx" ON "TransportTrailerCoupling"("tenantId", "active", "name");

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_TransportTrailer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "type" TEXT NOT NULL,
    "capacityKg" REAL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "fixedCouplingId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportTrailer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportTrailer_fixedCouplingId_fkey" FOREIGN KEY ("fixedCouplingId") REFERENCES "TransportTrailerCoupling" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_TransportTrailer" ("active", "brand", "capacityKg", "createdAt", "id", "model", "plate", "status", "tenantId", "type", "updatedAt") SELECT "active", "brand", "capacityKg", "createdAt", "id", "model", "plate", "status", "tenantId", "type", "updatedAt" FROM "TransportTrailer";
DROP TABLE "TransportTrailer";
ALTER TABLE "new_TransportTrailer" RENAME TO "TransportTrailer";

CREATE UNIQUE INDEX "TransportTrailer_tenantId_plate_key" ON "TransportTrailer"("tenantId", "plate");
CREATE INDEX "TransportTrailer_tenantId_status_active_idx" ON "TransportTrailer"("tenantId", "status", "active");
CREATE INDEX "TransportTrailer_tenantId_fixedCouplingId_idx" ON "TransportTrailer"("tenantId", "fixedCouplingId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
