import { errorResponse } from "@/core/auth/errors";
import { getPublicCheckout } from "@/core/billing/checkout";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return Response.json({ checkout: await getPublicCheckout(id) });
  } catch (error) {
    return errorResponse(error);
  }
}
