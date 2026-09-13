import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/core/database/prisma";
import { AppError } from "@/core/auth/errors";
import { changePrintDelivery, nextAgentPrint } from "./service";

export async function handlePrintAgent(request: Request, segments: string[]) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (token.length < 32) throw new AppError("INVALID_PRINT_AGENT", 401, "Token del agente de impresión inválido.");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const device = await prisma.printDevice.findFirst({ where: { tokenHash, active: true, connectionType: "LOCAL_AGENT", tenant: { status: "ACTIVE" }, branch: { active: true } }, select: { id: true, tenantId: true, branchId: true, name: true, paperWidthMm: true, automatic: true } });
  if (!device) throw new AppError("INVALID_PRINT_AGENT", 401, "El agente de impresión no está autorizado.");
  await prisma.printDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });
  const [resource, id, action] = segments;
  if (request.method === "POST" && resource === "heartbeat") return { ok: true, protocolVersion: 2, printer: device, serverTime: new Date().toISOString() };
  const scope = { tenantId: device.tenantId, branchId: device.branchId, printerId: device.id };
  let body: Record<string, unknown>;
  try { body = await request.json(); if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error(); }
  catch { throw new AppError("VALIDATION_ERROR", 400, "Solicitud de impresión inválida."); }
  if (request.method === "POST" && resource === "jobs" && id === "next") {
    if (body.protocolVersion !== 2) throw new AppError("PRINT_AGENT_UPGRADE_REQUIRED", 426, "Actualiza el agente de impresión antes de tomar trabajos.");
    const job = await nextAgentPrint(scope);
    if (!job) return { ok: true, job: null };
    let payload: unknown;
    try { payload = JSON.parse(job.payload); }
    catch { await changePrintDelivery(scope, job.id, { kind: "complete", stationId: `agent:${device.id}`, attempt: job.attempts, status: "UNKNOWN", error: "Contenido inválido. Revisa la impresión." }); throw new AppError("INVALID_PRINT_PAYLOAD", 409, "Contenido de impresión inválido."); }
    return { ok: true, job: { id: job.id, attempt: job.attempts, deliveryAttempt: job.deliveryAttempt, type: job.type, copies: job.copies, createdAt: job.createdAt.toISOString(), order: { code: job.order?.code ?? "PRUEBA", source: job.order?.source ?? "TEST", notes: job.order?.notes ?? null, tableName: job.order?.table?.name ?? null, customerName: job.order?.customer?.name ?? null }, createdBy: job.createdBy.name, payload } };
  }
  if (request.method === "PATCH" && resource === "jobs" && id && action === "status") {
    if (body.status !== "SENT" && body.status !== "UNKNOWN" && body.status !== "FAILED") throw new AppError("VALIDATION_ERROR", 400, "El agente informa envío o incertidumbre; la salida en papel la confirma un operador.");
    if (!Number.isSafeInteger(body.attempt) || Number(body.attempt) < 1) throw new AppError("PRINT_JOB_NOT_CLAIMED", 409, "Falta el identificador del intento. Actualiza el agente.");
    await changePrintDelivery(scope, id, { kind: "complete", stationId: `agent:${device.id}`, attempt: Number(body.attempt), status: body.status, error: typeof body.error === "string" ? body.error.trim().slice(0, 300) : undefined });
    return { ok: true };
  }
  throw new AppError("NOT_FOUND", 404, "Operación del agente no encontrada.");
}
