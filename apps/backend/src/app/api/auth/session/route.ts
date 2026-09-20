import { errorResponse } from "@/core/auth/errors";
import { requireSession, toSessionView } from "@/core/auth/session";
import { prisma } from "@/core/database/prisma";
import { hasPermission } from "@/core/auth/permissions";
import { PLATFORM_ACCESS_ROLE } from "@/core/auth/tenant-switch";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireSession(undefined, true);
    const membership = await prisma.membership.findUniqueOrThrow({ where: { id: session.membershipId }, select: { branchId: true } });
    const assignedBranch = ["RESTAURANT", "MINIMARKET"].includes(session.tenantType) && !hasPermission(session.permissions, "settings:write") ? membership.branchId : null;
    const branches = await prisma.branch.findMany({
      where: { tenantId: session.tenantId, active: true, ...(assignedBranch ? { id: assignedBranch } : {}) },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    });
    const memberships = await prisma.membership.findMany({
      where: { userId: session.userId, active: true, tenant: { status: "ACTIVE" }, ...(session.platformRole === "SUPER_ADMIN" ? {} : { role: { key: { not: PLATFORM_ACCESS_ROLE } } }) },
      orderBy: { tenant: { name: "asc" } },
      select: { tenant: { select: { name: true, slug: true, type: true } } },
    });
    return Response.json({
      session: toSessionView(session),
      branches,
      businesses: session.platformRole === "SUPER_ADMIN"
        ? await prisma.tenant.findMany({ where: { status: "ACTIVE", branches: { some: { active: true } } }, orderBy: { name: "asc" }, select: { name: true, slug: true, type: true } })
        : memberships.map(({ tenant }) => tenant),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
