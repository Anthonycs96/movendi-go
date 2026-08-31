import { prisma } from "@/core/database/prisma";
import { deploymentVersion, logEvent } from "@/core/observability/logging";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = performance.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const databaseLatencyMs = performance.now() - startedAt;
    return Response.json({ status: "ok", service: "backend", version: deploymentVersion(), uptimeSeconds: Math.round(process.uptime()), database: "reachable", databaseLatencyMs: Math.round(databaseLatencyMs * 10) / 10, checkedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store", "Server-Timing": `database;dur=${databaseLatencyMs.toFixed(1)}` } });
  } catch (error) {
    logEvent("error", "health_check_failed", { error });
    return Response.json({ status: "error", service: "backend", version: deploymentVersion(), database: "unreachable", checkedAt: new Date().toISOString() }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
