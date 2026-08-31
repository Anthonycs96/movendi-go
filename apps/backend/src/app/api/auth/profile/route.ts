import { z } from "zod";
import { audit } from "@/core/audit/audit";
import { AppError, errorResponse } from "@/core/auth/errors";
import { requireSession } from "@/core/auth/session";
import { prisma } from "@/core/database/prisma";

const profileSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().max(30).optional(),
});

export async function PATCH(request: Request) {
  try {
    const session = await requireSession();
    const result = profileSchema.safeParse(await request.json());
    if (!result.success) {
      throw new AppError("VALIDATION_ERROR", 400, "Revisa tu nombre y teléfono.", result.error.flatten());
    }

    const user = await prisma.user.update({
      where: { id: session.userId },
      data: {
        name: result.data.name,
        phone: result.data.phone || null,
      },
      select: { name: true, phone: true },
    });
    await audit(
      { tenantId: session.tenantId, branchId: session.branchId, actorId: session.userId, permissions: session.permissions },
      "UPDATE_PROFILE",
      "User",
      session.userId,
    );
    return Response.json({ ok: true, message: "Tu perfil fue actualizado.", user });
  } catch (error) {
    return errorResponse(error);
  }
}
