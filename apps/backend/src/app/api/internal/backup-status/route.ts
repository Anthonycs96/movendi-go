import { timingSafeEqual, createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/core/database/prisma";
import { errorResponse, AppError } from "@/core/auth/errors";
export async function POST(request: Request) {
  try {
    const secret = process.env.BACKUP_REPORT_TOKEN;
    const received = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    if (!secret || !timingSafeEqual(createHash("sha256").update(secret).digest(), createHash("sha256").update(received).digest())) throw new AppError("UNAUTHORIZED", 401, "No autorizado.");
    const data = z.object({ id: z.string().uuid(), status: z.enum(["RUNNING", "COMPLETED", "FAILED"]), startedAt: z.coerce.date(), completedAt: z.coerce.date().optional(), prefix: z.string().regex(/^movendi-backups\/v1\/\d{4}-\d{2}-\d{2}\/[a-f0-9-]{36}\/$/), files: z.number().int().nonnegative().default(0), bytes: z.number().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0), restoreVerified: z.boolean().default(false), error: z.string().max(500).optional() }).parse(await request.json());
    if (!data.prefix.endsWith(`/${data.id}/`)) throw new AppError("INVALID_RUN", 400, "Respaldo inválido.");
    if (data.status === "COMPLETED" && (!data.completedAt || data.completedAt < data.startedAt || data.files < 3 || !data.bytes)) throw new AppError("INVALID_RUN", 400, "Respaldo incompleto.");
    const existing = await prisma.externalBackupRun.findUnique({ where: { id: data.id } });
    if (existing?.status === "COMPLETED") return Response.json({ ok: true });
    await prisma.externalBackupRun.upsert({ where: { id: data.id }, create: data, update: data });
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
