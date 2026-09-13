import "server-only";
import { z } from "zod";
import { AppError } from "@/core/auth/errors";
import type { TenantScope } from "@/core/auth/types";
import { executeRefund } from "../infrastructure/prisma/refund";
const refundSchema = z.object({ reason: z.string().trim().min(5).max(300), stockDisposition: z.enum(["RESTOCK", "WASTE"]), paymentConfirmed: z.literal(true) });

export async function refundRestaurantSale(scope: TenantScope, saleId: string, body: unknown) {
  const parsed = refundSchema.safeParse(body);
  if (!parsed.success) throw new AppError("VALIDATION_ERROR", 400, "Indica el motivo, el destino de insumos y confirma la devolución del dinero.", parsed.error.flatten());
  const input = parsed.data;
  return executeRefund(scope, saleId, input);
}
