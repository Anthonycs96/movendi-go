import { z } from "zod";
import { switchSessionBranch } from "@/core/auth/session";
import { AppError, errorResponse } from "@/core/auth/errors";

const schema = z.object({ branchId: z.string().min(1) });

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", 400, "Sucursal inválida.");
    await switchSessionBranch(parsed.data.branchId);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
