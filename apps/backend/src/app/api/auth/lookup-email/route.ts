import { prisma } from "@/core/database/prisma";
import { requireSession } from "@/core/auth/session";
import { errorResponse } from "@/core/auth/errors";

// Public business discovery happens only after password verification.
export async function POST() {
  try {
    const session = await requireSession();
    const memberships = await prisma.membership.findMany({ where: { userId: session.userId, active: true, tenant: { status: "ACTIVE" } }, select: { tenant: { select: { name: true, slug: true, status: true, type: true } } }, orderBy: { tenant: { name: "asc" } } });
    return Response.json({ platformRole: session.platformRole, businesses: memberships.map(({ tenant }) => tenant) });
  } catch (error) { return errorResponse(error); }
}
