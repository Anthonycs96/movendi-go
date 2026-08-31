import { compare } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/core/database/prisma";
import { createSession } from "@/core/auth/session";
import { AppError, errorResponse } from "@/core/auth/errors";
import { assertLoginAllowed, clearLoginFailures, loginThrottleKey, recordLoginFailure } from "@/core/auth/login-throttle";
import { isPlatformRole } from "@/core/platform/access";
import { hasPermission, parsePermissions } from "@/core/auth/permissions";

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
  businessSlug: z.string().trim().toLowerCase().min(1).optional(),
  rememberSession: z.boolean().optional().default(true),
});

const DUMMY_PASSWORD_HASH = "$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.";

const tenantDestinations: Record<string, Array<{ path: string; permission: string }>> = {
  BARBERSHOP: [
    { path: "dashboard", permission: "dashboard:read" }, { path: "appointments", permission: "barbershop:appointments:read" },
    { path: "clients", permission: "customers:read" }, { path: "team", permission: "barbershop:team:read" },
    { path: "services", permission: "services:read" }, { path: "checkout", permission: "barbershop:cash:write" },
    { path: "settings", permission: "settings:write" },
  ],
  RESTAURANT: [
    { path: "dashboard", permission: "dashboard:read" }, { path: "floor", permission: "restaurant:floor:read" },
    { path: "orders", permission: "restaurant:orders:read" }, { path: "kitchen", permission: "restaurant:kitchen:read" },
    { path: "clients", permission: "customers:read" }, { path: "menu", permission: "restaurant:menu:read" },
    { path: "promotions", permission: "restaurant:promotions:read" },
    { path: "checkout", permission: "restaurant:cash:write" }, { path: "reports", permission: "restaurant:reports:read" },
    { path: "settings", permission: "settings:write" },
  ],
  TRANSPORT: [
    { path: "dashboard", permission: "dashboard:read" }, { path: "operations", permission: "transport:operations:read" },
    { path: "fleet", permission: "transport:fleet:read" }, { path: "drivers", permission: "transport:drivers:read" },
    { path: "documents", permission: "transport:documents:read" }, { path: "finance", permission: "transport:finance:read" },
    { path: "fuel", permission: "transport:fuel:read" }, { path: "maintenance", permission: "transport:maintenance:read" },
    { path: "tires", permission: "transport:tires:read" }, { path: "reports", permission: "transport:finance:read" },
    { path: "settings", permission: "settings:write" },
  ],
};

function tenantRedirect(tenantType: string, tenantSlug: string, permissionsValue: string) {
  const permissions = parsePermissions(permissionsValue);
  const destination = tenantDestinations[tenantType]?.find((item) => hasPermission(permissions, item.permission));
  return destination ? `/t/${tenantSlug}/${destination.path}` : "/login";
}

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", 400, "Completa correo y contraseña.");
    const { email, password, businessSlug, rememberSession } = parsed.data;
    const throttleKey = loginThrottleKey(request, email, businessSlug ?? "platform");
    await assertLoginAllowed(throttleKey);
    const membership = await prisma.membership.findFirst({
      where: {
        active: true,
        tenant: { ...(businessSlug ? { slug: businessSlug } : {}), status: "ACTIVE" },
        user: { email, active: true, ...(!businessSlug ? { platformRole: { not: null } } : {}) },
      },
      orderBy: { tenant: { slug: "asc" } },
      include: { user: true, tenant: true, branch: true, role: true },
    });
    const passwordMatches = await compare(password, membership?.user.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!membership || !passwordMatches) {
      await recordLoginFailure(throttleKey);
      throw new AppError("INVALID_CREDENTIALS", 401, "Credenciales o negocio incorrectos.");
    }
    const branch = membership.branch?.active ? membership.branch : await prisma.branch.findFirst({ where: { tenantId: membership.tenantId, active: true }, orderBy: { createdAt: "asc" } });
    if (!branch) throw new AppError("NO_ACTIVE_BRANCH", 403, "La empresa no tiene una sucursal activa.");
    await clearLoginFailures(throttleKey);
    await createSession(membership.userId, membership.id, membership.tenantId, branch.id, rememberSession);
    const destination = isPlatformRole(membership.user.platformRole) ? "/platform/dashboard" : tenantRedirect(membership.tenant.type, membership.tenant.slug, membership.role.permissions);
    return Response.json({ ok: true, redirectTo: membership.user.mustChangePassword ? `/change-password?next=${encodeURIComponent(destination)}` : destination });
  } catch (error) {
    return errorResponse(error);
  }
}
