ALTER TABLE "TransportAssignment" ADD COLUMN "secondDriverId" TEXT REFERENCES "TransportDriver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "TransportAssignment_tenantId_secondDriverId_startsAt_endsAt_idx" ON "TransportAssignment"("tenantId", "secondDriverId", "startsAt", "endsAt");
CREATE INDEX "TransportAssignment_tenantId_trailerId_startsAt_endsAt_idx" ON "TransportAssignment"("tenantId", "trailerId", "startsAt", "endsAt");
