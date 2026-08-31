import "server-only";
import { prisma } from "@/core/database/prisma";
import type { TenantScope } from "@/core/auth/types";

export async function audit(scope: TenantScope, action: string, entityType: string, entityId?: string, metadata?: Record<string, unknown>) {
  await prisma.auditLog.create({
    data: {
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      userId: scope.actorId,
      action,
      entityType,
      entityId,
      metadata: metadata ? JSON.stringify(metadata) : undefined,
    },
  });
}
