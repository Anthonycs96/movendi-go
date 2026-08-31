import { AppError, errorResponse } from "@/core/auth/errors";
import { requireSession, toSessionView } from "@/core/auth/session";
import { isPlatformRole } from "@/core/platform/access";
import { getPlatformData } from "@/core/platform/data";
import { prisma } from "@/core/database/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireSession();
    if (!isPlatformRole(session.platformRole)) throw new AppError("FORBIDDEN", 403, "No tienes acceso a la plataforma.");
    const [branches, data] = await Promise.all([
      prisma.branch.findMany({ where: { tenantId: session.tenantId, active: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
      getPlatformData(session.tenantId),
    ]);
    return Response.json({ session: toSessionView(session), branches, data });
  } catch (error) {
    return errorResponse(error);
  }
}
