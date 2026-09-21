import { z } from "zod";

const text = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));
const money = z.coerce.number().nonnegative().max(100_000_000).transform((value) => Math.round(value * 100));
const quantity = z.coerce.number().positive().max(1_000_000_000);

export const inventoryItemSchema = z.object({
  sku: z.string().trim().toUpperCase().regex(/^[A-Z0-9._-]{2,40}$/),
  barcode: text(80),
  inventoryCategory: text(100),
  name: z.string().trim().min(2).max(160),
  kind: z.enum(["PRODUCT", "INPUT", "MATERIAL", "SUPPLY", "PART"]).default("MATERIAL"),
  unit: z.string().trim().toUpperCase().min(1).max(20),
  openingStock: z.coerce.number().nonnegative().max(1_000_000_000).default(0),
  minimumStock: z.coerce.number().nonnegative().max(1_000_000_000).default(0),
  unitCost: money.default(0),
  trackStock: z.coerce.boolean().default(true),
  notes: text(500),
});

export const inventoryItemUpdateSchema = inventoryItemSchema.omit({ openingStock: true }).extend({ active: z.coerce.boolean().default(true) });

export const inventoryMovementSchema = z.object({
  itemId: z.string().min(1),
  type: z.enum(["PURCHASE", "RESTOCK", "RETURN_IN", "CONSUMPTION", "WASTE", "LOSS", "ADJUSTMENT_IN", "ADJUSTMENT_OUT"]),
  quantity,
  unitCost: money.optional(),
  reference: text(100),
  notes: text(500),
  occurredAt: z.coerce.date().optional(),
  idempotencyKey: z.string().trim().min(8).max(120).optional(),
}).superRefine((input, context) => {
  if (["WASTE", "LOSS"].includes(input.type) && !input.notes?.trim()) context.addIssue({ code: "custom", path: ["notes"], message: "Indica el motivo de la merma o pérdida." });
});

const purchaseLine = z.object({ presentationId: z.string().optional(), itemId: z.string().min(1), quantity, unitCost: money });
export const inventoryPurchaseSchema = z.object({
  supplierId: z.string().min(1).optional(),
  supplierName: z.string().trim().min(2).max(160),
  documentNumber: text(80),
  purchasedAt: z.coerce.date().optional(),
  notes: text(500),
  idempotencyKey: z.string().trim().min(8).max(120).optional(),
  lines: z.array(purchaseLine).min(1).max(100),
});

const countLine = z.object({ itemId: z.string().min(1), countedQuantity: z.coerce.number().nonnegative().max(1_000_000_000) });
export const inventoryCountSchema = z.object({
  countedAt: z.coerce.date().optional(),
  notes: text(500),
  idempotencyKey: z.string().trim().min(8).max(120).optional(),
  lines: z.array(countLine).min(1).max(1000),
});
