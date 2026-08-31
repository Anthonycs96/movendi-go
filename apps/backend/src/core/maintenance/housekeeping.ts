import "server-only";
import { prisma } from "@/core/database/prisma";
import { logEvent } from "@/core/observability/logging";
import { deleteStoredObject } from "@/core/storage/service";
import { processEmailOutbox } from "@/core/billing/outbox";

const globalState = globalThis as typeof globalThis & { movendiHousekeepingAt?: number };

function positiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function recoverStaleTransportJobs(now = new Date()) {
  const staleBefore = new Date(now.getTime() - positiveNumber(process.env.JOB_STALE_MINUTES, 15) * 60_000);
  const result = await prisma.transportDataJob.updateMany({
    where: { status: "PROCESSING", OR: [{ heartbeatAt: { lte: staleBefore } }, { heartbeatAt: null, startedAt: { lte: staleBefore } }] },
    data: { status: "QUEUED", runAfter: now, startedAt: null, heartbeatAt: null, error: "Trabajo recuperado después de una interrupción del worker." },
  });
  if (result.count) logEvent("warn", "stale_jobs_recovered", { count: result.count });
  return result.count;
}

export async function runHousekeeping(now = new Date()) {
  const auditBefore = new Date(now.getTime() - positiveNumber(process.env.AUDIT_RETENTION_DAYS, 730) * 86_400_000);
  const throttleBefore = new Date(now.getTime() - positiveNumber(process.env.LOGIN_THROTTLE_RETENTION_DAYS, 30) * 86_400_000);
  const jobBefore = new Date(now.getTime() - positiveNumber(process.env.JOB_METADATA_RETENTION_DAYS, 90) * 86_400_000);
  const storageMetadataBefore = new Date(now.getTime() - positiveNumber(process.env.STORAGE_METADATA_RETENTION_DAYS, 730) * 86_400_000);
  const billingEventBefore = new Date(now.getTime() - positiveNumber(process.env.BILLING_EVENT_RETENTION_DAYS, 730) * 86_400_000);
  const emailBefore = new Date(now.getTime() - positiveNumber(process.env.EMAIL_OUTBOX_RETENTION_DAYS, 365) * 86_400_000);
  const expiredObjects = await prisma.storedObject.findMany({ where: { status: "ACTIVE", expiresAt: { lte: now } }, orderBy: { expiresAt: "asc" }, take: 100 });
  let expiredStoredObjects = 0;
  for (const object of expiredObjects) {
    try {
      await deleteStoredObject(object);
      await prisma.transportDataJob.updateMany({ where: { storageObjectId: object.id, status: "COMPLETED" }, data: { status: "EXPIRED", resultData: null } });
      expiredStoredObjects += 1;
    } catch (error) {
      logEvent("error", "expired_object_cleanup_failed", { objectId: object.id, provider: object.provider, error });
    }
  }
  const [expiredSessions, oldThrottles, expiredLegacyResults, oldJobs, recoveredJobs, oldAudits, oldStorageMetadata, expiredCheckouts, oldBillingEvents, oldEmails, emails] = await Promise.all([
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.loginThrottle.deleteMany({ where: { updatedAt: { lt: throttleBefore }, OR: [{ blockedUntil: null }, { blockedUntil: { lte: now } }] } }),
    prisma.transportDataJob.updateMany({ where: { status: "COMPLETED", storageObjectId: null, expiresAt: { lte: now } }, data: { status: "EXPIRED", resultData: null } }),
    prisma.transportDataJob.deleteMany({ where: { status: { in: ["EXPIRED", "FAILED"] }, updatedAt: { lt: jobBefore } } }),
    recoverStaleTransportJobs(now),
    prisma.auditLog.deleteMany({ where: { createdAt: { lt: auditBefore } } }),
    prisma.storedObject.deleteMany({ where: { status: "DELETED", deletedAt: { lt: storageMetadataBefore }, documents: { none: {} }, dataJobs: { none: {} } } }),
    prisma.billingCheckoutSession.updateMany({ where: { status: "OPEN", expiresAt: { lt: now } }, data: { status: "EXPIRED", adminPasswordHash: null } }),
    prisma.billingWebhookEvent.deleteMany({ where: { status: { in: ["PROCESSED", "IGNORED"] }, createdAt: { lt: billingEventBefore } } }),
    prisma.emailOutbox.deleteMany({ where: { status: "SENT", sentAt: { lt: emailBefore } } }),
    processEmailOutbox(now),
  ]);
  const result = { expiredSessions: expiredSessions.count, oldThrottles: oldThrottles.count, expiredStoredObjects, expiredLegacyResults: expiredLegacyResults.count, oldJobs: oldJobs.count, recoveredJobs, oldAudits: oldAudits.count, oldStorageMetadata: oldStorageMetadata.count, expiredCheckouts: expiredCheckouts.count, oldBillingEvents: oldBillingEvents.count, oldEmails: oldEmails.count, emails };
  logEvent("info", "housekeeping_completed", result);
  return result;
}

export async function maybeRunHousekeeping() {
  const intervalMs = positiveNumber(process.env.HOUSEKEEPING_INTERVAL_MINUTES, 15) * 60_000;
  if (globalState.movendiHousekeepingAt && Date.now() - globalState.movendiHousekeepingAt < intervalMs) return null;
  globalState.movendiHousekeepingAt = Date.now();
  return runHousekeeping();
}
