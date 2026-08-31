import { errorResponse } from "@/core/auth/errors";
import { assertJobRunnerSecret } from "@/core/maintenance/authorization";
import { runHousekeeping } from "@/core/maintenance/housekeeping";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertJobRunnerSecret(request);
    const result = await runHousekeeping();
    return Response.json({ ok: true, result });
  } catch (error) {
    return errorResponse(error);
  }
}
