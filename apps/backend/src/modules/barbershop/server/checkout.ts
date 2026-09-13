import "server-only";
import { AppError } from "@/core/auth/errors";
import type { TenantScope } from "@/core/auth/types";
import { withSerializableTransaction } from "@/core/database/transactions";
import { checkoutAppointmentUseCase } from "../application/checkout";
import { AppointmentCheckoutError } from "../domain/checkout";
import { PrismaAppointmentCheckout } from "../infrastructure/prisma/checkout-port";

export async function checkoutAppointment(scope: TenantScope, appointmentId: string, paymentMethod: string) {
  try { return await withSerializableTransaction((tx) => checkoutAppointmentUseCase(new PrismaAppointmentCheckout(tx, scope, appointmentId), paymentMethod)); }
  catch (error) {
    if (error instanceof AppointmentCheckoutError) throw new AppError(error.code, error.code === "NOT_FOUND" ? 404 : 409, error.message);
    throw error;
  }
}
