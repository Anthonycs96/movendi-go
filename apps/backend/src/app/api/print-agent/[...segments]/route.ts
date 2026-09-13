import { errorResponse } from "@/core/auth/errors";
import { handlePrintAgent } from "@/modules/printing/server/agent";

type Context = { params: Promise<{ segments: string[] }> };
async function handle(request: Request, context: Context) {
  try { return Response.json(await handlePrintAgent(request, (await context.params).segments)); }
  catch (error) { return errorResponse(error); }
}
export const POST = handle;
export const PATCH = handle;
