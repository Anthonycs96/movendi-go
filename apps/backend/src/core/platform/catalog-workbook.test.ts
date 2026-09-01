import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { buildRestaurantCatalogWorkbook, parseRestaurantCatalogWorkbook } from "./catalog-workbook";

const source = {
  tenantId: "tenant-restaurant-1",
  tenantName: "Restaurante Prueba",
  areas: ["Cocina", "Barra"],
  catalog: {
    categories: [{ name: "Platos", preparationArea: "Cocina" }],
    products: [{ name: "Lomo saltado", category: "Platos", description: "Porción personal", price: 25.9, cost: 11, preparationArea: "" }],
    addons: [{ name: "Porción de papas", price: 7, cost: 2, preparationArea: "Cocina", areaAssignmentMode: "SPECIFIC_AREA" as const }],
  },
  masterData: {
    users: [{ name: "Ana Cocina", email: "ana@example.com", roleKey: "KITCHEN" }],
    zones: [{ name: "Salón principal", prefix: "Mesa", count: 10, seats: 4 }],
    customers: [{ name: "Cliente Uno", documentType: "DNI", documentNumber: "12345678", segment: "FREQUENT", phone: "999888777", email: "cliente@example.com", notes: "" }],
    inventoryItems: [{ sku: "CARNE-01", barcode: "", name: "Carne de res", kind: "INPUT", unit: "KG", openingStock: 5, minimumStock: 2, unitCost: 25, trackStock: true, notes: "" }],
    recipes: [{ product: "Lomo saltado", yieldQuantity: 1, ingredientSku: "CARNE-01", quantity: 0.25, wastePercent: 5 }],
    promotions: [{ name: "Almuerzo 10", code: "ALMUERZO10", kind: "PERCENT", value: 10, buyQuantity: 2, freeQuantity: 1, scope: "CATEGORY", target: "Platos", minSubtotal: 20, maxDiscount: 15, automatic: true, weekdays: "1,2,3,4,5", startTime: "12:00", endTime: "15:00" }],
  },
  lists: { roles: [{ key: "KITCHEN", name: "Cocina" }], documentTypes: ["DNI", "RUC"], customerSegments: ["NEW", "FREQUENT"], inventoryUnits: ["KG", "UND"], promotionKinds: ["PERCENT", "FIXED", "QUANTITY"], promotionScopes: ["ORDER", "CATEGORY", "PRODUCT"] },
};

test("genera una plantilla dinámica y recupera su carta sin perder relaciones", async () => {
  const file = await buildRestaurantCatalogWorkbook(source);
  const parsed = await parseRestaurantCatalogWorkbook(file, source.tenantId, source.areas);
  assert.equal(parsed.valid, true);
  assert.deepEqual(parsed.summary, { categories: 1, products: 1, addons: 1, users: 1, zones: 1, customers: 1, inventoryItems: 1, recipes: 1, promotions: 1, errors: 0, warnings: 0 });
  assert.equal(parsed.catalog.products[0]?.category, "Platos");
  assert.equal(parsed.catalog.addons[0]?.areaAssignmentMode, "SPECIFIC_AREA");
  assert.equal(parsed.masterData.users[0]?.roleKey, "KITCHEN");
  assert.equal(parsed.masterData.inventoryItems[0]?.openingStock, 5);
  assert.equal(parsed.masterData.recipes[0]?.ingredientSku, "CARNE-01");
  assert.equal(parsed.masterData.promotions[0]?.target, "Platos");
});

test("rechaza una plantilla generada para otra empresa", async () => {
  const file = await buildRestaurantCatalogWorkbook(source);
  await assert.rejects(() => parseRestaurantCatalogWorkbook(file, "tenant-different", source.areas), /otro negocio/);
});

test("marca fórmulas como errores y no las ejecuta durante la importación", async () => {
  const file = await buildRestaurantCatalogWorkbook(source);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(file as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  workbook.getWorksheet("Productos")!.getCell("A5").value = { formula: "=HYPERLINK(\"https://invalid.example\",\"Producto\")", result: "Producto" };
  const changed = Buffer.from(await workbook.xlsx.writeBuffer());
  const parsed = await parseRestaurantCatalogWorkbook(changed, source.tenantId, source.areas);
  assert.equal(parsed.valid, false);
  assert.ok(parsed.issues.some((issue) => issue.sheet === "Productos" && issue.row === 5 && issue.column === "A" && issue.message.includes("fórmulas")));
});

test("acepta archivos guardados con elementos OOXML prefijados", async () => {
  const file = await buildRestaurantCatalogWorkbook(source);
  const archive = await JSZip.loadAsync(file);
  const namespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  for (const [path, entry] of Object.entries(archive.files)) {
    if (entry.dir || !path.startsWith("xl/") || !path.endsWith(".xml")) continue;
    const content = await entry.async("string");
    if (!content.includes(`xmlns="${namespace}"`)) continue;
    const prefixed = content
      .replace(`xmlns="${namespace}"`, `xmlns:x="${namespace}"`)
      .replace(/<(\/?)((?!\?xml)[A-Za-z][\w.-]*)(?=[\s>])/g, "<$1x:$2");
    archive.file(path, prefixed);
  }
  const prefixedFile = Buffer.from(await archive.generateAsync({ type: "nodebuffer" }));
  const parsed = await parseRestaurantCatalogWorkbook(prefixedFile, source.tenantId, source.areas);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.catalog.products[0]?.name, "Lomo saltado");
});
