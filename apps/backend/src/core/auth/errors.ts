import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { logEvent } from "@/core/observability/logging";

export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export async function errorResponse(error: unknown): Promise<Response> {
  const requestId = (await headers()).get("x-request-id") ?? randomUUID();
  const responseHeaders = (extra?: Record<string, string>) => ({ "X-Request-Id": requestId, ...extra });
  if (error instanceof AppError) {
    const retryAfter = error.code === "LOGIN_RATE_LIMITED" && error.details && typeof error.details === "object" && "retryAfterSeconds" in error.details
      ? String(error.details.retryAfterSeconds)
      : undefined;
    if (error.status >= 500) logEvent("warn", "api_rejected", { requestId, code: error.code, status: error.status });
    return Response.json({ error: { code: error.code, message: error.message, details: error.details } }, { status: error.status, headers: responseHeaders(retryAfter ? { "Retry-After": retryAfter } : undefined) });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return Response.json({ error: { code: "DUPLICATE_RECORD", message: "Ya existe un registro con esos datos en esta empresa." } }, { status: 409, headers: responseHeaders() });
    }
    if (error.code === "P2003") {
      return Response.json({ error: { code: "RELATED_RECORD", message: "La operación usa un registro relacionado inválido." } }, { status: 409, headers: responseHeaders() });
    }
    if (error.code === "P2024" || error.code === "P2028") {
      return Response.json({ error: { code: "DATABASE_OPERATION_TIMEOUT", message: "La carta es extensa y no terminó de guardarse. No se perdió el borrador; vuelve a intentar o divídela en grupos más pequeños.", requestId } }, { status: 503, headers: responseHeaders({ "Retry-After": "2" }) });
    }
  }
  logEvent("error", "api_error", { requestId, error });
  return Response.json({ error: { code: "INTERNAL_ERROR", message: "No pudimos completar la operación.", requestId } }, { status: 500, headers: responseHeaders() });
}
