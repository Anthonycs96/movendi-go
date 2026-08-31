import { destroySession } from "@/core/auth/session";
import { errorResponse } from "@/core/auth/errors";

export async function POST() {
  try {
    await destroySession();
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
