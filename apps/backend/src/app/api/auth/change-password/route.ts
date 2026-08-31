import { compare, hash } from "bcryptjs";
import { z } from "zod";
import { audit } from "@/core/audit/audit";
import { AppError, errorResponse } from "@/core/auth/errors";
import { requireSession } from "@/core/auth/session";
import { prisma } from "@/core/database/prisma";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(100),
}).refine((value) => value.currentPassword !== value.newPassword, {
  message: "La nueva contraseña debe ser diferente.",
  path: ["newPassword"],
});

export async function POST(request: Request) {
  try {
    const session = await requireSession(undefined, true);
    const result = schema.safeParse(await request.json());
    if (!result.success) throw new AppError("VALIDATION_ERROR", 400, "Revisa las contraseñas ingresadas.", result.error.flatten());

    const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { passwordHash: true } });
    if (!user || !(await compare(result.data.currentPassword, user.passwordHash))) {
      throw new AppError("INVALID_PASSWORD", 400, "La contraseña actual no es correcta.");
    }

    const passwordHash = await hash(result.data.newPassword, 12);
    await prisma.$transaction([
      prisma.user.update({ where: { id: session.userId }, data: { passwordHash, mustChangePassword: false } }),
      prisma.session.deleteMany({ where: { userId: session.userId, id: { not: session.sessionId } } }),
    ]);
    await audit({ tenantId: session.tenantId, branchId: session.branchId, actorId: session.userId, permissions: session.permissions }, "UPDATE_PASSWORD", "User", session.userId);
    return Response.json({ ok: true, message: "Contraseña actualizada; las demás sesiones fueron cerradas." });
  } catch (error) {
    return errorResponse(error);
  }
}
