import "server-only";
import { z } from "zod";
import { prisma } from "@/core/database/prisma";
import { withSerializableTransaction } from "@/core/database/transactions";
import type { TenantScope } from "@/core/auth/types";
import { AppError } from "@/core/auth/errors";
import { hasPermission } from "@/core/auth/permissions";
import { parseInput } from "@/core/validation/parse-input";

const schema = z.object({ name: z.string().trim().min(2).max(80), active: z.boolean().default(true) });
export async function listCashRegisters(scope: TenantScope) {
  return prisma.cashRegister.findMany({ where: { tenantId: scope.tenantId, branchId: scope.branchId }, orderBy: [{ active: "desc" }, { name: "asc" }],
    select: { id: true, name: true, active: true, sessions: { where: { status: "OPEN" }, select: { id: true, openedAt: true, openedBy: { select: { name: true } } } } } });
}
export async function handleCashRegisters(method: string, id: string | undefined, body: unknown, scope: TenantScope) {
  if (method === "GET") {
    if (!hasPermission(scope.permissions, "restaurant:cash:read") && !hasPermission(scope.permissions, "restaurant:configuration:read")) throw new AppError("FORBIDDEN", 403, "No tienes permiso para consultar cajas.");
    return { registers: await listCashRegisters(scope) };
  }
  if (!hasPermission(scope.permissions, "restaurant:configuration:write")) throw new AppError("FORBIDDEN", 403, "Necesitas permiso de configuración para administrar cajas.");
  if ((method !== "POST" || id) && (method !== "PATCH" || !id)) throw new AppError("NOT_FOUND", 404, "Operación no encontrada.");
  const input = parseInput(schema, body);
  const nameKey = input.name.trim().toLowerCase();
  const result = await withSerializableTransaction(async tx => {
    const base = { tenantId: scope.tenantId, branchId: scope.branchId };
    if (id) {
      const register = await tx.cashRegister.findFirst({ where: { id, ...base } });
      if (!register) throw new AppError("NOT_FOUND", 404, "Caja no encontrada.");
      if (await tx.cashSession.count({ where: { ...base, cashRegisterId: id, status: "OPEN" } })) throw new AppError("REGISTER_IN_USE", 409, "Cierra el turno antes de modificar esta caja.");
    }
    if (await tx.cashRegister.findFirst({ where: { ...base, nameKey, ...(id ? { id: { not: id } } : {}) } })) throw new AppError("REGISTER_EXISTS", 409, "Ya existe una caja con ese nombre en esta sucursal.");
    const register = id ? await tx.cashRegister.update({ where: { id }, data: { ...input, nameKey } }) : await tx.cashRegister.create({ data: { ...base, ...input, nameKey } });
    await tx.auditLog.create({ data: { ...base, userId: scope.actorId, action: id ? "UPDATE" : "CREATE", entityType: "CashRegister", entityId: register.id, metadata: JSON.stringify(input) } });
    return register;
  });
  return { ok: true, id: result.id, message: "Caja configurada. Su historial se conserva." };
}
