import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/core/database/prisma";
import { AppError } from "./errors";
import { hasPermission, parsePermissions } from "./permissions";
import { effectiveModules } from "./enabled-modules";
import type { AuthSession, TenantScope } from "./types";
import type { AuthSessionView } from "@movendi/contracts";

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "mbs_session";
const TTL_HOURS = Number(process.env.SESSION_TTL_HOURS ?? 12);

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string, membershipId: string, tenantId: string, branchId: string, rememberSession = true) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000);
  await prisma.session.deleteMany({ where: { userId, expiresAt: { lte: new Date() } } });
  await prisma.session.create({ data: { tokenHash: hashToken(token), userId, membershipId, tenantId, branchId, expiresAt } });
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(rememberSession ? { expires: expiresAt } : {}),
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  store.delete(COOKIE_NAME);
}

export async function getOptionalSession(): Promise<AuthSession | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  const record = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: true,
      tenant: true,
      branch: true,
      membership: { include: { role: true } },
    },
  });
  if (!record || record.expiresAt <= new Date() || !record.user.active || !record.membership.active || !record.branch.active || record.tenant.status !== "ACTIVE") return null;
  if (record.userId !== record.membership.userId || record.tenantId !== record.membership.tenantId || record.branch.tenantId !== record.tenantId) return null;
  if (record.membership.role.tenantId !== record.tenantId) return null;
  if (["RESTAURANT", "MINIMARKET"].includes(record.tenant.type) && record.membership.branchId && record.membership.branchId !== record.branchId && !hasPermission(parsePermissions(record.membership.role.permissions), "settings:write")) return null;
  return {
    sessionId: record.id,
    userId: record.userId,
    membershipId: record.membershipId,
    tenantId: record.tenantId,
    tenantSlug: record.tenant.slug,
    tenantName: record.tenant.name,
    tenantShortName: record.tenant.shortName,
    tenantType: record.tenant.type as AuthSession["tenantType"],
    tenantLocale: record.tenant.locale,
    tenantCurrency: record.tenant.currency,
    tenantTimezone: record.tenant.timezone,
    branchId: record.branchId,
    branchName: record.branch.name,
    userName: record.user.name,
    userEmail: record.user.email,
    userPhone: record.user.phone,
    roleKey: record.membership.role.key,
    roleName: record.membership.role.name,
    permissions: parsePermissions(record.membership.role.permissions),
    enabledModules: effectiveModules(record.tenant.type, parsePermissions(record.tenant.enabledModules), parsePermissions(record.membership.role.permissions)),
    platformRole: record.user.platformRole,
    mustChangePassword: record.user.mustChangePassword,
    expiresAt: record.expiresAt,
  };
}

export async function requireSession(requiredPermission?: string, allowPasswordChange = false): Promise<AuthSession> {
  const session = await getOptionalSession();
  if (!session) throw new AppError("UNAUTHORIZED", 401, "Tu sesión no es válida o expiró.");
  if (session.mustChangePassword && !allowPasswordChange) throw new AppError("PASSWORD_CHANGE_REQUIRED", 403, "Debes crear una nueva contraseña antes de continuar.");
  if (!hasPermission(session.permissions, requiredPermission)) throw new AppError("FORBIDDEN", 403, "No tienes permiso para realizar esta acción.");
  return session;
}

export async function requireTenantScope(requiredPermission?: string): Promise<TenantScope> {
  const session = await requireSession(requiredPermission);
  return { tenantId: session.tenantId, branchId: session.branchId, actorId: session.userId, permissions: session.permissions };
}

export async function switchSessionBranch(branchId: string) {
  const session = await requireSession();
  if (["RESTAURANT", "MINIMARKET"].includes(session.tenantType) && !hasPermission(session.permissions, "settings:write")) {
    const membership = await prisma.membership.findUniqueOrThrow({ where: { id: session.membershipId }, select: { branchId: true } });
    if (membership.branchId && membership.branchId !== branchId) throw new AppError("BRANCH_ACCESS_DENIED", 403, "Tu usuario está asignado a otra sucursal.");
  }
  const branch = await prisma.branch.findFirst({ where: { id: branchId, tenantId: session.tenantId, active: true }, select: { id: true } });
  if (!branch) throw new AppError("BRANCH_NOT_FOUND", 404, "La sucursal no pertenece a tu empresa.");
  await prisma.session.update({ where: { id: session.sessionId }, data: { branchId: branch.id } });
}

export async function switchSessionTenant(tenantSlug: string) {
  const session = await requireSession();
  const membership = await prisma.membership.findFirst({
    where: {
      userId: session.userId,
      active: true,
      tenant: { slug: tenantSlug, status: "ACTIVE" },
    },
    include: { branch: true, tenant: { select: { id: true, slug: true } } },
  });
  if (!membership) throw new AppError("TENANT_ACCESS_DENIED", 403, "No tienes acceso a este negocio.");
  const branch = membership.branch?.active
    ? membership.branch
    : await prisma.branch.findFirst({ where: { tenantId: membership.tenantId, active: true }, orderBy: { createdAt: "asc" } });
  if (!branch) throw new AppError("NO_ACTIVE_BRANCH", 403, "La empresa no tiene una sucursal activa.");
  await prisma.session.update({
    where: { id: session.sessionId },
    data: { membershipId: membership.id, tenantId: membership.tenant.id, branchId: branch.id },
  });
  return membership.tenant.slug;
}

export function toSessionView(session: AuthSession): AuthSessionView {
  return { ...session, expiresAt: session.expiresAt.toISOString() };
}
