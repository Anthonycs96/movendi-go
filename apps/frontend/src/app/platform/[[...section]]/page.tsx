import { notFound, redirect } from "next/navigation";
import { getPlatformWorkspace, getSessionContext } from "@/shared/lib/api-client";
import { PlatformConsole } from "@/core/platform/components/PlatformConsole";
import { canAccessPlatformSection, isPlatformRole, type PlatformSection } from "@/core/platform/access";

const sections: PlatformSection[] = ["dashboard", "businesses", "plans", "subscriptions", "billing", "users", "audit", "catalog", "settings"];

export default async function PlatformPage({ params }: { params: Promise<{ section?: string[] }> }) {
  const { section: parts } = await params;
  const context = await getSessionContext();
  if (!context) redirect("/login");
  const { session } = context;
  if (!isPlatformRole(session.platformRole)) notFound();
  if (!parts?.length) redirect("/platform/dashboard");
  if (parts.length !== 1 || !sections.includes(parts[0] as PlatformSection)) notFound();
  const section = parts[0] as PlatformSection;
  if (!canAccessPlatformSection(session.platformRole, section)) notFound();
  const workspace = await getPlatformWorkspace();
  if (!workspace) redirect("/login");
  return <PlatformConsole section={section} data={workspace.data} role={session.platformRole} />;
}
