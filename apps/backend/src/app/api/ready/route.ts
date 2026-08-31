import { prisma } from "@/core/database/prisma";
import { deploymentVersion, logEvent } from "@/core/observability/logging";
import { storageConfiguration } from "@/core/storage/provider";
import { billingConfiguration } from "@/core/billing/configuration";
import { emailConfiguration } from "@/core/billing/outbox";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = performance.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const staleBefore = new Date(Date.now() - Math.max(1, Number(process.env.JOB_STALE_MINUTES ?? 15)) * 60_000);
    const storage = storageConfiguration();
    const billing = billingConfiguration();
    const email = emailConfiguration();
    const [queuedJobs, processingJobs, failedJobs, staleJobs, activeObjects, failedBillingEvents, queuedEmails] = await Promise.all([
      prisma.transportDataJob.count({ where: { status: "QUEUED" } }),
      prisma.transportDataJob.count({ where: { status: "PROCESSING" } }),
      prisma.transportDataJob.count({ where: { status: "FAILED" } }),
      prisma.transportDataJob.count({ where: { status: "PROCESSING", startedAt: { lte: staleBefore } } }),
      prisma.storedObject.count({ where: { status: "ACTIVE" } }),
      prisma.billingWebhookEvent.count({ where: { status: "FAILED" } }),
      prisma.emailOutbox.count({ where: { status: { in: ["QUEUED", "FAILED"] } } }),
    ]);
    const databaseLatencyMs = performance.now() - startedAt;
    return Response.json({
      status: staleJobs || failedBillingEvents ? "degraded" : "ready",
      service: "backend",
      version: deploymentVersion(),
      database: { status: "reachable", latencyMs: Math.round(databaseLatencyMs * 10) / 10 },
      jobs: { queued: queuedJobs, processing: processingJobs, failed: failedJobs, stale: staleJobs },
      storage: { status: "configured", provider: storage.provider, activeObjects },
      billing: { status: billing.configured && billing.webhookConfigured ? "configured" : "pending_configuration", provider: billing.provider, failedEvents: failedBillingEvents },
      email: { status: email.configured ? "configured" : "pending_configuration", provider: email.provider, queued: queuedEmails },
      checkedAt: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store", "Server-Timing": `database;dur=${databaseLatencyMs.toFixed(1)}` } });
  } catch (error) {
    logEvent("error", "readiness_check_failed", { error });
    return Response.json({ status: "not_ready", service: "backend", version: deploymentVersion(), database: { status: "unreachable" }, checkedAt: new Date().toISOString() }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
