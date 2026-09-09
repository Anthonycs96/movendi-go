import { notFound, redirect } from "next/navigation";
import { ApiClientError, getPlatformWorkspace } from "@/shared/lib/api-client";
import { PlatformConsole } from "@/core/platform/components/PlatformConsole";
import { canAccessPlatformSection, isPlatformRole, type PlatformSection } from "@/core/platform/access";

const sections: PlatformSection[] = ["dashboard", "businesses", "plans", "subscriptions", "billing", "users", "audit", "catalog", "settings"];

export default async function PlatformPage({ params }: { params: Promise<{ section?: string[] }> }) {
  const { section: parts } = await params;
  if (!parts?.length) redirect("/platform/dashboard");
  if (parts.length !== 1 || !sections.includes(parts[0] as PlatformSection)) notFound();
  const section = parts[0] as PlatformSection;
  const workspace = await getPlatformWorkspace(section).catch((error: unknown) => {
    if (error instanceof ApiClientError && error.status === 403) notFound();
    throw error;
  });
  if (!workspace) redirect("/login");
  const { session } = workspace;
  if (!isPlatformRole(session.platformRole) || !canAccessPlatformSection(session.platformRole, section)) notFound();
  return <PlatformConsole section={section} data={workspace.data} role={session.platformRole} />;
}
