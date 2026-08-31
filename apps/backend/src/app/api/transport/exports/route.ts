import { z } from "zod";
import { AppError, errorResponse } from "@/core/auth/errors";
import { requireSession } from "@/core/auth/session";
import { prisma } from "@/core/database/prisma";
import { normalizeTransportDataSection } from "@/modules/transport/server/data";
import { buildTransportExport, type TransportExportFormat } from "@/modules/transport/server/exports";
import { parse } from "@/modules/transport/server/command-helpers";
import { storedObjectDownloadResponse } from "@/core/storage/service";

export const dynamic = "force-dynamic";

const formatSchema = z.enum(["csv", "excel", "pdf"]);
const queueSchema = z.object({
  section: z.string().min(1),
  format: formatSchema,
  query: z.string().max(100).optional().default(""),
  status: z.string().max(40).nullable().optional().default(null),
});

const permissionBySection: Record<string, string> = {
  operations: "transport:operations:read", fleet: "transport:fleet:read", drivers: "transport:drivers:read",
  documents: "transport:documents:read", finance: "transport:finance:read", fuel: "transport:fuel:read",
  maintenance: "transport:maintenance:read", tires: "transport:tires:read", settings: "transport:masters:read",
};

async function exportSession(section: string) {
  const permission = permissionBySection[section];
  if (!permission) throw new AppError("INVALID_EXPORT_SECTION", 400, "Esta sección no admite exportación tabular.");
  const session = await requireSession(permission);
  if (session.tenantType !== "TRANSPORT") throw new AppError("MODULE_ACCESS_DENIED", 403, "La exportación pertenece al módulo Transporte.");
  return session;
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const jobId = params.get("job");
    if (jobId) {
      const session = await requireSession();
      const job = await prisma.transportDataJob.findFirst({ where: { id: jobId, tenantId: session.tenantId, actorId: session.userId }, include: { storageObject: true } });
      if (!job) throw new AppError("JOB_NOT_FOUND", 404, "Trabajo de exportación no encontrado.");
      if (job.status === "EXPIRED") throw new AppError("EXPORT_EXPIRED", 410, "La exportación expiró. Genera una nueva copia.");
      if (job.status !== "COMPLETED" || (!job.storageObject && (!job.resultData || !job.resultName || !job.resultMime))) return Response.json({ id: job.id, status: job.status, error: job.error, createdAt: job.createdAt }, { status: job.status === "FAILED" ? 422 : 202 });
      if (job.storageObject) return storedObjectDownloadResponse(job.storageObject);
      return new Response(new Uint8Array(Buffer.from(job.resultData!, "base64")), { headers: { "Content-Type": job.resultMime!, "Content-Disposition": `attachment; filename="${job.resultName!}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
    }
    const section = normalizeTransportDataSection(params.get("section"));
    const format = parse(formatSchema, params.get("format") ?? "csv") as TransportExportFormat;
    const session = await exportSession(section);
    const file = await buildTransportExport({ tenantId: session.tenantId, branchId: session.branchId, actorId: session.userId, permissions: session.permissions }, { section, format, query: (params.get("q") ?? "").trim().slice(0, 100), status: params.get("status")?.trim().toUpperCase() || null });
    return new Response(new Uint8Array(file.data), { headers: { "Content-Type": file.mime, "Content-Disposition": `attachment; filename="${file.name}"`, "Cache-Control": "private, no-store", "X-Export-Rows": String(file.rows) } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = parse(queueSchema, await request.json());
    const section = normalizeTransportDataSection(input.section);
    const session = await exportSession(section);
    const retentionHours = Math.max(1, Number(process.env.EXPORT_RETENTION_HOURS ?? 24));
    const maxAttempts = Math.max(1, Math.min(10, Number(process.env.JOB_MAX_ATTEMPTS ?? 3)));
    const job = await prisma.transportDataJob.create({ data: { tenantId: session.tenantId, actorId: session.userId, type: "TRANSPORT_EXPORT", format: input.format, maxAttempts, expiresAt: new Date(Date.now() + retentionHours * 3_600_000), parameters: JSON.stringify({ section, format: input.format, query: input.query.trim(), status: input.status?.trim().toUpperCase() || null, branchId: session.branchId }) } });
    return Response.json({ id: job.id, status: job.status, message: "Exportación encolada. El worker la procesará en segundo plano." }, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}
