import "server-only";
import { z } from "zod";
import { AppError } from "@/core/auth/errors";
import type { TenantScope } from "@/core/auth/types";
import { recordSupplierPayment } from "@/modules/inventory/server/suppliers";
import { registerCashMovement } from "@/modules/cash/server/service";
import { retailOperation, scoped } from "./service";
import { assertRetailCash } from "./cash-access";
import { key, paymentSchema } from "./schemas";

export const supplierSchema = z.object({ idempotencyKey: key, documentType: z.enum(["RUC", "DNI", "OTHER"]), documentNumber: z.string().trim().min(1).max(30), name: z.string().trim().min(2).max(120), phone: z.string().trim().max(30).optional(), email: z.string().email().or(z.literal("")).optional(), address: z.string().trim().max(200).optional(), contact: z.string().trim().max(120).optional(), active: z.boolean().default(true) }).refine((value) => value.documentType === "OTHER" || new RegExp(`^\\d{${value.documentType === "RUC" ? 11 : 8}}$`).test(value.documentNumber), "Revisa la longitud del DNI/RUC.");
export const supplierPaymentSchema = paymentSchema.extend({ idempotencyKey: key, cashSessionId: z.string().optional() });

export function saveSupplier(scope: TenantScope, input: z.infer<typeof supplierSchema>, id?: string) {
  return retailOperation(scope, "SUPPLIER_SAVE", { ...input, id }, async (tx) => {
    const { idempotencyKey: ignored, ...data } = input; void ignored;
    const exists = await tx.inventorySupplier.findFirst({ where: { ...scoped(scope), documentType: data.documentType, documentNumber: data.documentNumber, ...(id ? { id: { not: id } } : {}) } });
    if (exists) throw new AppError("DUPLICATE_SUPPLIER", 409, `El documento ya pertenece a ${exists.name}.`);
    if (id) {
      const updated = await tx.inventorySupplier.updateMany({ where: { id, ...scoped(scope) }, data });
      if (!updated.count) throw new AppError("NOT_FOUND", 404, "Proveedor no encontrado.");
      return { id };
    }
    const supplier = await tx.inventorySupplier.create({ data: { ...scoped(scope), ...data } });
    return { id: supplier.id };
  });
}

export function paySupplier(scope: TenantScope, payableId: string, input: z.infer<typeof supplierPaymentSchema>) {
  return retailOperation(scope, "SUPPLIER_PAYMENT", { ...input, payableId }, async (tx) => {
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: scope.tenantId }, select: { currency: true, paymentMethods: true } });
    if (!(JSON.parse(tenant.paymentMethods) as string[]).includes(input.method)) throw new AppError("PAYMENT_METHOD_DISABLED", 409, "Este medio de pago está deshabilitado.");
    const result = await recordSupplierPayment(tx, scope, { payableId, amountCents: input.amountCents, method: input.method, reference: input.reference ?? undefined });
    if (input.method === "CASH") {
      if (!input.cashSessionId || result.currency !== tenant.currency) throw new AppError("CASH_REQUIRED", 409, "Selecciona tu caja abierta en la moneda de la deuda para pagar en efectivo.");
      await assertRetailCash(tx, scope, input.cashSessionId);
      await registerCashMovement(tx, scope, { cashSessionId: input.cashSessionId, type: "OUT", amountCents: input.amountCents, reason: "Pago a proveedor", notes: payableId });
    }
    return result;
  });
}
