import { errorResponse } from "@/core/auth/errors";
import { processNextTransportDataJob } from "@/modules/transport/server/exports";
import { maybeRunHousekeeping } from "@/core/maintenance/housekeeping";
import { assertJobRunnerSecret } from "@/core/maintenance/authorization";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertJobRunnerSecret(request);
    const housekeeping = await maybeRunHousekeeping();
    const result = await processNextTransportDataJob();
    return Response.json({ ok: true, processed: Boolean(result), result, housekeeping });
  } catch (error) {
    return errorResponse(error);
  }
}
