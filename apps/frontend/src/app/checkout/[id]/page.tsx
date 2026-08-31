import { getPublicCheckout } from "@/shared/lib/api-client";
import { CheckoutStatus } from "./CheckoutStatus";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { checkout } = await getPublicCheckout(id);
  return <CheckoutStatus initial={checkout} />;
}
