import { errorResponse } from "@/core/auth/errors";
import { listPublicPlans } from "@/core/billing/checkout";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ plans: await listPublicPlans() });
  } catch (error) {
    return errorResponse(error);
  }
}
