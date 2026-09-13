import { redirect } from "next/navigation";
import { getSessionContext } from "@/shared/lib/api-client";

export default async function Home() {
  const context = await getSessionContext();
  redirect(context?.session.mustChangePassword ? "/change-password" : context ? `/t/${context.session.tenantSlug}${context.session.tenantType === "MINIMARKET" ? "" : "/dashboard"}` : "/login");
}
