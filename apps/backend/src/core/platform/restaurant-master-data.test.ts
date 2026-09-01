import assert from "node:assert/strict";
import test from "node:test";
import { restaurantControlMasterDataSchema, restaurantSalesMasterDataSchema } from "./restaurant-master-data";

test("acepta una carga maestra válida de inventario y recetas", () => {
  const result = restaurantControlMasterDataSchema.safeParse({ customers: [], inventoryItems: [{ sku: "CARNE-01", barcode: "", name: "Carne", kind: "INPUT", unit: "KG", openingStock: 10, minimumStock: 2, unitCost: 20, trackStock: true, notes: "" }], recipes: [{ product: "Lomo saltado", yieldQuantity: 1, ingredientSku: "CARNE-01", quantity: 0.25, wastePercent: 5 }] });
  assert.equal(result.success, true);
});

test("rechaza SKU e ingrediente duplicados antes de tocar la base de datos", () => {
  const item = { sku: "CARNE-01", barcode: "", name: "Carne", kind: "INPUT", unit: "KG", openingStock: 10, minimumStock: 2, unitCost: 20, trackStock: true, notes: "" };
  const line = { product: "Lomo saltado", yieldQuantity: 1, ingredientSku: "CARNE-01", quantity: 0.25, wastePercent: 5 };
  const result = restaurantControlMasterDataSchema.safeParse({ customers: [], inventoryItems: [item, item], recipes: [line, line] });
  assert.equal(result.success, false);
  if (!result.success) assert.ok(result.error.issues.length >= 2);
});

test("rechaza promociones por cantidad inconsistentes o con código duplicado", () => {
  const promotion = { name: "Dos por uno", code: "DOSXUNO", kind: "QUANTITY", value: 1, buyQuantity: 2, freeQuantity: 2, scope: "ORDER", target: "", minSubtotal: 0, maxDiscount: 0, automatic: true, weekdays: "0,1,2,3,4,5,6", startTime: "", endTime: "" };
  const result = restaurantSalesMasterDataSchema.safeParse({ promotions: [promotion, promotion] });
  assert.equal(result.success, false);
  if (!result.success) assert.ok(result.error.issues.length >= 2);
});
