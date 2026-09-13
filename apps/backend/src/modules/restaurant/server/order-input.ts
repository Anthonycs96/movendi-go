import { z } from "zod";
const configuredKey = z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]+$/).min(1).max(80);
const orderItemsSchema = z.array(z.object({ productId: z.string().min(1), parentProductId: z.string().min(1).optional(), quantity: z.coerce.number().int().min(1).max(50), notes: z.string().trim().max(300).optional() })).min(1).max(50);
export const orderSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(120).optional(),
  source: configuredKey.default("DINE_IN"),
  tableId: z.string().optional(), customerId: z.string().optional(),
  deliveryPhone: z.string().trim().max(30).optional(), deliveryAddress: z.string().trim().max(300).optional(), deliveryReference: z.string().trim().max(300).optional(),
  deliveryFee: z.coerce.number().min(0).max(10_000).default(0),
  promotionCode: z.string().trim().max(40).optional(), notes: z.string().trim().max(500).optional(),
  items: orderItemsSchema,
}).superRefine((input, context) => {
  if (input.source === "DINE_IN" && !input.tableId) context.addIssue({ code: z.ZodIssueCode.custom, path: ["tableId"], message: "Selecciona una mesa." });
});
export const addItemsSchema = z.object({ items: orderItemsSchema, idempotencyKey: z.string().trim().min(8).max(120).optional() });
export type NewOrderInput = z.infer<typeof orderSchema>;
export type AddItemsInput = z.infer<typeof addItemsSchema>;
