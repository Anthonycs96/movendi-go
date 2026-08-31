import "server-only";

export type LogLevel = "info" | "warn" | "error";

function serializable(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (typeof value === "bigint") return value.toString();
  return value;
}

export function logEvent(level: LogLevel, event: string, fields: Record<string, unknown> = {}) {
  const payload = JSON.stringify({ timestamp: new Date().toISOString(), service: "backend", event, ...Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, serializable(value)])) });
  if (level === "error") console.error(payload);
  else if (level === "warn") console.warn(payload);
  else console.info(payload);
}

export function deploymentVersion() {
  return process.env.DEPLOYMENT_VERSION ?? process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 12) ?? process.env.K_REVISION ?? "development";
}
