import "server-only";
import { hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/core/database/prisma";
import { AppError } from "@/core/auth/errors";
import type { AuthSession } from "@/core/auth/types";
import { canManagePlatformResource, isPlatformRole } from "./access";
import { initializeBusinessSetup, saveBusinessSetupStep, setupTemplates } from "./onboarding";

const optionalText = z.string().trim().max(160).optional().nullable();
const tenantSchema = z.object({
  name: z.string().trim().min(2).max(120),
  shortName: z.string().trim().min(2).max(40),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(60),
  type: z.enum(["BARBERSHOP", "RESTAURANT", "TRANSPORT"]),
  branchName: z.string().trim().min(2).max(100),
  adminName: z.string().trim().min(2).max(120),
  adminEmail: z.string().trim().toLowerCase().email(),
  adminPassword: z.string().min(8).max(100),
  planId: z.string().trim().optional().nullable(),
  subscriptionStatus: z.enum(["TRIAL", "ACTIVE", "PAST_DUE", "CANCELLED"]).default("TRIAL"),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: optionalText,
  address: optionalText,
  country: z.string().trim().min(2).max(3).default("PE"),
  currency: z.string().trim().min(3).max(3).default("PEN"),
  templateKey: z.string().trim().max(40).optional(),
  startOnboarding: z.boolean().optional().default(false),
});

const businessSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(), shortName: z.string().trim().min(2).max(40).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED", "CANCELLED"]).optional(), email: z.string().trim().email().or(z.literal("")).optional(),
  phone: optionalText, address: optionalText, country: z.string().trim().min(2).max(3).optional(),
  currency: z.string().trim().min(3).max(3).optional(), timezone: z.string().trim().min(3).max(80).optional(),
});

const planSchema = z.object({
  key: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]+$/).min(2).max(30), name: z.string().trim().min(2).max(80), description: optionalText,
  monthlyPriceCents: z.coerce.number().int().min(0).max(100000000), maxUsers: z.coerce.number().int().min(1).max(10000),
  maxMonthlyOperations: z.coerce.number().int().min(1).max(10000000), publicWebsiteEnabled: z.boolean().default(false), features: z.array(z.string().trim().min(1).max(80)).max(20), active: z.boolean().optional(),
});

const subscriptionSchema = z.object({
  planId: z.string().trim().min(1), subscriptionStatus: z.enum(["TRIAL", "ACTIVE", "PAST_DUE", "CANCELLED"]),
  subscriptionEndsAt: z.string().optional().nullable(), trialEndsAt: z.string().optional().nullable(), cancelAtPeriodEnd: z.boolean().default(false),
});
const teamCreateSchema = z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().toLowerCase().email(), password: z.string().min(8).max(100), platformRole: z.enum(["SUPER_ADMIN", "SUPPORT", "FINANCE", "ANALYST"]) });
const teamUpdateSchema = z.object({ platformRole: z.enum(["SUPER_ADMIN", "SUPPORT", "FINANCE", "ANALYST"]), active: z.boolean() });

function dateValue(value?: string | null) {
  if (!value) return null;
  const result = new Date(value);
  if (Number.isNaN(result.getTime())) throw new AppError("VALIDATION_ERROR", 400, "La fecha indicada no es válida.");
  return result;
}

async function audit(tenantId: string, session: AuthSession, action: string, entityType: string, entityId: string, metadata?: unknown) {
  await prisma.auditLog.create({ data: { tenantId, userId: session.userId, action, entityType, entityId, metadata: metadata ? JSON.stringify(metadata) : undefined } });
}

export async function handlePlatformCommand(method: string, segments: string[], body: unknown, session: AuthSession) {
  if (!isPlatformRole(session.platformRole)) throw new AppError("FORBIDDEN", 403, "No tienes acceso a la administración de plataforma.");
  const [resource, id] = segments;
  if (!canManagePlatformResource(session.platformRole, resource)) throw new AppError("FORBIDDEN", 403, "Tu rol de plataforma no permite realizar esta acción.");

  if (method === "POST" && resource === "tenants" && !id) {
    const parsed = tenantSchema.safeParse(body);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", 400, "Revisa los datos de la empresa y su administrador.", parsed.error.flatten());
    const input = parsed.data;
    const [slugExists, emailExists, plan] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: input.slug }, select: { id: true } }), prisma.user.findFirst({ where: { email: input.adminEmail }, select: { id: true } }),
      input.planId
        ? prisma.platformPlan.findFirst({ where: { id: input.planId, active: true }, select: { id: true, monthlyPriceCents: true } })
        : prisma.platformPlan.findFirst({ where: { active: true }, orderBy: { monthlyPriceCents: "asc" }, select: { id: true, monthlyPriceCents: true } }),
    ]);
    if (slugExists) throw new AppError("TENANT_EXISTS", 409, "Ya existe una empresa con ese identificador.");
    if (emailExists) throw new AppError("USER_EXISTS", 409, "El correo del administrador ya está registrado.");
    if (input.planId && !plan) throw new AppError("PLAN_NOT_FOUND", 404, "El plan seleccionado no está disponible.");
    if (!plan) throw new AppError("PLAN_NOT_FOUND", 409, "No existe un plan activo para crear la empresa.");
    const passwordHash = await hash(input.adminPassword, 12);
    const entity = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: { name: input.name, shortName: input.shortName, slug: input.slug, type: input.type, email: input.email || null, phone: input.phone || null, address: input.address || null, country: input.country, currency: input.currency, planId: plan.id, subscriptionStatus: input.subscriptionStatus, trialEndsAt: input.subscriptionStatus === "TRIAL" ? new Date(Date.now() + 14 * 86_400_000) : null } });
      const branch = await tx.branch.create({ data: { tenantId: tenant.id, name: input.branchName } });
      const role = await tx.role.create({ data: { tenantId: tenant.id, key: "ADMIN", name: "Administrador", permissions: JSON.stringify(["*"]) } });
      const user = await tx.user.create({ data: { name: input.adminName, email: input.adminEmail, passwordHash } });
      await tx.membership.create({ data: { tenantId: tenant.id, userId: user.id, roleId: role.id, branchId: branch.id } });
      await tx.membership.create({ data: { tenantId: tenant.id, userId: session.userId, roleId: role.id, branchId: branch.id } });
      await tx.billingCustomer.create({ data: { tenantId: tenant.id, provider: "manual", providerCustomerRef: `manual_cus_${tenant.id}`, billingEmail: input.email || input.adminEmail, legalName: input.name, country: input.country, currency: input.currency } });
      await tx.billingSubscription.create({ data: { tenantId: tenant.id, planId: plan.id, provider: "manual", providerSubscriptionRef: `manual_sub_${tenant.id}`, status: input.subscriptionStatus, amountCents: plan.monthlyPriceCents, currency: input.currency, trialEndsAt: input.subscriptionStatus === "TRIAL" ? new Date(Date.now() + 14 * 86_400_000) : null } });
      await tx.auditLog.create({ data: { tenantId: tenant.id, branchId: branch.id, userId: session.userId, action: "PLATFORM_TENANT_CREATE", entityType: "Tenant", entityId: tenant.id, metadata: JSON.stringify({ createdBy: session.userEmail, planId: plan?.id ?? null }) } });
      await initializeBusinessSetup(tenant.id, branch.id, input.type, input.templateKey, session.userId, tx);
      return { tenant, branch };
    });
    return { ok: true, id: entity.tenant.id, tenant: { id: entity.tenant.id, slug: entity.tenant.slug, name: entity.tenant.name, shortName: entity.tenant.shortName, type: entity.tenant.type }, message: input.startOnboarding ? "Negocio creado. Continúa con su implementación guiada." : "Empresa, sede, suscripción y administrador creados correctamente." };
  }

  if (method === "PATCH" && resource === "onboarding" && id) {
    return saveBusinessSetupStep(id, body, session);
  }

  if (method === "GET" && resource === "onboarding-templates") {
    return { items: setupTemplates };
  }

  if (method === "PATCH" && resource === "businesses" && id) {
    const parsed = businessSchema.safeParse(body);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", 400, "Revisa la configuración de la empresa.", parsed.error.flatten());
    if (id === session.tenantId && parsed.data.status && parsed.data.status !== "ACTIVE") throw new AppError("CURRENT_TENANT", 409, "No puedes suspender la empresa desde la que administras la plataforma.");
    if (!await prisma.tenant.findUnique({ where: { id }, select: { id: true } })) throw new AppError("TENANT_NOT_FOUND", 404, "La empresa no existe.");
    const data = { ...parsed.data, email: parsed.data.email === "" ? null : parsed.data.email, phone: parsed.data.phone || null, address: parsed.data.address || null };
    await prisma.tenant.update({ where: { id }, data });
    await audit(id, session, "PLATFORM_TENANT_UPDATE", "Tenant", id, parsed.data);
    return { ok: true, message: "Empresa actualizada correctamente." };
  }

  if (method === "POST" && resource === "plans" && !id) {
    const parsed = planSchema.safeParse(body);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", 400, "Revisa los datos del plan.", parsed.error.flatten());
    if (await prisma.platformPlan.findUnique({ where: { key: parsed.data.key }, select: { id: true } })) throw new AppError("PLAN_EXISTS", 409, "Ya existe un plan con esa clave.");
    const plan = await prisma.platformPlan.create({ data: { ...parsed.data, description: parsed.data.description || null, features: JSON.stringify(parsed.data.features) } });
    await audit(session.tenantId, session, "PLATFORM_PLAN_CREATE", "PlatformPlan", plan.id, { key: plan.key });
    return { ok: true, id: plan.id, message: "Plan comercial creado correctamente." };
  }

  if (method === "PATCH" && resource === "plans" && id) {
    const parsed = planSchema.safeParse(body);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", 400, "Revisa los datos del plan.", parsed.error.flatten());
    if (!await prisma.platformPlan.findUnique({ where: { id }, select: { id: true } })) throw new AppError("PLAN_NOT_FOUND", 404, "El plan no existe.");
    await prisma.platformPlan.update({ where: { id }, data: { ...parsed.data, description: parsed.data.description || null, features: JSON.stringify(parsed.data.features) } });
    await audit(session.tenantId, session, "PLATFORM_PLAN_UPDATE", "PlatformPlan", id, parsed.data);
    return { ok: true, message: "Plan actualizado correctamente." };
  }

  if (method === "PATCH" && resource === "subscriptions" && id) {
    const parsed = subscriptionSchema.safeParse(body);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", 400, "Revisa la suscripción.", parsed.error.flatten());
    const [tenant, plan] = await Promise.all([prisma.tenant.findUnique({ where: { id }, select: { id: true, currency: true } }), prisma.platformPlan.findUnique({ where: { id: parsed.data.planId }, select: { id: true, monthlyPriceCents: true } })]);
    if (!tenant) throw new AppError("TENANT_NOT_FOUND", 404, "La empresa no existe.");
    if (!plan) throw new AppError("PLAN_NOT_FOUND", 404, "El plan no existe.");
    const subscriptionEndsAt = dateValue(parsed.data.subscriptionEndsAt);
    const trialEndsAt = dateValue(parsed.data.trialEndsAt);
    await prisma.$transaction(async (tx) => {
      await tx.tenant.update({ where: { id }, data: { planId: plan.id, subscriptionStatus: parsed.data.subscriptionStatus, subscriptionEndsAt, trialEndsAt, cancelAtPeriodEnd: parsed.data.cancelAtPeriodEnd } });
      const current = await tx.billingSubscription.findFirst({ where: { tenantId: id }, orderBy: { createdAt: "desc" } });
      if (current) await tx.billingSubscription.update({ where: { id: current.id }, data: { planId: plan.id, status: parsed.data.subscriptionStatus, amountCents: plan.monthlyPriceCents, currentPeriodEnd: subscriptionEndsAt, trialEndsAt, cancelAtPeriodEnd: parsed.data.cancelAtPeriodEnd } });
      else await tx.billingSubscription.create({ data: { tenantId: id, planId: plan.id, provider: "manual", providerSubscriptionRef: `manual_sub_${id}`, status: parsed.data.subscriptionStatus, amountCents: plan.monthlyPriceCents, currency: tenant.currency, currentPeriodEnd: subscriptionEndsAt, trialEndsAt, cancelAtPeriodEnd: parsed.data.cancelAtPeriodEnd } });
    });
    await audit(id, session, "PLATFORM_SUBSCRIPTION_UPDATE", "Subscription", id, parsed.data);
    return { ok: true, message: "Suscripción actualizada correctamente." };
  }

  if (method === "POST" && resource === "users" && !id) {
    const parsed = teamCreateSchema.safeParse(body);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", 400, "Revisa los datos del integrante.", parsed.error.flatten());
    if (await prisma.user.findFirst({ where: { email: parsed.data.email }, select: { id: true } })) throw new AppError("USER_EXISTS", 409, "Ese correo ya está registrado.");
    const [role, branch] = await Promise.all([prisma.role.findFirst({ where: { tenantId: session.tenantId, key: "ADMIN" }, select: { id: true } }), prisma.branch.findFirst({ where: { tenantId: session.tenantId, active: true }, orderBy: { createdAt: "asc" }, select: { id: true } })]);
    if (!role || !branch) throw new AppError("BOOTSTRAP_REQUIRED", 409, "La empresa actual necesita una sede y rol administrador.");
    const passwordHash = await hash(parsed.data.password, 12);
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({ data: { name: parsed.data.name, email: parsed.data.email, passwordHash, platformRole: parsed.data.platformRole } });
      await tx.membership.create({ data: { tenantId: session.tenantId, userId: created.id, roleId: role.id, branchId: branch.id } });
      return created;
    });
    await audit(session.tenantId, session, "PLATFORM_USER_CREATE", "User", user.id, { role: user.platformRole, email: user.email });
    return { ok: true, id: user.id, message: "Integrante de plataforma creado correctamente." };
  }

  if (method === "PATCH" && resource === "users" && id) {
    const parsed = teamUpdateSchema.safeParse(body);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", 400, "Revisa el acceso del integrante.", parsed.error.flatten());
    if (id === session.userId && !parsed.data.active) throw new AppError("CURRENT_USER", 409, "No puedes desactivar tu propia cuenta.");
    if (!await prisma.user.findUnique({ where: { id }, select: { id: true } })) throw new AppError("USER_NOT_FOUND", 404, "El integrante no existe.");
    await prisma.user.update({ where: { id }, data: parsed.data });
    if (!parsed.data.active) await prisma.session.deleteMany({ where: { userId: id } });
    await audit(session.tenantId, session, "PLATFORM_USER_UPDATE", "User", id, parsed.data);
    return { ok: true, message: "Acceso de plataforma actualizado." };
  }

  throw new AppError("NOT_FOUND", 404, "Operación de plataforma no encontrada.");
}
