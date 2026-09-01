import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
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
};

test("genera una plantilla dinámica y recupera su carta sin perder relaciones", async () => {
  const file = await buildRestaurantCatalogWorkbook(source);
  const parsed = await parseRestaurantCatalogWorkbook(file, source.tenantId, source.areas);
  assert.equal(parsed.valid, true);
  assert.deepEqual(parsed.summary, { categories: 1, products: 1, addons: 1, errors: 0, warnings: 0 });
  assert.equal(parsed.catalog.products[0]?.category, "Platos");
  assert.equal(parsed.catalog.addons[0]?.areaAssignmentMode, "SPECIFIC_AREA");
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
