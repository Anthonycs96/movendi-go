import "server-only";

import { prisma } from "@/core/database/prisma";

export async function reserveTransportCode(input: { tenantId: string; branchId: string; kind: "TRIP" | "OPERATION"; prefix: string; at?: Date }) {
  const at = input.at ?? new Date();
  const year = at.getFullYear();
  const prefix = input.prefix.trim().toUpperCase();
  const branchId = input.branchId;
  const sequence = await prisma.transportSequence.upsert({
    where: { tenantId_branchId_kind_year: { tenantId: input.tenantId, branchId, kind: input.kind, year } },
    create: { tenantId: input.tenantId, branchId, kind: input.kind, year, prefix, nextNumber: 2 },
    update: { nextNumber: { increment: 1 } },
    select: { nextNumber: true },
  });
  return `${prefix}-${year}-${String(sequence.nextNumber - 1).padStart(6, "0")}`;
}
