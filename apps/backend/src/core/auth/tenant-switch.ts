import "server-only";
import type { AuthSession } from "./types";
import { AppError } from "./errors";
import { hasPermission, parsePermissions } from "./permissions";
import { withSerializableTransaction } from "@/core/database/transactions";

export const PLATFORM_ACCESS_ROLE = "PLATFORM_ACCESS";

export async function switchTenantForSession(session: AuthSession, tenantSlug: string) {
  return withSerializableTransaction(async (tx) => {
    const tenant = await tx.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) throw new AppError("TENANT_ACCESS_DENIED", 403, "No tienes acceso a este negocio.");
    let membership = await tx.membership.findUnique({
      where: { tenantId_userId: { tenantId: tenant.id, userId: session.userId } },
      include: { role: true, branch: true },
    });
    const globalAccess = session.platformRole === "SUPER_ADMIN";
    if ((!membership && !globalAccess) || (membership && (!membership.active || (membership.role.key === PLATFORM_ACCESS_ROLE && !globalAccess)))) {
      throw new AppError("TENANT_ACCESS_DENIED", 403, "No tienes un acceso activo a este negocio.");
    }
    if (tenant.status !== "ACTIVE") throw new AppError("TENANT_INACTIVE", 403, "Este negocio está suspendido o cancelado. Reactívalo antes de abrirlo.");
    if (membership && (membership.role.tenantId !== tenant.id || (membership.branch && membership.branch.tenantId !== tenant.id))) {
      throw new AppError("TENANT_ACCESS_DENIED", 403, "La asignación de acceso al negocio no es válida.");
    }
    if (membership?.branchId && !membership.branch?.active && ["RESTAURANT", "MINIMARKET"].includes(tenant.type) && !hasPermission(parsePermissions(membership.role.permissions), "settings:write")) {
      throw new AppError("ASSIGNED_BRANCH_INACTIVE", 403, "Tu sucursal asignada está inactiva. Solicita al administrador que reactive la sede o te asigne otra.");
    }
    const branch = membership?.branch?.active ? membership.branch : await tx.branch.findFirst({ where: { tenantId: tenant.id, active: true }, orderBy: { createdAt: "asc" } });
    if (!branch) throw new AppError("NO_ACTIVE_BRANCH", 403, "La empresa no tiene una sucursal activa.");
    if (!membership) {
      const role = await tx.role.upsert({
        where: { tenantId_key: { tenantId: tenant.id, key: PLATFORM_ACCESS_ROLE } },
        create: { tenantId: tenant.id, key: PLATFORM_ACCESS_ROLE, name: "Administración de plataforma", permissions: JSON.stringify(["*"]) },
        update: {},
      });
      membership = await tx.membership.create({ data: { tenantId: tenant.id, userId: session.userId, roleId: role.id, branchId: branch.id }, include: { role: true, branch: true } });
    }
    await tx.session.update({ where: { id: session.sessionId }, data: { membershipId: membership.id, tenantId: tenant.id, branchId: branch.id } });
    await tx.auditLog.create({ data: { tenantId: tenant.id, branchId: branch.id, userId: session.userId, action: "TENANT_SWITCH", entityType: "Tenant", entityId: tenant.id, metadata: JSON.stringify({ fromTenantId: session.tenantId, platformAccess: membership.role.key === PLATFORM_ACCESS_ROLE }) } });
    return tenant.slug;
  });
}
