import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { TenantScope } from "@/core/auth/types";
import { AppError } from "@/core/auth/errors";
export const fiscalSettingsSchema = z.object({ enabled: z.boolean(), environment: z.enum(["BETA", "PRODUCTION"]), taxRatePct: z.number().min(0).max(100), invoiceSeries: z.string().regex(/^F[A-Z0-9]{3}$/), receiptSeries: z.string().regex(/^B[A-Z0-9]{3}$/) });
export async function retailFiscalSettings(tx: Pick<Prisma.TransactionClient, "fiscalConfiguration">, scope: TenantScope) {
  const record = await tx.fiscalConfiguration.findFirst({ where: { tenantId: scope.tenantId, branchId: scope.branchId } });
  return fiscalSettingsSchema.parse(record ?? { enabled: false, environment: "BETA", taxRatePct: 18, invoiceSeries: "F001", receiptSeries: "B001" });
}
export async function saveRetailFiscalSettings(tx: Prisma.TransactionClient, scope: TenantScope, input: z.infer<typeof fiscalSettingsSchema>) {
  if (input.enabled) {
    const credential = await tx.restaurantIntegrationCredential.findUnique({ where: { tenantId_provider: { tenantId: scope.tenantId, provider: "NUBEFACT" } } });
    if (!credential || credential.environment !== input.environment) throw new AppError("SUNAT_ENVIRONMENT_MISMATCH", 409, "Guarda primero las credenciales del ambiente elegido.");
  }
  return tx.fiscalConfiguration.upsert({ where: { branchId: scope.branchId }, create: { tenantId: scope.tenantId, branchId: scope.branchId, ...input }, update: input });
}
