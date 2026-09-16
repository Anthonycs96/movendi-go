import { errorResponse } from "@/core/auth/errors";
import { activatePilotCheckout } from "@/core/billing/checkout";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { return Response.json({ checkout: await activatePilotCheckout((await context.params).id) }); }
  catch (error) { return errorResponse(error); }
}
