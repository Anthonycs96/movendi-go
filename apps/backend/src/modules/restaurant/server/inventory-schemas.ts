import { z } from "zod";

const quantity = z.coerce.number().positive().max(1_000_000_000);

export const inventoryRecipeSchema = z.object({
  yieldQuantity: quantity.default(1),
  active: z.coerce.boolean().default(true),
  ingredients: z.array(z.object({
    itemId: z.string().min(1),
    quantity,
    wastePercent: z.coerce.number().min(0).max(100).default(0),
  })).min(1).max(100),
});

export const inventoryReturnSchema = z.object({ saleId: z.string().min(1), reason: z.string().trim().min(3).max(500) });
