import { deploymentVersion, logEvent } from "@/core/observability/logging";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    logEvent("info", "service_started", { version: deploymentVersion(), runtime: process.version, environment: process.env.NODE_ENV ?? "development" });
  }
}
