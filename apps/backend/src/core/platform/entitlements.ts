import "server-only";
import { prisma } from "@/core/database/prisma";
import { AppError } from "@/core/auth/errors";

async function tenantEntitlement(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, type: true, status: true, subscriptionStatus: true, subscriptionEndsAt: true, trialEndsAt: true, plan: { select: { maxUsers: true, maxMonthlyOperations: true, active: true } } },
  });
  if (!tenant || tenant.status !== "ACTIVE") throw new AppError("TENANT_INACTIVE", 403, "La empresa no está habilitada para operar.");
  const plan = tenant.plan;
  if (!plan?.active) throw new AppError("PLAN_REQUIRED", 402, "La empresa necesita un plan activo para realizar operaciones.");
  const now = new Date();
  const expiredTrial = tenant.subscriptionStatus === "TRIAL" && tenant.trialEndsAt != null && tenant.trialEndsAt < now;
  const expiredCycle = tenant.subscriptionStatus === "ACTIVE" && tenant.subscriptionEndsAt != null && tenant.subscriptionEndsAt < now;
  if (["PAST_DUE", "CANCELLED"].includes(tenant.subscriptionStatus) || expiredTrial || expiredCycle) {
    throw new AppError("SUBSCRIPTION_INACTIVE", 402, "La suscripción necesita atención antes de registrar nuevos cambios.");
  }
  return { ...tenant, plan };
}

export async function assertTenantWriteEntitlement(tenantId: string, countOperation = false) {
  const tenant = await tenantEntitlement(tenantId);
  if (!countOperation) return;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const operations = tenant.type === "BARBERSHOP"
    ? await prisma.appointment.count({ where: { tenantId, createdAt: { gte: monthStart } } })
    : tenant.type === "RESTAURANT"
      ? await prisma.restaurantOrder.count({ where: { tenantId, createdAt: { gte: monthStart } } })
      : await prisma.transportTrip.count({ where: { tenantId, createdAt: { gte: monthStart } } });
  if (operations >= tenant.plan.maxMonthlyOperations) {
    throw new AppError("PLAN_OPERATION_LIMIT", 409, "La empresa alcanzó el límite mensual de operaciones de su plan.", { limit: tenant.plan.maxMonthlyOperations });
  }
}

export async function assertTenantUserLimit(tenantId: string) {
  const tenant = await tenantEntitlement(tenantId);
  const users = await prisma.membership.count({ where: { tenantId, active: true, user: { active: true } } });
  if (users >= tenant.plan.maxUsers) {
    throw new AppError("PLAN_USER_LIMIT", 409, "La empresa alcanzó el límite de usuarios de su plan.", { limit: tenant.plan.maxUsers });
  }
}
