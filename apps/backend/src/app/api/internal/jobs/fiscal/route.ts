import { errorResponse } from "@/core/auth/errors";
import { assertJobRunnerSecret } from "@/core/maintenance/authorization";
import { runFiscalBatch } from "@/modules/invoicing/server/outbox";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertJobRunnerSecret(request);
    return Response.json({ ok: true, ...await runFiscalBatch(1) });
  } catch (error) { return errorResponse(error); }
}
