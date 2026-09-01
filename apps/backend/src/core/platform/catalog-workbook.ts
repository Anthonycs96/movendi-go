import "server-only";

import ExcelJS, { ValueType, type Cell, type Worksheet } from "exceljs";
import JSZip from "jszip";
import { normalizeRestaurantArea, normalizeRestaurantCatalogLabel } from "@movendi/contracts";

export const RESTAURANT_CATALOG_TEMPLATE_VERSION = "MOVENDI_RESTAURANT_CATALOG_V1";
const MAX_UNCOMPRESSED_BYTES = 24 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 500;

export type CatalogWorkbookDraft = {
  categories: Array<{ name: string; preparationArea: string }>;
  products: Array<{ name: string; category: string; description: string; price: number; cost: number; preparationArea: string }>;
  addons: Array<{ name: string; price: number; cost: number; preparationArea: string; areaAssignmentMode: "INHERIT_FROM_PRODUCT" | "SPECIFIC_AREA" }>;
};

export type CatalogWorkbookIssue = { sheet: string; row: number; column: string; message: string; severity: "ERROR" | "WARNING" };

type WorkbookSource = {
  tenantId: string;
  tenantName: string;
  areas: string[];
  catalog: CatalogWorkbookDraft;
};

const colors = { navy: "17365D", blue: "1D70D6", paleBlue: "EAF3FF", green: "1D8061", paleGreen: "E9F7F1", amber: "F59E0B", paleAmber: "FFF7DF", border: "D9E2EC", text: "24364B", muted: "60758A", white: "FFFFFF" };

function writeMatrix(sheet: Worksheet, startRow: number, startColumn: number, values: Array<Array<string | number | boolean | null>>) {
  values.forEach((row, rowIndex) => row.forEach((value, columnIndex) => { sheet.getCell(startRow + rowIndex, startColumn + columnIndex).value = value; }));
}

function styleSheet(sheet: Worksheet, title: string, description: string, widths: number[]) {
  sheet.views = [{ state: "frozen", ySplit: 4, showGridLines: false }];
  sheet.mergeCells(1, 1, 1, widths.length);
  sheet.getCell("A1").value = title;
  sheet.getCell("A1").font = { bold: true, size: 16, color: { argb: colors.white } };
  sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.navy } };
  sheet.getCell("A1").alignment = { vertical: "middle" };
  sheet.getRow(1).height = 30;
  sheet.mergeCells(2, 1, 2, widths.length);
  sheet.getCell("A2").value = description;
  sheet.getCell("A2").font = { italic: true, color: { argb: colors.muted } };
  sheet.getCell("A2").alignment = { wrapText: true, vertical: "middle" };
  sheet.getRow(2).height = 30;
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
}

function styleHeader(sheet: Worksheet, columns: string[]) {
  const row = sheet.getRow(4);
  row.values = columns;
  row.height = 24;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: colors.white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.blue } };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: colors.navy } } };
  });
  sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: columns.length } };
}

function styleInputRows(sheet: Worksheet, fromRow: number, toRow: number, columns: number) {
  for (let column = 1; column <= columns; column += 1) {
    for (let row = fromRow; row <= toRow; row += 1) {
      const cell = sheet.getCell(row, column);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDF4" } };
      cell.border = { bottom: { style: "hair", color: { argb: colors.border } } };
      cell.alignment = { vertical: "middle", wrapText: column === 3 };
    }
  }
}

function listValidation(formula: string, prompt: string) {
  return { type: "list" as const, allowBlank: true, formulae: [formula], showErrorMessage: true, errorStyle: "stop", errorTitle: "Selecciona una opción válida", error: "Usa únicamente una opción de la lista.", showInputMessage: true, promptTitle: "MOVENDI GO", prompt };
}

export async function buildRestaurantCatalogWorkbook(source: WorkbookSource) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MOVENDI GO";
  workbook.lastModifiedBy = "MOVENDI GO";
  workbook.company = "MOVENDI GO";
  workbook.title = `Plantilla de carta · ${source.tenantName}`;
  workbook.subject = "Carga masiva validada de categorías, productos y adicionales";
  workbook.created = new Date();
  workbook.modified = new Date();

  const instructions = workbook.addWorksheet("Instrucciones", { properties: { tabColor: { argb: colors.navy } } });
  instructions.views = [{ showGridLines: false }];
  instructions.columns = [{ width: 5 }, { width: 34 }, { width: 92 }];
  instructions.mergeCells("A1:C1");
  instructions.getCell("A1").value = `Carga rápida de carta · ${source.tenantName}`;
  instructions.getCell("A1").font = { bold: true, size: 18, color: { argb: colors.white } };
  instructions.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.navy } };
  instructions.getCell("A1").alignment = { vertical: "middle" };
  instructions.getRow(1).height = 34;
  instructions.getRow(3).values = ["Paso", "Qué hacer", "Regla"];
  const instructionRows = [
    [1, "Revisa Áreas", "Las áreas provienen de la configuración guardada en MOVENDI GO y no deben escribirse manualmente."],
    [2, "Completa Categorías", "Selecciona un área para cada categoría. No repitas nombres con mayúsculas, tildes o plurales diferentes."],
    [3, "Completa Productos", "Selecciona una categoría del mismo archivo. Precio y costo deben ser números mayores o iguales a cero."],
    [4, "Completa Adicionales", "Elige si hereda el área del producto o si usa un área específica."],
    [5, "Sube el archivo", "MOVENDI GO validará todas las filas antes de cargarlas en la interfaz. Nada se guarda hasta confirmar el paso Carta."],
  ];
  writeMatrix(instructions, 4, 1, instructionRows);
  instructions.getRow(3).eachCell((cell) => { cell.font = { bold: true, color: { argb: colors.white } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.blue } }; });
  for (let row = 4; row <= 8; row += 1) instructions.getRow(row).eachCell((cell) => { cell.alignment = { vertical: "top", wrapText: true }; cell.border = { bottom: { style: "hair", color: { argb: colors.border } } }; });
  instructions.mergeCells("A10:C10");
  instructions.getCell("A10").value = "No cambies nombres de hojas, encabezados ni la hoja oculta de control. No uses fórmulas, macros ni enlaces externos.";
  instructions.getCell("A10").font = { bold: true, color: { argb: "9A6700" } };
  instructions.getCell("A10").fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.paleAmber } };
  instructions.getCell("A10").alignment = { wrapText: true, vertical: "middle" };
  instructions.getRow(10).height = 34;

  const areas = workbook.addWorksheet("Áreas", { properties: { tabColor: { argb: colors.green } } });
  styleSheet(areas, "Áreas operativas disponibles", "Se generan desde la configuración actual. Regresa a MOVENDI GO si necesitas agregar o modificar un área.", [28, 56]);
  styleHeader(areas, ["Área", "Uso"]);
  const areaRows = source.areas.map((area) => [area, "Disponible para categorías, productos y adicionales"]);
  if (areaRows.length) writeMatrix(areas, 5, 1, areaRows);
  for (let row = 5; row <= Math.max(5, 4 + areaRows.length); row += 1) areas.getRow(row).eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.paleGreen } }; });
  await areas.protect("MOVENDI-GO", { selectLockedCells: true, selectUnlockedCells: false });

  const categories = workbook.addWorksheet("Categorías", { properties: { tabColor: { argb: colors.blue } } });
  styleSheet(categories, "Categorías de la carta", "Crea primero las categorías. El área debe seleccionarse de la lista generada por MOVENDI GO.", [34, 28]);
  styleHeader(categories, ["Categoría*", "Área operativa*"]);
  source.catalog.categories.forEach((item, index) => { categories.getRow(5 + index).values = [item.name, item.preparationArea]; });
  styleInputRows(categories, 5, 104, 2);

  const products = workbook.addWorksheet("Productos", { properties: { tabColor: { argb: colors.blue } } });
  styleSheet(products, "Productos y precios", "Selecciona una categoría creada en la hoja Categorías. El área es opcional; vacía significa heredar el área de la categoría.", [34, 30, 48, 14, 14, 28]);
  styleHeader(products, ["Producto*", "Categoría*", "Descripción", "Precio*", "Costo", "Área específica (opcional)"]);
  source.catalog.products.forEach((item, index) => { products.getRow(5 + index).values = [item.name, item.category, item.description, item.price, item.cost, item.preparationArea]; });
  products.getColumn(4).numFmt = "#,##0.00";
  products.getColumn(5).numFmt = "#,##0.00";
  styleInputRows(products, 5, 504, 6);

  const addons = workbook.addWorksheet("Adicionales", { properties: { tabColor: { argb: colors.amber } } });
  styleSheet(addons, "Adicionales", "Usa Heredar del producto como opción predeterminada. Selecciona un área solo cuando el adicional tenga una ruta propia.", [36, 14, 14, 28, 28]);
  styleHeader(addons, ["Adicional*", "Precio*", "Costo", "Asignación de área*", "Área específica"]);
  source.catalog.addons.forEach((item, index) => { addons.getRow(5 + index).values = [item.name, item.price, item.cost, item.areaAssignmentMode === "SPECIFIC_AREA" ? "Área específica" : "Heredar del producto", item.preparationArea]; });
  addons.getColumn(2).numFmt = "#,##0.00";
  addons.getColumn(3).numFmt = "#,##0.00";
  styleInputRows(addons, 5, 204, 5);

  const lists = workbook.addWorksheet("_Listas");
  lists.state = "veryHidden";
  lists.getRow(1).values = ["Áreas", "Asignación"];
  source.areas.forEach((area, index) => { lists.getCell(2 + index, 1).value = area; });
  lists.getCell("B2").value = "Heredar del producto";
  lists.getCell("B3").value = "Área específica";

  const meta = workbook.addWorksheet("_Control");
  meta.state = "veryHidden";
  writeMatrix(meta, 1, 1, [
    ["FORMATO", RESTAURANT_CATALOG_TEMPLATE_VERSION],
    ["EMPRESA_ID", source.tenantId],
    ["EMPRESA", source.tenantName],
    ["GENERADO_EN", new Date().toISOString()],
    ["FILAS_MAXIMAS", "100 categorías · 500 productos · 200 adicionales"],
  ]);

  workbook.definedNames.add(`'_Listas'!$A$2:$A$${Math.max(2, source.areas.length + 1)}`, "ListaAreas");
  workbook.definedNames.add("'Categorías'!$A$5:$A$104", "ListaCategorias");
  workbook.definedNames.add("'_Listas'!$B$2:$B$3", "ListaAsignacionArea");
  for (let row = 5; row <= 104; row += 1) categories.getCell(row, 2).dataValidation = listValidation("ListaAreas", "Selecciona un área configurada.");
  for (let row = 5; row <= 504; row += 1) {
    products.getCell(row, 2).dataValidation = listValidation("ListaCategorias", "Selecciona una categoría de la hoja Categorías.");
    products.getCell(row, 4).dataValidation = { type: "decimal", operator: "between", formulae: [0, 100000], showErrorMessage: true, errorStyle: "stop", errorTitle: "Precio inválido", error: "Ingresa un número entre 0 y 100000." };
    products.getCell(row, 5).dataValidation = { type: "decimal", operator: "between", formulae: [0, 100000], allowBlank: true, showErrorMessage: true, errorStyle: "stop", errorTitle: "Costo inválido", error: "Ingresa un número entre 0 y 100000." };
    products.getCell(row, 6).dataValidation = listValidation("ListaAreas", "Déjalo vacío para heredar el área de la categoría.");
  }
  for (let row = 5; row <= 204; row += 1) {
    addons.getCell(row, 2).dataValidation = { type: "decimal", operator: "between", formulae: [0, 100000], showErrorMessage: true, errorStyle: "stop", errorTitle: "Precio inválido", error: "Ingresa un número entre 0 y 100000." };
    addons.getCell(row, 3).dataValidation = { type: "decimal", operator: "between", formulae: [0, 100000], allowBlank: true, showErrorMessage: true, errorStyle: "stop", errorTitle: "Costo inválido", error: "Ingresa un número entre 0 y 100000." };
    addons.getCell(row, 4).dataValidation = listValidation("ListaAsignacionArea", "Selecciona cómo se asignará el área.");
    addons.getCell(row, 5).dataValidation = listValidation("ListaAreas", "Obligatorio solo si elegiste Área específica.");
  }

  const buffer = await workbook.xlsx.writeBuffer({ useStyles: true, useSharedStrings: true });
  return Buffer.from(buffer);
}

async function assertSafeArchive(buffer: Buffer) {
  const archive = await JSZip.loadAsync(buffer, { checkCRC32: false });
  let entries = 0;
  let uncompressed = 0;
  archive.forEach((_path, entry) => {
    entries += 1;
    const size = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
    uncompressed += size;
  });
  if (entries > MAX_ARCHIVE_ENTRIES || uncompressed > MAX_UNCOMPRESSED_BYTES) throw new Error("El archivo Excel supera los límites seguros permitidos.");
}

function cellText(cell: Cell, issues: CatalogWorkbookIssue[], sheet: string, row: number, column: string) {
  if (cell.type === ValueType.Formula) {
    issues.push({ sheet, row, column, severity: "ERROR", message: "No se permiten fórmulas en campos editables." });
    return "";
  }
  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "text" in value && typeof value.text === "string") return value.text.trim();
  if (typeof value === "object" && "richText" in value && Array.isArray(value.richText)) return value.richText.map((item) => item.text).join("").trim();
  return String(cell.text ?? "").trim();
}

function moneyValue(cell: Cell, issues: CatalogWorkbookIssue[], sheet: string, row: number, column: string, required: boolean) {
  const raw = cellText(cell, issues, sheet, row, column);
  if (!raw && !required) return 0;
  const normalized = raw.includes(",") && !raw.includes(".") ? raw.replace(",", ".") : raw.replace(/,/g, "");
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0 || value > 100000) {
    issues.push({ sheet, row, column, severity: "ERROR", message: "Debe ser un número entre 0 y 100000." });
    return 0;
  }
  return Math.round(value * 100) / 100;
}

export async function parseRestaurantCatalogWorkbook(buffer: Buffer, expectedTenantId: string, allowedAreas: string[]) {
  await assertSafeArchive(buffer);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  if (workbook.worksheets.length > 10) throw new Error("El archivo contiene demasiadas hojas.");
  const meta = workbook.getWorksheet("_Control");
  if (!meta || meta.getCell("B1").text !== RESTAURANT_CATALOG_TEMPLATE_VERSION) throw new Error("Usa la plantilla de Carta descargada desde MOVENDI GO.");
  if (meta.getCell("B2").text !== expectedTenantId) throw new Error("La plantilla pertenece a otro negocio.");
  const categoriesSheet = workbook.getWorksheet("Categorías");
  const productsSheet = workbook.getWorksheet("Productos");
  const addonsSheet = workbook.getWorksheet("Adicionales");
  if (!categoriesSheet || !productsSheet || !addonsSheet) throw new Error("La plantilla está incompleta. No cambies los nombres de las hojas.");

  const issues: CatalogWorkbookIssue[] = [];
  const catalog: CatalogWorkbookDraft = { categories: [], products: [], addons: [] };
  const areaMap = new Map(allowedAreas.map((area) => [normalizeRestaurantArea(area)?.key, area]));

  const categoryMap = new Map<string, { row: number; name: string }>();
  for (let row = 5; row <= Math.min(categoriesSheet.rowCount, 104); row += 1) {
    const name = cellText(categoriesSheet.getCell(row, 1), issues, "Categorías", row, "A");
    const preparationArea = cellText(categoriesSheet.getCell(row, 2), issues, "Categorías", row, "B");
    if (!name && !preparationArea) continue;
    if (name.length < 2 || name.length > 100) issues.push({ sheet: "Categorías", row, column: "A", severity: "ERROR", message: "La categoría debe tener entre 2 y 100 caracteres." });
    const areaKey = normalizeRestaurantArea(preparationArea)?.key;
    if (!preparationArea || !areaKey || !areaMap.has(areaKey)) issues.push({ sheet: "Categorías", row, column: "B", severity: "ERROR", message: "Selecciona un área operativa configurada." });
    const normalizedName = normalizeRestaurantCatalogLabel(name);
    catalog.categories.push({ name: normalizedName.name, preparationArea: areaKey ? areaMap.get(areaKey) ?? preparationArea : preparationArea });
    const key = normalizedName.key;
    const previous = categoryMap.get(key);
    if (key && previous) issues.push({ sheet: "Categorías", row, column: "A", severity: "ERROR", message: `Está repetida con la fila ${previous.row}.` });
    else if (key) categoryMap.set(key, { row, name: normalizedName.name });
  }

  const itemNames = new Map<string, { sheet: string; row: number }>();
  for (let row = 5; row <= Math.min(productsSheet.rowCount, 504); row += 1) {
    const name = cellText(productsSheet.getCell(row, 1), issues, "Productos", row, "A");
    const category = cellText(productsSheet.getCell(row, 2), issues, "Productos", row, "B");
    const description = cellText(productsSheet.getCell(row, 3), issues, "Productos", row, "C");
    const preparationArea = cellText(productsSheet.getCell(row, 6), issues, "Productos", row, "F");
    const hasData = name || category || description || productsSheet.getCell(row, 4).value !== null || productsSheet.getCell(row, 5).value !== null || preparationArea;
    if (!hasData) continue;
    const price = moneyValue(productsSheet.getCell(row, 4), issues, "Productos", row, "D", true);
    const cost = moneyValue(productsSheet.getCell(row, 5), issues, "Productos", row, "E", false);
    if (name.length < 2 || name.length > 140) issues.push({ sheet: "Productos", row, column: "A", severity: "ERROR", message: "El producto debe tener entre 2 y 140 caracteres." });
    const categoryKey = normalizeRestaurantCatalogLabel(category).key;
    if (!categoryMap.has(categoryKey)) issues.push({ sheet: "Productos", row, column: "B", severity: "ERROR", message: "Selecciona una categoría creada en la hoja Categorías." });
    const areaKey = normalizeRestaurantArea(preparationArea)?.key;
    if (preparationArea && (!areaKey || !areaMap.has(areaKey))) issues.push({ sheet: "Productos", row, column: "F", severity: "ERROR", message: "Selecciona un área configurada o deja la celda vacía." });
    if (description.length > 400) issues.push({ sheet: "Productos", row, column: "C", severity: "ERROR", message: "La descripción admite hasta 400 caracteres." });
    if (price === 0) issues.push({ sheet: "Productos", row, column: "D", severity: "WARNING", message: "El producto se cargará con precio cero." });
    const normalizedName = normalizeRestaurantCatalogLabel(name);
    catalog.products.push({ name: normalizedName.name, category: categoryMap.get(categoryKey)?.name ?? category, description, price, cost, preparationArea: areaKey ? areaMap.get(areaKey) ?? preparationArea : "" });
    const previous = itemNames.get(normalizedName.key);
    if (normalizedName.key && previous) issues.push({ sheet: "Productos", row, column: "A", severity: "ERROR", message: `Está repetido con ${previous.sheet}, fila ${previous.row}.` });
    else if (normalizedName.key) itemNames.set(normalizedName.key, { sheet: "Productos", row });
  }

  for (let row = 5; row <= Math.min(addonsSheet.rowCount, 204); row += 1) {
    const name = cellText(addonsSheet.getCell(row, 1), issues, "Adicionales", row, "A");
    const modeText = cellText(addonsSheet.getCell(row, 4), issues, "Adicionales", row, "D");
    const preparationArea = cellText(addonsSheet.getCell(row, 5), issues, "Adicionales", row, "E");
    const hasData = name || modeText || addonsSheet.getCell(row, 2).value !== null || addonsSheet.getCell(row, 3).value !== null || preparationArea;
    if (!hasData) continue;
    const price = moneyValue(addonsSheet.getCell(row, 2), issues, "Adicionales", row, "B", true);
    const cost = moneyValue(addonsSheet.getCell(row, 3), issues, "Adicionales", row, "C", false);
    if (name.length < 2 || name.length > 140) issues.push({ sheet: "Adicionales", row, column: "A", severity: "ERROR", message: "El adicional debe tener entre 2 y 140 caracteres." });
    const areaAssignmentMode = modeText === "Área específica" || modeText === "SPECIFIC_AREA" ? "SPECIFIC_AREA" : modeText === "Heredar del producto" || modeText === "INHERIT_FROM_PRODUCT" || !modeText ? "INHERIT_FROM_PRODUCT" : null;
    if (!areaAssignmentMode) issues.push({ sheet: "Adicionales", row, column: "D", severity: "ERROR", message: "Selecciona Heredar del producto o Área específica." });
    const areaKey = normalizeRestaurantArea(preparationArea)?.key;
    if (areaAssignmentMode === "SPECIFIC_AREA" && (!areaKey || !areaMap.has(areaKey))) issues.push({ sheet: "Adicionales", row, column: "E", severity: "ERROR", message: "Selecciona el área específica configurada." });
    const normalizedName = normalizeRestaurantCatalogLabel(name);
    catalog.addons.push({ name: normalizedName.name, price, cost, preparationArea: areaKey ? areaMap.get(areaKey) ?? preparationArea : "", areaAssignmentMode: areaAssignmentMode ?? "INHERIT_FROM_PRODUCT" });
    const previous = itemNames.get(normalizedName.key);
    if (normalizedName.key && previous) issues.push({ sheet: "Adicionales", row, column: "A", severity: "ERROR", message: `Está repetido con ${previous.sheet}, fila ${previous.row}.` });
    else if (normalizedName.key) itemNames.set(normalizedName.key, { sheet: "Adicionales", row });
  }

  if (!catalog.categories.length) issues.push({ sheet: "Categorías", row: 5, column: "A", severity: "ERROR", message: "Agrega al menos una categoría." });
  if (!catalog.products.length) issues.push({ sheet: "Productos", row: 5, column: "A", severity: "ERROR", message: "Agrega al menos un producto." });
  const errors = issues.filter((issue) => issue.severity === "ERROR").length;
  return { valid: errors === 0, catalog, issues: issues.slice(0, 200), summary: { categories: catalog.categories.length, products: catalog.products.length, addons: catalog.addons.length, errors, warnings: issues.filter((issue) => issue.severity === "WARNING").length } };
}
