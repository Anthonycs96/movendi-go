import { AppError, errorResponse } from "@/core/auth/errors";
import { requireSession, toSessionView } from "@/core/auth/session";
import { canAccessPlatformSection, isPlatformRole, type PlatformSection } from "@/core/platform/access";
import { getPlatformData } from "@/core/platform/data";
import { prisma } from "@/core/database/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const startedAt = performance.now();
  try {
    const session = await requireSession();
    if (!isPlatformRole(session.platformRole)) throw new AppError("FORBIDDEN", 403, "No tienes acceso a la plataforma.");
    const requested = new URL(request.url).searchParams.get("section");
    const sections: PlatformSection[] = ["dashboard", "businesses", "plans", "subscriptions", "billing", "users", "audit", "catalog", "settings"];
    if (requested && !sections.includes(requested as PlatformSection)) throw new AppError("INVALID_SECTION", 400, "Sección de plataforma no válida.");
    const section = requested as PlatformSection | null;
    if (section && !canAccessPlatformSection(session.platformRole, section)) throw new AppError("FORBIDDEN", 403, "No tienes acceso a esta sección.");
    const [branches, data] = await Promise.all([
      prisma.branch.findMany({ where: { tenantId: session.tenantId, active: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
      getPlatformData(session.tenantId, section ?? undefined),
    ]);
    return Response.json({ session: toSessionView(session), branches, data }, { headers: { "Cache-Control": "private, no-store", "Server-Timing": `workspace;dur=${(performance.now() - startedAt).toFixed(1)}` } });
  } catch (error) {
    return errorResponse(error);
  }
}
