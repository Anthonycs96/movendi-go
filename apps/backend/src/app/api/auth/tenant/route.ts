import { z } from "zod";
import { switchSessionTenant } from "@/core/auth/session";
import { AppError, errorResponse } from "@/core/auth/errors";

const schema = z.object({ tenantSlug: z.string().trim().toLowerCase().min(1) });

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", 400, "Negocio inválido.");
    const tenantSlug = await switchSessionTenant(parsed.data.tenantSlug);
    return Response.json({ ok: true, tenantSlug });
  } catch (error) {
    return errorResponse(error);
  }
}
