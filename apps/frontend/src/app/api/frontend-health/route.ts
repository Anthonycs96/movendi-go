import { backendFetch } from "@/shared/lib/backend-fetch";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = performance.now();
  try {
    const baseUrl = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3001";
    const upstream = await backendFetch(new URL("/api/health", baseUrl), { cache: "no-store", signal: AbortSignal.timeout(5_000) });
    const backend = await upstream.json();
    const latencyMs = performance.now() - startedAt;
    return Response.json({ status: upstream.ok ? "ok" : "error", service: "frontend", version: process.env.DEPLOYMENT_VERSION ?? process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 12) ?? process.env.K_REVISION ?? "development", backend, backendLatencyMs: Math.round(latencyMs * 10) / 10, checkedAt: new Date().toISOString() }, { status: upstream.ok ? 200 : 503, headers: { "Cache-Control": "no-store", "Server-Timing": `backend;dur=${latencyMs.toFixed(1)}` } });
  } catch {
    return Response.json({ status: "error", service: "frontend", backend: { status: "unreachable" }, checkedAt: new Date().toISOString() }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
