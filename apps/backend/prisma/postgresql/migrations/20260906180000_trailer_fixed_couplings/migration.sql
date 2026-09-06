CREATE TABLE "TransportTrailerCoupling" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TransportTrailerCoupling_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TransportTrailer" ADD COLUMN "fixedCouplingId" TEXT;

CREATE UNIQUE INDEX "TransportTrailerCoupling_tenantId_code_key" ON "TransportTrailerCoupling"("tenantId", "code");
CREATE INDEX "TransportTrailerCoupling_tenantId_active_name_idx" ON "TransportTrailerCoupling"("tenantId", "active", "name");
CREATE INDEX "TransportTrailer_tenantId_fixedCouplingId_idx" ON "TransportTrailer"("tenantId", "fixedCouplingId");

ALTER TABLE "TransportTrailerCoupling" ADD CONSTRAINT "TransportTrailerCoupling_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TransportTrailer" ADD CONSTRAINT "TransportTrailer_fixedCouplingId_fkey" FOREIGN KEY ("fixedCouplingId") REFERENCES "TransportTrailerCoupling"("id") ON DELETE SET NULL ON UPDATE CASCADE;
