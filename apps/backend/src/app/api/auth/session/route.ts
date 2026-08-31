import { errorResponse } from "@/core/auth/errors";
import { requireSession, toSessionView } from "@/core/auth/session";
import { prisma } from "@/core/database/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireSession(undefined, true);
    const branches = await prisma.branch.findMany({
      where: { tenantId: session.tenantId, active: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    });
    const memberships = await prisma.membership.findMany({
      where: { userId: session.userId, active: true, tenant: { status: "ACTIVE" } },
      orderBy: { tenant: { name: "asc" } },
      select: { tenant: { select: { name: true, slug: true, type: true } } },
    });
    return Response.json({
      session: toSessionView(session),
      branches,
      businesses: memberships.map(({ tenant }) => tenant),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
