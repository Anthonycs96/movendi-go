import { requireSession } from "@/core/auth/session";
import { AppError, errorResponse } from "@/core/auth/errors";
import { hasPermission } from "@/core/auth/permissions";
import { prisma } from "@/core/database/prisma";

export async function GET() {
  try {
    const session = await requireSession();
    if (session.tenantType !== "RESTAURANT" || !["floor", "kitchen", "orders"].some((module) => hasPermission(session.permissions, `restaurant:${module}:read`) && (!session.enabledModules.length || session.enabledModules.includes(module)))) throw new AppError("FORBIDDEN", 403, "Sin acceso a la operación.");
    const latest = await prisma.auditLog.findFirst({ where: { tenantId: session.tenantId, branchId: session.branchId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, createdAt: true } });
    return Response.json({ revision: latest ? `${latest.createdAt.toISOString()}:${latest.id}` : "empty" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
