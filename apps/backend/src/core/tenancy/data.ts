import "server-only";
import { prisma } from "@/core/database/prisma";
import type { TenantScope } from "@/core/auth/types";
import { hasPermission, parsePermissions } from "@/core/auth/permissions";

export interface CoreTenantData {
  currentActorId: string;
  canResetPasswords: boolean;
  tenant: { id: string; name: string; shortName: string; slug: string; type: string; locale: string; currency: string; email: string | null; phone: string | null; address: string | null; publicWebsiteEnabled: boolean; publicSitePublished: boolean; publicSiteHeadline: string | null; publicSiteDescription: string | null; publicSitePrimaryColor: string; publicSiteWhatsapp: string | null; publicSiteInstagram: string | null };
  branches: Array<{ id: string; name: string; address: string | null; phone: string | null; active: boolean }>;
  roles: Array<{ id: string; key: string; name: string; permissions: string[] }>;
  users: Array<{ id: string; membershipId: string; name: string; email: string; roleId: string; roleName: string; roleKey: string; branchId: string | null; branchName: string | null; active: boolean }>;
  audit: Array<{ id: string; action: string; entityType: string; createdAt: string; actor: string | null }>;
}

export async function getCoreTenantData(scope: TenantScope, includeManagement = true): Promise<CoreTenantData> {
  if (!includeManagement) {
    const record = await prisma.tenant.findUniqueOrThrow({ where: { id: scope.tenantId }, include: { plan: { select: { publicWebsiteEnabled: true } } } });
    const tenant = { id: record.id, name: record.name, shortName: record.shortName, slug: record.slug, type: record.type, locale: record.locale, currency: record.currency, email: record.email, phone: record.phone, address: record.address, publicWebsiteEnabled: record.plan?.publicWebsiteEnabled ?? false, publicSitePublished: record.publicSitePublished, publicSiteHeadline: record.publicSiteHeadline, publicSiteDescription: record.publicSiteDescription, publicSitePrimaryColor: record.publicSitePrimaryColor, publicSiteWhatsapp: record.publicSiteWhatsapp, publicSiteInstagram: record.publicSiteInstagram };
    return { currentActorId: scope.actorId, canResetPasswords: false, tenant, branches: [], roles: [], users: [], audit: [] };
  }
  const tenantQuery = prisma.tenant.findUniqueOrThrow({ where: { id: scope.tenantId }, include: { plan: { select: { publicWebsiteEnabled: true } } } });
  const [tenant, branches, roles, memberships, audit] = await Promise.all([
    tenantQuery,
    prisma.branch.findMany({ where: { tenantId: scope.tenantId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, address: true, phone: true, active: true } }),
    prisma.role.findMany({ where: { tenantId: scope.tenantId }, orderBy: { name: "asc" }, select: { id: true, key: true, name: true, permissions: true } }),
    prisma.membership.findMany({ where: { tenantId: scope.tenantId }, orderBy: { createdAt: "asc" }, include: { user: { select: { id: true, name: true, email: true, active: true, platformRole: true } }, role: { select: { key: true, name: true } }, branch: { select: { name: true } } } }),
    tenantQuery.then((record) => record.type !== "RESTAURANT" || hasPermission(scope.permissions, "restaurant:staff:read") ? prisma.auditLog.findMany({ where: { tenantId: scope.tenantId, ...(record.type === "RESTAURANT" ? { branchId: scope.branchId } : {}) }, orderBy: { createdAt: "desc" }, take: 12, include: { user: { select: { name: true } } } }) : []),
  ]);
  return {
    currentActorId: scope.actorId,
    canResetPasswords: memberships.some((membership) => membership.userId === scope.actorId && (membership.role.key === "ADMIN" || membership.user.platformRole === "SUPER_ADMIN")),
    tenant: { id: tenant.id, name: tenant.name, shortName: tenant.shortName, slug: tenant.slug, type: tenant.type, locale: tenant.locale, currency: tenant.currency, email: tenant.email, phone: tenant.phone, address: tenant.address, publicWebsiteEnabled: tenant.plan?.publicWebsiteEnabled ?? false, publicSitePublished: tenant.publicSitePublished, publicSiteHeadline: tenant.publicSiteHeadline, publicSiteDescription: tenant.publicSiteDescription, publicSitePrimaryColor: tenant.publicSitePrimaryColor, publicSiteWhatsapp: tenant.publicSiteWhatsapp, publicSiteInstagram: tenant.publicSiteInstagram },
    branches,
    roles: roles.map((role) => ({ ...role, permissions: parsePermissions(role.permissions) })),
    users: memberships.map((membership) => ({ id: membership.user.id, membershipId: membership.id, name: membership.user.name, email: membership.user.email, roleId: membership.roleId, roleName: membership.role.name, roleKey: membership.role.key, branchId: membership.branchId, branchName: membership.branch?.name ?? null, active: membership.active && membership.user.active })),
    audit: audit.map((item) => ({ id: item.id, action: item.action, entityType: item.entityType, createdAt: item.createdAt.toISOString(), actor: item.user?.name ?? null })),
  };
}
