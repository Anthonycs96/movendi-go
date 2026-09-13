import "server-only";
import type { Prisma } from "@prisma/client";
import { AppError } from "@/core/auth/errors";
import type { TenantScope } from "@/core/auth/types";
import { applyInventoryMovementUseCase, registerInventoryCountUseCase, registerInventoryPurchaseUseCase, InventoryConcurrencyError, InventoryError, type InventoryCountInput, type InventoryMovementInput, type InventoryPurchaseInput } from "../public";
import { PrismaInventoryRepository } from "../infrastructure/prisma/prisma-inventory-repository";
import { PrismaInventoryPurchaseRepository } from "../infrastructure/prisma/prisma-inventory-purchase-repository";
import { inventoryCountCode, operationCode } from "./operation-code";
import { PrismaInventoryCountRepository } from "../infrastructure/prisma/prisma-inventory-count-repository";
import { TransactionConflictError } from "@/core/database/transactions";
import { noOnHandReservations } from "./policies";
import type { InventoryOnHandReservations } from "../public";

export type { InventoryMovementInput } from "../public";

async function withInventoryErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof InventoryConcurrencyError) throw new TransactionConflictError(error.message);
    if (error instanceof InventoryError) {
      const status = ["INVALID_QUANTITY", "INVALID_PURCHASE", "DUPLICATE_LINES"].includes(error.code) ? 400 : error.code === "INVENTORY_ITEM_NOT_FOUND" ? 404 : 409;
      throw new AppError(error.code, status, error.message);
    }
    throw error;
  }
}

export async function applyInventoryMovement(transaction: Prisma.TransactionClient, scope: TenantScope, input: InventoryMovementInput) {
  return withInventoryErrors(() => applyInventoryMovementUseCase(new PrismaInventoryRepository(transaction, scope), scope, input));
}

export async function registerInventoryPurchase(transaction: Prisma.TransactionClient, scope: TenantScope, input: InventoryPurchaseInput) {
  return withInventoryErrors(() => registerInventoryPurchaseUseCase(
    new PrismaInventoryPurchaseRepository(transaction, scope), new PrismaInventoryRepository(transaction, scope),
    scope, input, () => operationCode("COM"),
  ));
}

export async function registerInventoryCount(transaction: Prisma.TransactionClient, scope: TenantScope, input: InventoryCountInput, reservations: InventoryOnHandReservations = noOnHandReservations) {
  return withInventoryErrors(() => registerInventoryCountUseCase(
    new PrismaInventoryCountRepository(transaction, scope), new PrismaInventoryRepository(transaction, scope),
    reservations, scope, input, inventoryCountCode(scope.branchId, input.idempotencyKey),
  ));
}
