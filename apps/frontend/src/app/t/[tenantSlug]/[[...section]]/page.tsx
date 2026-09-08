import { notFound, redirect } from "next/navigation";
import { hasPermission } from "@/core/auth/permissions";
import { getManifest, isValidModulePath } from "@/core/modules/registry";
import { BarbershopWorkspace } from "@/modules/barbershop/BarbershopWorkspace";
import { RestaurantWorkspace } from "@/modules/restaurant/RestaurantWorkspace";
import { TransportWorkspace } from "@/modules/transport/TransportWorkspace";
import { PageContainer } from "@/shared/components/ui";
import { ApiClientError, getTenantWorkspace } from "@/shared/lib/api-client";

type TenantPageProps = {
  params: Promise<{ tenantSlug: string; section?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TenantSectionPage({ params, searchParams }: TenantPageProps) {
  const { tenantSlug, section: parts } = await params;
  const requestedFilters = await searchParams;
  const requestedSection = parts?.[0];
  const filter = (key: string) => typeof requestedFilters[key] === "string" ? requestedFilters[key] as string : undefined;
  const workspace = await getTenantWorkspace(requestedSection, { page: filter("page"), pageSize: filter("pageSize"), q: filter("q"), status: filter("status"), period: filter("period") }).catch((error: unknown) => {
    if (error instanceof ApiClientError && error.status === 403) notFound();
    throw error;
  });
  if (!workspace) redirect("/login");
  const { session } = workspace;
  if (session.tenantSlug !== tenantSlug) notFound();
  const { industry } = workspace;
  const manifest = getManifest(industry);
  const section = requestedSection;
  if (!section) redirect(`/t/${session.tenantSlug}/${manifest.defaultPath}`);
  if (parts && parts.length > 1) notFound();
  if (!isValidModulePath(manifest, section)) notFound();
  const navItem = manifest.navigation.find((item) => item.path === section);
  if (session.enabledModules.length && !session.enabledModules.includes(section)) notFound();
  if (!hasPermission(session.permissions, navItem?.permission)) notFound();
  if (industry === "barbershop") {
    return <PageContainer><BarbershopWorkspace section={section} data={workspace.data} core={workspace.core} platformAdmin={session.platformRole === "SUPER_ADMIN"} /></PageContainer>;
  }
  if (industry === "restaurant") {
    return <PageContainer><RestaurantWorkspace key={`${session.tenantId}:${session.branchId}`} section={section} data={workspace.data} core={workspace.core} permissions={session.permissions} platformAdmin={session.platformRole === "SUPER_ADMIN"} /></PageContainer>;
  }
  return <PageContainer><TransportWorkspace section={section} data={workspace.data} core={workspace.core} platformAdmin={session.platformRole === "SUPER_ADMIN"} /></PageContainer>;
}
