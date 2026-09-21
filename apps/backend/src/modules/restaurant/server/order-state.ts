import type { TenantScope } from "@/core/auth/types";
import { AppError } from "@/core/auth/errors";
import { PreparationError } from "../domain/preparation-transition";
import { updateKitchen as executeKitchen } from "../infrastructure/prisma/preparation";
export { updateOrderState } from "../infrastructure/prisma/preparation";
export async function updateKitchen(scope: TenantScope, id: string, input: { status: string; itemIds?: string[]; confirmed?: boolean }) {
  try { return await executeKitchen(scope, id, input); }
  catch (error) { if (error instanceof PreparationError) throw new AppError(error.code, error.code === "INVALID_TICKET_ITEMS" ? 400 : 409, error.message); throw error; }
}
