import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import { importTemplate, parseImportFile } from "./import";

test("plantillas Excel y CSV comparten columnas y conservan códigos como texto", async () => {
  for (const format of ["xlsx", "csv"]) {
    const parsed = await parseImportFile(await importTemplate(format), `products.${format}`);
    assert.deepEqual(parsed.issues, []); assert.equal(parsed.rows[0].sku, "EJEMPLO-01"); assert.equal(parsed.rows[0].priceCents, 300);
  }
});
test("importación rechaza fórmulas y conserva número físico de fila", async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await importTemplate("xlsx") as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.worksheets[0];
  sheet.getCell("I2").value = { formula: "1+1", result: 2 };
  const parsed = await parseImportFile(Buffer.from(await workbook.xlsx.writeBuffer()), "products.xlsx");
  assert.equal(parsed.issues[0].row, 2); assert.equal(parsed.rows.length, 0);
});
