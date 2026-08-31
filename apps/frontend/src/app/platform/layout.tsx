import { notFound, redirect } from "next/navigation";
import { getSessionContext } from "@/shared/lib/api-client";
import { PlatformShell } from "@/core/platform/components/PlatformShell";
import { isPlatformRole } from "@/core/platform/access";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  const { session } = context;
  if (session.mustChangePassword) redirect("/change-password");
  if (!isPlatformRole(session.platformRole)) notFound();
  return <PlatformShell user={{ name: session.userName, email: session.userEmail, role: session.platformRole }} currentTenantSlug={session.tenantSlug} businesses={context.businesses}>{children}</PlatformShell>;
}
