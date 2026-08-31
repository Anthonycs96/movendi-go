-- Phase 3: retries, stale-job recovery and export result retention.
ALTER TABLE "TransportDataJob" ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "TransportDataJob" ADD COLUMN "heartbeatAt" DATETIME;
ALTER TABLE "TransportDataJob" ADD COLUMN "expiresAt" DATETIME;

CREATE INDEX "TransportDataJob_status_startedAt_idx" ON "TransportDataJob"("status", "startedAt");
CREATE INDEX "TransportDataJob_expiresAt_idx" ON "TransportDataJob"("expiresAt");
