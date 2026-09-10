import "server-only";
import { hash } from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { nextAutomaticRoleKey } from "@movendi/contracts";
import { prisma } from "@/core/database/prisma";
import { AppError } from "@/core/auth/errors";
import type { TenantScope } from "@/core/auth/types";
import { audit } from "@/core/audit/audit";
import { assertTenantUserLimit, assertTransactionalQuota } from "@/core/platform/entitlements";

const branchSchema = z.object({ name: z.string().trim().min(2).max(100), address: z.string().trim().max(200).optional(), phone: z.string().trim().max(30).optional() });
const roleSchema = z.object({ name: z.string().trim().min(2).max(80), permissions: z.string().trim().min(1) });
const userSchema = z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().toLowerCase().email(), password: z.string().min(8).max(100), roleId: z.string().min(1), branchId: z.string().min(1) });
const activeValue = z.enum(["true", "false"]).transform((value) => value === "true");
const branchUpdateSchema = branchSchema.extend({ active: activeValue });
const userUpdateSchema = z.object({ name: z.string().trim().min(2).max(120), roleId: z.string().min(1), branchId: z.string().min(1), active: activeValue });
const resetPasswordSchema = z.object({ temporaryPassword: z.string().min(8).max(100) });
const tenantProfileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  shortName: z.string().trim().min(2).max(40),
  email: z.union([z.string().trim().email(), z.literal("")]).optional(),
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(200).optional(),
  currency: z.enum(["PEN", "USD"]),
  locale: z.enum(["es-PE", "es-ES", "en-US"]),
});
const publicSiteSchema = z.object({
  published: z.boolean(),
  headline: z.string().trim().max(120).optional(),
  description: z.string().trim().max(500).optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  whatsapp: z.string().trim().max(30).optional(),
  instagram: z.string().trim().max(100).optional(),
});

const commonPermissions = ["dashboard:read", "customers:read", "customers:write", "inventory:read", "inventory:write", "settings:write"];
const permissionsByTenantType: Record<string, string[]> = {
  BARBERSHOP: ["barbershop:appointments:read", "barbershop:appointments:write", "barbershop:team:read", "barbershop:team:write", "services:read", "services:write", "barbershop:cash:write"],
  RESTAURANT: ["restaurant:menu-history:read", "restaurant:menu-history:revert", "restaurant:staff:read", "restaurant:floor:read", "restaurant:floor:write", "restaurant:orders:read", "restaurant:orders:write", "restaurant:kitchen:read", "restaurant:kitchen:write", "restaurant:menu:read", "restaurant:menu:write", "restaurant:promotions:read", "restaurant:promotions:write", "restaurant:promotions:approve", "restaurant:reports:read", "restaurant:printing:read", "restaurant:printing:write", "restaurant:configuration:read", "restaurant:configuration:write", "restaurant:sunat:read", "restaurant:sunat:write", "restaurant:read", "restaurant:write", "restaurant:cash:write", "restaurant:cash:approve"],
  TRANSPORT: ["operations", "fleet", "drivers", "documents", "finance", "fuel", "maintenance", "tires", "masters"].flatMap((area) => [`transport:${area}:read`, `transport:${area}:write`]),
};

function parseRolePermissions(value: string, tenantType: string, admin = false) {
  const permissions = [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
  if (admin) {
    if (permissions.length !== 1 || permissions[0] !== "*") throw new AppError("ADMIN_GUARD", 409, "El rol Administrador debe conservar el acceso total.");
    return permissions;
  }
  if (!permissions.length) throw new AppError("VALIDATION_ERROR", 400, "Selecciona al menos un permiso para el rol.");
  const allowed = new Set([...commonPermissions, ...(permissionsByTenantType[tenantType] ?? [])]);
  const invalid = permissions.filter((permission) => !allowed.has(permission));
  if (invalid.length) throw new AppError("INVALID_PERMISSION", 400, "Uno o más permisos no son válidos para este tipo de negocio.", { invalid });
  return permissions;
}

function parse<TSchema extends z.ZodTypeAny>(schema: TSchema, body: unknown): z.infer<TSchema> {
  const result = schema.safeParse(body);
  if (!result.success) throw new AppError("VALIDATION_ERROR", 400, "Revisa los datos ingresados.", result.error.flatten());
  return result.data;
}

export async function handleCoreCommand(method: string, segments: string[], body: unknown, scope: TenantScope) {
  const [resource, id, action] = segments;
  if (method === "PATCH" && resource === "public-site") {
    const input = parse(publicSiteSchema, body);
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: scope.tenantId }, select: { plan: { select: { publicWebsiteEnabled: true } } } });
    if (!tenant.plan?.publicWebsiteEnabled) throw new AppError("PLAN_FEATURE_REQUIRED", 403, "Tu plan no incluye el sitio web público.");
    const entity = await prisma.tenant.update({ where: { id: scope.tenantId }, data: { publicSitePublished: input.published, publicSiteHeadline: input.headline || null, publicSiteDescription: input.description || null, publicSitePrimaryColor: input.primaryColor.toUpperCase(), publicSiteWhatsapp: input.whatsapp || null, publicSiteInstagram: input.instagram || null } });
    await audit(scope, "UPDATE_PUBLIC_SITE", "Tenant", entity.id, { published: input.published });
    return { ok: true, message: input.published ? "Sitio web publicado correctamente." : "Sitio web guardado como borrador." };
  }
  if (method === "PATCH" && resource === "tenant") {
    const input = parse(tenantProfileSchema, body);
    const entity = await prisma.tenant.update({
      where: { id: scope.tenantId },
      data: {
        name: input.name,
        shortName: input.shortName,
        currency: input.currency,
        locale: input.locale,
        email: input.email || null,
        phone: input.phone || null,
        address: input.address || null,
      },
    });
    await audit(scope, "UPDATE", "Tenant", entity.id, { fields: ["name", "shortName", "currency", "locale", "email", "phone", "address"] });
    return { ok: true, id: entity.id, message: "Perfil empresarial actualizado." };
  }
  if (method === "POST" && resource === "branches") {
    const input = parse(branchSchema, body);
    const entity = await prisma.branch.create({ data: { tenantId: scope.tenantId, name: input.name, address: input.address || null, phone: input.phone || null } });
    await audit(scope, "CREATE", "Branch", entity.id);
    return { ok: true, id: entity.id, message: "Sucursal creada correctamente." };
  }
  if (method === "PATCH" && resource === "branches" && id) {
    const input = parse(branchUpdateSchema, body);
    const branch = await prisma.branch.findFirst({ where: { id, tenantId: scope.tenantId }, select: { id: true } });
    if (!branch) throw new AppError("NOT_FOUND", 404, "La sucursal no pertenece a esta empresa.");
    if (!input.active && id === scope.branchId) throw new AppError("CURRENT_BRANCH", 409, "Cambia de sucursal antes de desactivar la sede actual.");
    const entity = await prisma.branch.update({ where: { id }, data: { name: input.name, address: input.address || null, phone: input.phone || null, active: input.active } });
    if (!input.active) await prisma.session.deleteMany({ where: { tenantId: scope.tenantId, branchId: id } });
    await audit(scope, "UPDATE", "Branch", entity.id, { active: input.active });
    return { ok: true, id: entity.id, message: "Sucursal actualizada correctamente." };
  }
  if (method === "POST" && resource === "roles") {
    const input = parse(roleSchema, body);
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: scope.tenantId }, select: { type: true } });
    const permissions = parseRolePermissions(input.permissions, tenant.type);
    let entity = null;
    for (let attempt = 0; attempt < 5 && !entity; attempt += 1) {
      const roles = await prisma.role.findMany({ where: { tenantId: scope.tenantId }, select: { key: true } });
      const key = nextAutomaticRoleKey(roles);
      try {
        entity = await prisma.role.create({ data: { tenantId: scope.tenantId, key, name: input.name, permissions: JSON.stringify(permissions) } });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      }
    }
    if (!entity) throw new AppError("ROLE_KEY_CONFLICT", 409, "No se pudo reservar la siguiente clave del rol. Inténtalo nuevamente.");
    await audit(scope, "CREATE", "Role", entity.id, { key: entity.key, permissions });
    return { ok: true, id: entity.id, message: "Rol creado correctamente." };
  }
  if (method === "PATCH" && resource === "roles" && id) {
    const input = parse(roleSchema, body);
    const role = await prisma.role.findFirst({ where: { id, tenantId: scope.tenantId }, select: { id: true, key: true, tenant: { select: { type: true } } } });
    if (!role) throw new AppError("NOT_FOUND", 404, "El rol no pertenece a esta empresa.");
    const permissions = parseRolePermissions(input.permissions, role.tenant.type, role.key === "ADMIN");
    const entity = await prisma.role.update({ where: { id }, data: { name: input.name, permissions: JSON.stringify(permissions) } });
    await audit(scope, "UPDATE", "Role", entity.id, { key: role.key, permissions });
    return { ok: true, id: entity.id, message: "Rol y permisos actualizados." };
  }
  if (method === "POST" && resource === "users" && !id) {
    const input = parse(userSchema, body);
    await assertTenantUserLimit(scope.tenantId);
    const [role, branch, duplicate] = await Promise.all([
      prisma.role.findFirst({ where: { id: input.roleId, tenantId: scope.tenantId }, select: { id: true } }),
      prisma.branch.findFirst({ where: { id: input.branchId, tenantId: scope.tenantId, active: true }, select: { id: true } }),
      prisma.membership.findFirst({ where: { tenantId: scope.tenantId, user: { email: input.email } }, select: { id: true } }),
    ]);
    if (!role || !branch) throw new AppError("INVALID_SCOPE", 400, "Rol o sucursal inválidos para esta empresa.");
    if (duplicate) throw new AppError("USER_EXISTS", 409, "El usuario ya pertenece a esta empresa.");
    const passwordHash = await hash(input.password, 12);
    const entity = await prisma.$transaction(async (tx) => {
      await assertTransactionalQuota(tx, scope.tenantId, "users");
      let user = await tx.user.findFirst({ where: { email: input.email } });
      if (!user) user = await tx.user.create({ data: { name: input.name, email: input.email, passwordHash, mustChangePassword: true } });
      else if (!user.active) user = await tx.user.update({ where: { id: user.id }, data: { name: input.name, passwordHash, mustChangePassword: true, active: true } });
      await tx.membership.create({ data: { tenantId: scope.tenantId, userId: user.id, roleId: role.id, branchId: branch.id } });
      return user;
    });
    await audit(scope, "CREATE", "User", entity.id, { email: input.email });
    return { ok: true, id: entity.id, message: "Usuario creado y vinculado a la empresa." };
  }
  if (method === "POST" && resource === "users" && id && action === "reset-password") {
    const input = parse(resetPasswordSchema, body);
    if (id === scope.actorId) throw new AppError("SELF_PASSWORD_RESET", 409, "Para tu propia cuenta usa Cambiar contraseña en Seguridad.");
    const [targetMembership, actorAccess] = await Promise.all([
      prisma.membership.findFirst({ where: { tenantId: scope.tenantId, userId: id, active: true, user: { active: true } }, select: { id: true, user: { select: { name: true } } } }),
      prisma.membership.findFirst({ where: { tenantId: scope.tenantId, userId: scope.actorId, active: true }, select: { role: { select: { key: true } }, user: { select: { platformRole: true } } } }),
    ]);
    if (!targetMembership) throw new AppError("NOT_FOUND", 404, "El usuario no pertenece a esta empresa o está inactivo.");
    if (actorAccess?.role.key !== "ADMIN" && actorAccess?.user.platformRole !== "SUPER_ADMIN") throw new AppError("FORBIDDEN", 403, "Solo el administrador de la empresa puede restablecer contraseñas.");
    const passwordHash = await hash(input.temporaryPassword, 12);
    await prisma.$transaction([
      prisma.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true } }),
      prisma.session.deleteMany({ where: { userId: id } }),
    ]);
    await audit(scope, "RESET_PASSWORD", "User", id, { sessionsRevoked: true });
    return { ok: true, id, message: `Contraseña temporal asignada a ${targetMembership.user.name}. Deberá crear una nueva al ingresar.` };
  }
  if (method === "PATCH" && resource === "users" && id) {
    const input = parse(userUpdateSchema, body);
    if (id === scope.actorId && !input.active) throw new AppError("SELF_DEACTIVATION", 409, "No puedes desactivar tu propio acceso.");
    const [membership, role, branch] = await Promise.all([
      prisma.membership.findFirst({ where: { tenantId: scope.tenantId, userId: id }, select: { id: true, role: { select: { key: true } } } }),
      prisma.role.findFirst({ where: { id: input.roleId, tenantId: scope.tenantId }, select: { id: true, key: true } }),
      prisma.branch.findFirst({ where: { id: input.branchId, tenantId: scope.tenantId, active: true }, select: { id: true } }),
    ]);
    if (!membership) throw new AppError("NOT_FOUND", 404, "El usuario no pertenece a esta empresa.");
    if (!role || !branch) throw new AppError("INVALID_SCOPE", 400, "Rol o sucursal inválidos para esta empresa.");
    if (membership.role.key === "ADMIN" && (!input.active || role.key !== "ADMIN")) {
      const otherAdmins = await prisma.membership.count({ where: { tenantId: scope.tenantId, userId: { not: id }, active: true, role: { key: "ADMIN" }, user: { active: true } } });
      if (!otherAdmins) throw new AppError("LAST_ADMIN", 409, "La empresa debe conservar al menos un administrador activo.");
    }
    await prisma.$transaction(async (tx) => {
      const current = await tx.membership.findUniqueOrThrow({ where: { id: membership.id }, include: { user: true } });
      if (input.active && (!current.active || !current.user.active)) await assertTransactionalQuota(tx, scope.tenantId, "users");
      await tx.membership.update({ where: { id: membership.id }, data: { roleId: role.id, branchId: branch.id, active: input.active } });
      const otherActiveMemberships = input.active ? 1 : await tx.membership.count({ where: { userId: id, id: { not: membership.id }, active: true } });
      await tx.user.update({ where: { id }, data: { name: input.name, active: input.active || otherActiveMemberships > 0 } });
      if (!input.active) await tx.session.deleteMany({ where: { userId: id, tenantId: scope.tenantId } });
    });
    await audit(scope, "UPDATE", "User", id, { active: input.active, roleId: role.id, branchId: branch.id });
    return { ok: true, id, message: input.active ? "Usuario actualizado correctamente." : "Usuario desactivado y sesiones revocadas." };
  }
  throw new AppError("NOT_FOUND", 404, "Operación de Core no encontrada.");
}
