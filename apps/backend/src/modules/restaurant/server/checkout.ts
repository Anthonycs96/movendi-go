import type { TenantScope } from "@/core/auth/types";
import { AppError } from "@/core/auth/errors";
import { RestaurantCheckoutError } from "../domain/checkout";
import { checkoutRestaurantOrder as execute, type CheckoutInput } from "../infrastructure/prisma/checkout";
export async function checkoutRestaurantOrder(scope: TenantScope, id: string, input: CheckoutInput) {
  try { return await execute(scope, id, input); }
  catch (error) { if (error instanceof RestaurantCheckoutError) throw new AppError(error.code, 409, error.message); throw error; }
}
