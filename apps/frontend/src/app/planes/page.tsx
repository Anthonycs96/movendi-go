import { getPublicBillingPlans } from "@/shared/lib/api-client";
import { PricingCheckout } from "./PricingCheckout";

export const dynamic = "force-dynamic";

export default async function PlansPage() {
  const { plans } = await getPublicBillingPlans();
  return <PricingCheckout plans={plans} />;
}
