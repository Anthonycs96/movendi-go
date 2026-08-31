import { z } from "zod";
import { prisma } from "@/core/database/prisma";
import { AppError, errorResponse } from "@/core/auth/errors";

const schema = z.object({ email: z.string().trim().toLowerCase().email() });

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", 400, "Ingresa un correo empresarial válido.");
    const memberships = await prisma.membership.findMany({
      where: { active: true, user: { email: parsed.data.email, active: true }, tenant: { status: "ACTIVE" } },
      orderBy: { tenant: { name: "asc" } },
      select: { tenant: { select: { name: true, slug: true, status: true, type: true } } },
    });
    const platformUser = await prisma.user.findFirst({
      where: { email: parsed.data.email, active: true, platformRole: { not: null } },
      select: { platformRole: true },
    });
    return Response.json({
      platformRole: platformUser?.platformRole ?? null,
      businesses: memberships.map(({ tenant }) => ({ name: tenant.name, slug: tenant.slug, status: tenant.status, type: tenant.type })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
