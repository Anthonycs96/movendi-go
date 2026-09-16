import { errorResponse } from "@/core/auth/errors";
import { listPublicPlans } from "@/core/billing/checkout";
import { billingConfiguration } from "@/core/billing/configuration";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ plans: await listPublicPlans(), registrationMode: billingConfiguration().provider === "pilot" ? "pilot" : "paid" });
  } catch (error) {
    return errorResponse(error);
  }
}
