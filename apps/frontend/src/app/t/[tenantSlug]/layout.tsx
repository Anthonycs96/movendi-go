import { notFound, redirect } from "next/navigation";
import { getManifest } from "@/core/modules/registry";
import { AppShell } from "@/shared/components/layout/AppShell";
import { getSessionContext } from "@/shared/lib/api-client";

export default async function TenantLayout({ children, params }: { children: React.ReactNode; params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const context = await getSessionContext();
  if (!context) redirect("/login");
  const { session, branches } = context;
  if (session.mustChangePassword) redirect("/change-password");
  if (session.tenantSlug !== tenantSlug) notFound();
  const industry = session.tenantType === "BARBERSHOP" ? "barbershop" : session.tenantType === "RESTAURANT" ? "restaurant" : "transport";
  const manifest = getManifest(industry);
  return <AppShell session={session} branches={branches} manifest={manifest}>{children}</AppShell>;
}
