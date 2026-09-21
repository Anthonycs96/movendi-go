import { z } from "zod";

const text = (max: number) => z.string().trim().max(max).optional();
export const moneyCents = z.coerce.number().int().min(0).max(100_000_000);
const optionalCents = z.preprocess((v) => v === "" || v === undefined ? null : v, moneyCents.nullable());
const optionalPercent = z.preprocess((v) => v === "" || v === undefined ? null : v, z.coerce.number().int().min(0).max(100).nullable());
const active = z.union([z.boolean(), z.enum(["true", "false"]).transform((v) => v === "true")]);
export const paymentMethod = z.enum(["CASH", "CARD", "TRANSFER", "YAPE", "PLIN", "OTHER"]);
export const customerSchema = z.object({ name: z.string().trim().min(2).max(120), dni: z.string().trim().regex(/^(\d{8})?$/, "El DNI debe tener 8 dígitos.").optional(), phone: text(30), email: z.string().email().or(z.literal("")).optional(), notes: text(2000), active: active.optional() });
export const staffSchema = z.object({ name: z.string().trim().min(2).max(120), phone: text(30), specialty: text(120), commissionPct: z.coerce.number().int().min(0).max(100), commissionFixedCents: optionalCents, productCommissionPct: z.coerce.number().int().min(0).max(100).default(0), productCommissionFixedCents: optionalCents, active: active.optional() });
export const serviceSchema = z.object({ name: z.string().trim().min(2).max(120), category: text(80), durationMinutes: z.coerce.number().int().min(10).max(480), price: z.coerce.number().positive().max(100000), active: active.optional(), staffIds: z.array(z.string().min(1)).max(100).optional(), supplies: z.array(z.object({ itemId: z.string().min(1), quantity: z.coerce.number().positive().max(100000) })).max(100).optional(), commissionPct: optionalPercent, commissionFixedCents: optionalCents });
export const appointmentSchema = z.object({ customerId: z.string().min(1), staffId: z.string().min(1), serviceId: z.string().min(1), startsAt: z.union([z.string().min(16), z.date()]), notes: text(2000) });
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Usa una hora válida.");
export const scheduleSchema = z.object({ staffId: z.string().min(1), weekday: z.coerce.number().int().min(0).max(6), startsAt: time, endsAt: time, active: active.default(true) });
export const blockSchema = z.object({ staffId: z.string().min(1), startsAt: z.string().min(16), endsAt: z.string().min(16), reason: z.string().trim().min(3).max(300) });
export const checkoutSchema = z.object({
  idempotencyKey: z.string().min(8).max(120), appointmentId: z.string().min(1).optional(), customerId: z.string().min(1).nullable().optional(),
  lines: z.array(z.object({ serviceId: z.string().min(1).optional(), productId: z.string().min(1).optional(), staffId: z.string().min(1).optional(), quantity: z.coerce.number().int().min(1).max(100).default(1) }).refine((l) => Boolean(l.serviceId) !== Boolean(l.productId), "Selecciona servicio o producto.")).max(100).default([]),
  discountCents: moneyCents.default(0), discountReason: text(200), promotionId: z.string().min(1).optional(),
  payments: z.array(z.object({ method: paymentMethod, amountCents: moneyCents.refine((n) => n > 0), reference: text(120) })).min(1).max(6).optional(),
  paymentMethod: paymentMethod.optional(), cashReceivedCents: moneyCents.optional(),
}).refine((v) => v.appointmentId || v.lines.length, "Agrega al menos un servicio o producto.");
export type SalonCheckout = z.infer<typeof checkoutSchema>;
export const promotionSchema = z.object({ name: z.string().trim().min(2).max(120), kind: z.enum(["PERCENT", "FIXED"]), value: moneyCents, startsAt: z.string().optional(), endsAt: z.string().optional(), active: active.default(true) }).refine((v) => v.kind !== "PERCENT" || v.value <= 100, "Porcentaje máximo 100.");
