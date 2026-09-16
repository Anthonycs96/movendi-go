import "server-only";
import ExcelJS from "exceljs";
import { Readable } from "node:stream";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { TenantScope } from "@/core/auth/types";
import { AppError } from "@/core/auth/errors";
import { hasPermission } from "@/core/auth/permissions";
import { prepareSafeWorkbookBuffer } from "@/core/platform/catalog-workbook";
import { applyInventoryMovement } from "@/modules/inventory/server/service";
import { createRetailProduct } from "./catalog";
import { scoped, retailOperation, businessDate } from "./service";
import { amount, cents, date, key, productSchema } from "./schemas";

const headers = ["SKU", "Código de barras", "Nombre", "Categoría", "Presentación", "Unidad", "Factor", "Costo", "Precio", "Stock inicial", "Stock mínimo", "Controlar lotes", "Lote", "Vencimiento", "Fraccionado"];
const text = z.string().trim().min(1).max(120);
export const importRowSchema = z.object({ sourceRow: z.number().int().min(2).max(201).optional(), sku: text, barcode: z.string().trim().max(80), name: text, category: text, presentation: text, unit: z.enum(["UND", "KG", "L"]), factor: amount, costCents: cents, priceCents: cents, stock: z.number().min(0).max(1_000_000), minimumStock: z.number().min(0).max(1_000_000), trackExpiry: z.boolean(), lotCode: z.string().trim().max(120), expiresOn: date.or(z.literal("")), weighted: z.boolean() });
export const importSchema = z.object({ idempotencyKey: key, rows: z.array(importRowSchema).min(1).max(200) });
export type ImportRow = z.infer<typeof importRowSchema>;
type Issue = { row: number; message: string };

export async function importTemplate(format: string) {
  const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet("Productos");
  sheet.addRow(headers);
  sheet.columns.forEach((column, index) => { column.width = index === 2 ? 30 : 20; });
  sheet.getColumn(1).numFmt = "@"; sheet.getColumn(2).numFmt = "@";
  sheet.getRow(1).font = { bold: true }; sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.addRow(["EJEMPLO-01", "", "Producto de ejemplo", "General", "Unidad", "UND", 1, 2, 3, 0, 5, "No", "", "", "No"]);
  return format === "csv" ? Buffer.from(await workbook.csv.writeBuffer()) : Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function parseImportFile(buffer: Buffer, fileName: string) {
  if (buffer.length > 2 * 1024 * 1024) throw new AppError("FILE_TOO_LARGE", 413, "Usa un archivo de hasta 2 MB y 200 filas.");
  const workbook = new ExcelJS.Workbook();
  if (/\.csv$/i.test(fileName)) {
    const firstLine = buffer.toString("utf8").split(/\r?\n/, 1)[0];
    await workbook.csv.read(Readable.from([buffer]), { map: (value: string) => value, parserOptions: { delimiter: firstLine.includes(";") ? ";" : "," } });
  } else if (/\.xlsx$/i.test(fileName)) await workbook.xlsx.load(await prepareSafeWorkbookBuffer(buffer) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  else throw new AppError("FILE_TYPE", 400, "Selecciona un archivo .xlsx o .csv.");
  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 2 || sheet.rowCount > 201 || sheet.columnCount > headers.length) throw new AppError("IMPORT_LIMIT", 400, "La primera hoja debe tener encabezados y entre 1 y 200 filas.");
  if (headers.some((header, index) => sheet.getRow(1).getCell(index + 1).text.replace(/^\uFEFF/, "").trim() !== header)) throw new AppError("IMPORT_HEADER", 400, "Conserva los encabezados de la plantilla descargada.");
  const rows: ImportRow[] = [], issues: Issue[] = [];
  for (let row = 2; row <= sheet.rowCount; row++) {
    const cells = headers.map((_, index) => sheet.getRow(row).getCell(index + 1));
    if (cells.every((cell) => !cell.text.trim())) continue;
    if (cells.some((cell) => cell.type === ExcelJS.ValueType.Formula)) { issues.push({ row, message: "No se permiten fórmulas. Pega los valores." }); continue; }
    const values = cells.map((cell) => cell.value instanceof Date ? cell.value.toISOString().slice(0, 10) : cell.text.trim());
    const bool = (value: string) => /^(si|sí|true|1)$/i.test(value);
    if ([values[11], values[14]].some((value) => value && !/^(si|sí|true|1|no|false|0)$/i.test(value))) { issues.push({ row, message: "Usa Sí o No en las columnas de lotes y fraccionado." }); continue; }
    const number = (index: number) => values[index] === "" ? NaN : Number(values[index].replace(",", "."));
    const parsed = importRowSchema.safeParse({ sourceRow: row, sku: values[0], barcode: values[1], name: values[2], category: values[3], presentation: values[4], unit: values[5], factor: number(6), costCents: Math.round(number(7) * 100), priceCents: Math.round(number(8) * 100), stock: number(9), minimumStock: number(10), trackExpiry: bool(values[11]), lotCode: values[12], expiresOn: values[13], weighted: bool(values[14]) });
    if (!parsed.success) issues.push({ row, message: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") });
    else rows.push(parsed.data);
  }
  return { rows, issues };
}

export async function validateImport(tx: Prisma.TransactionClient, scope: TenantScope, rows: ImportRow[]) {
  const issues: Issue[] = [], groups = new Map<string, ImportRow[]>(), barcodes = new Set<string>(), today = await businessDate(tx, scope);
  for (const [index, row] of rows.entries()) {
    const error = (message: string) => issues.push({ row: row.sourceRow ?? index + 2, message });
    const prior = groups.get(row.sku) ?? [];
    if (row.unit === "UND" && (row.weighted || !Number.isInteger(row.factor) || !Number.isInteger(row.stock))) error("Las unidades requieren stock y factor enteros y no admiten venta fraccionada.");
    if (Math.abs(row.stock * 1e6 - Math.round(row.stock * 1e6)) > 1e-4) error("El stock admite hasta seis decimales.");
    if (row.trackExpiry && row.stock > 0 && (!row.lotCode || !row.expiresOn || row.expiresOn < today)) error("El stock inicial requiere lote y vencimiento vigente.");
    if (!row.trackExpiry && (row.lotCode || row.expiresOn)) error("Activa control de lotes para registrar lote/vencimiento.");
    if (row.barcode && barcodes.has(row.barcode)) error("El código de barras se repite en el archivo.");
    if (row.barcode) barcodes.add(row.barcode);
    if (prior.length && (row.stock !== 0 || ["name", "category", "unit", "minimumStock", "trackExpiry"].some((key) => row[key as keyof ImportRow] !== prior[0][key as keyof ImportRow]))) error("Las presentaciones del mismo SKU deben compartir datos del producto. El stock inicial se informa solo en su primera fila.");
    if (prior.some((p) => p.presentation === row.presentation) || prior.length >= 20) error("No repitas nombres de presentación; máximo 20 por producto.");
    groups.set(row.sku, [...prior, row]);
  }
  const [existing, codes] = await Promise.all([tx.inventoryItem.findMany({ where: { ...scoped(scope), sku: { in: [...groups.keys()] } }, select: { sku: true } }), tx.retailPresentation.findMany({ where: { ...scoped(scope), barcode: { in: [...barcodes] } }, select: { barcode: true } })]);
  rows.forEach((row, index) => { if (existing.some((item) => item.sku === row.sku)) issues.push({ row: row.sourceRow ?? index + 2, message: "El SKU ya existe en esta sucursal. Esta importación crea productos nuevos." }); if (row.barcode && codes.some((item) => item.barcode === row.barcode)) issues.push({ row: row.sourceRow ?? index + 2, message: "El código de barras ya existe en esta sucursal." }); });
  if (rows.some((row) => row.stock > 0) && !hasPermission(scope.permissions, "inventory:write")) issues.push({ row: 0, message: "Necesitas permiso para modificar inventario al importar stock inicial." });
  return { issues, groups };
}

export function commitImport(scope: TenantScope, input: z.infer<typeof importSchema>) {
  return retailOperation(scope, "CATALOG_IMPORT", input, async (tx, operationId) => {
    const validation = await validateImport(tx, scope, input.rows);
    if (validation.issues.length) throw new AppError("IMPORT_ERRORS", 409, "Corrige el archivo antes de importar. No se guardó ninguna fila.", { issues: validation.issues });
    for (const rows of validation.groups.values()) {
      const row = rows[0];
      const product = await createRetailProduct(tx, scope, productSchema.parse({ name: row.name, sku: row.sku, category: row.category, unit: row.unit, minimumStock: row.minimumStock, trackExpiry: row.trackExpiry, presentations: rows.map((r) => ({ name: r.presentation, barcode: r.barcode, factor: r.factor, priceCents: r.priceCents, weighted: r.weighted })) }));
      if (row.stock > 0) {
        if (row.trackExpiry) await tx.retailLot.create({ data: { productId: product.id, code: row.lotCode, expiresOn: row.expiresOn, stock: row.stock } });
        await applyInventoryMovement(tx, scope, { itemId: product.itemId, type: "OPENING", direction: "IN", quantity: row.stock, unitCostCents: row.costCents, originType: "RETAIL_IMPORT", originId: operationId, notes: "Stock inicial confirmado en importación" });
      } else if (row.costCents) await tx.inventoryItem.update({ where: { id: product.itemId }, data: { unitCostCents: row.costCents } });
    }
    return { id: operationId, code: `${validation.groups.size} productos importados` };
  });
}
