import "server-only";
import { z } from "zod";
import { AppError } from "@/core/auth/errors";
import type { TenantScope } from "@/core/auth/types";
import { hasPermission } from "@/core/auth/permissions";
import { withSerializableTransaction } from "@/core/database/transactions";
import { parseInput as parse } from "@/core/validation/parse-input";
import { openCashSession, closeCashSession, registerCashMovement } from "@/modules/cash/server/service";
import { getRestaurantConfiguration } from "./configuration";

// The HTTP schemas retain their existing names, defaults and limits.
const cashOpenSchema = z.object({ openingAmount: z.coerce.number().nonnegative().max(1000000), registerName: z.string().trim().min(2).max(80).default("Caja principal"), notes: z.string().trim().max(500).optional(), idempotencyKey: z.string().trim().min(8).max(120).optional() });
const cashCloseSchema = z.object({ countedAmount: z.coerce.number().nonnegative().max(1000000), expectedCents: z.coerce.number().int().optional(), notes: z.string().trim().max(500).optional() });
const cashMovementSchema = z.object({ type: z.enum(["IN", "OUT"]), amount: z.coerce.number().positive().max(1_000_000), reason: z.string().trim().min(3).max(200), notes: z.string().trim().max(500).optional(), idempotencyKey: z.string().trim().min(8).max(120).optional() });

export async function handleRestaurantCashCommand(id: string | undefined, action: string | undefined, body: unknown, scope: TenantScope) {
  if (!id) {
    const input = parse(cashOpenSchema, body);
    const openingCents = Math.round(input.openingAmount * 100);
    const entity = await withSerializableTransaction(async (tx) => {
      const result = await openCashSession(tx, scope, { openingCents, registerName: input.registerName, notes: input.notes, idempotencyKey: input.idempotencyKey });
      if (!result.replayed) await tx.auditLog.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, userId: scope.actorId, action: "OPEN", entityType: "CashSession", entityId: result.session.id, metadata: JSON.stringify({ openingCents, registerName: input.registerName, notes: input.notes }) } });
      return result.session;
    });
    return { ok: true, id: entity.id, message: "Caja abierta correctamente." };
  }
  if (action === "close") {
    const input = parse(cashCloseSchema, body);
    const configuration = await getRestaurantConfiguration(scope.tenantId, scope.branchId);
    const result = await withSerializableTransaction(async (tx) => {
      const closed = await closeCashSession(tx, scope, { id, countedCents: Math.round(input.countedAmount * 100), expectedCents: input.expectedCents, notes: input.notes,
        policy: { toleranceCents: configuration.sales.cashDifferenceToleranceCents, canApprove: hasPermission(scope.permissions, "restaurant:cash:approve") } });
      await tx.auditLog.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, userId: scope.actorId, action: "CLOSE", entityType: "CashSession", entityId: id, metadata: JSON.stringify({ expectedCents: closed.expectedCents, countedCents: closed.countedCents, differenceCents: closed.differenceCents, notes: input.notes }) } });
      return closed;
    });
    return { ok: true, id, message: `Caja cerrada. Diferencia: S/ ${(result.differenceCents / 100).toFixed(2)}.` };
  }
  if (action === "movement") {
    const input = parse(cashMovementSchema, body);
    if (input.type === "OUT" && !hasPermission(scope.permissions, "restaurant:cash:approve")) throw new AppError("CASH_OUT_APPROVAL_REQUIRED", 403, "Los retiros requieren un rol con permiso para aprobar movimientos de caja.");
    const amountCents = Math.round(input.amount * 100);
    const result = await withSerializableTransaction(async (tx) => {
      const result = await registerCashMovement(tx, scope, { cashSessionId: id, ...input, amountCents });
      if (!result.replayed) await tx.auditLog.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, userId: scope.actorId, action: input.type === "IN" ? "CASH_IN" : "CASH_OUT", entityType: "CashMovement", entityId: result.movement.id, metadata: JSON.stringify({ cashSessionId: id, amountCents, reason: input.reason, notes: input.notes }) } });
      return result;
    });
    return { ok: true, id: result.movement.id, message: result.replayed ? "El movimiento ya quedó registrado." : input.type === "IN" ? "Ingreso de caja registrado." : "Retiro de caja registrado." };
  }
  throw new AppError("NOT_FOUND", 404, "Operación de restaurante no encontrada.");
}
