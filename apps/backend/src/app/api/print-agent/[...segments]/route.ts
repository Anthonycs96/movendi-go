import { createHash } from "node:crypto";
import { prisma } from "@/core/database/prisma";
import { AppError, errorResponse } from "@/core/auth/errors";

type Context = { params: Promise<{ segments: string[] }> };

async function deviceFrom(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (token.length < 32) throw new AppError("INVALID_PRINT_AGENT", 401, "Token del agente de impresión inválido.");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const device = await prisma.printDevice.findFirst({ where: { tokenHash, active: true }, select: { id: true, tenantId: true, branchId: true, name: true, paperWidthMm: true, automatic: true } });
  if (!device) throw new AppError("INVALID_PRINT_AGENT", 401, "El agente de impresión no está autorizado.");
  return device;
}

async function bodyOf(request: Request) {
  try { return await request.json() as { status?: unknown; error?: unknown }; } catch { return {}; }
}

async function handle(request: Request, context: Context) {
  try {
    const device = await deviceFrom(request);
    const { segments } = await context.params;
    const [resource, id, action] = segments;
    await prisma.printDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });

    if (request.method === "POST" && resource === "heartbeat") {
      return Response.json({ ok: true, printer: { id: device.id, name: device.name, paperWidthMm: device.paperWidthMm, automatic: device.automatic }, serverTime: new Date().toISOString() });
    }

    if (request.method === "POST" && resource === "jobs" && id === "next") {
      const now = new Date();
      const job = await prisma.restaurantPrintJob.findFirst({
        where: { tenantId: device.tenantId, branchId: device.branchId, printerId: device.id, automatic: true, OR: [{ status: "PENDING" }, { status: "PROCESSING", leaseExpiresAt: { lte: now } }] },
        orderBy: { createdAt: "asc" },
        include: { order: { select: { code: true, source: true, notes: true, table: { select: { name: true } }, customer: { select: { name: true } } } }, createdBy: { select: { name: true } } },
      });
      if (!job) return Response.json({ ok: true, job: null });
      const stationId = `agent:${device.id}`;
      const claimed = await prisma.restaurantPrintJob.updateMany({
        where: { id: job.id, printerId: device.id, OR: [{ status: "PENDING" }, { status: "PROCESSING", leaseExpiresAt: { lte: now } }] },
        data: { status: "PROCESSING", stationId, claimedAt: now, leaseExpiresAt: new Date(now.getTime() + 2 * 60 * 1000), attempts: { increment: 1 } },
      });
      if (claimed.count !== 1) return Response.json({ ok: true, job: null });
      let payload: unknown = { items: [] };
      try { payload = JSON.parse(job.payload); } catch { /* La comanda seguirá disponible con un contenido vacío seguro. */ }
      return Response.json({ ok: true, job: { id: job.id, type: job.type, copies: job.copies, createdAt: job.createdAt.toISOString(), order: { code: job.order?.code ?? "PRUEBA", source: job.order?.source ?? "TEST", notes: job.order?.notes ?? null, tableName: job.order?.table?.name ?? null, customerName: job.order?.customer?.name ?? null }, createdBy: job.createdBy.name, payload } });
    }

    if (request.method === "PATCH" && resource === "jobs" && id && action === "status") {
      const body = await bodyOf(request);
      if (body.status !== "PRINTED" && body.status !== "FAILED") throw new AppError("VALIDATION_ERROR", 400, "Estado de impresión inválido.");
      const error = typeof body.error === "string" ? body.error.trim().slice(0, 300) : null;
      const updated = await prisma.restaurantPrintJob.updateMany({
        where: { id, printerId: device.id, status: "PROCESSING", stationId: `agent:${device.id}` },
        data: { status: body.status, lastError: body.status === "FAILED" ? error || "El agente local informó un fallo." : null, printedAt: body.status === "PRINTED" ? new Date() : null, leaseExpiresAt: null },
      });
      if (updated.count !== 1) throw new AppError("PRINT_JOB_NOT_CLAIMED", 409, "La comanda no pertenece a este agente o su reserva venció.");
      return Response.json({ ok: true });
    }

    throw new AppError("NOT_FOUND", 404, "Operación del agente no encontrada.");
  } catch (error) {
    return errorResponse(error);
  }
}

export const POST = handle;
export const PATCH = handle;
