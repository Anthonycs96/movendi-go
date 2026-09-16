import "server-only";

import ExcelJS, { ValueType, type Cell, type Worksheet } from "exceljs";
import JSZip from "jszip";
import { normalizeRestaurantArea, normalizeRestaurantCatalogLabel } from "@movendi/contracts";

export const RESTAURANT_CATALOG_TEMPLATE_VERSION = "MOVENDI_RESTAURANT_MASTER_V2";
const LEGACY_RESTAURANT_CATALOG_TEMPLATE_VERSION = "MOVENDI_RESTAURANT_CATALOG_V1";
const MAX_UNCOMPRESSED_BYTES = 24 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 500;
const SPREADSHEET_MAIN_NAMESPACE = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

export type CatalogWorkbookDraft = {
  categories: Array<{ name: string; preparationArea: string }>;
  products: Array<{ name: string; category: string; description: string; price: number; cost: number; preparationArea: string }>;
  addons: Array<{ name: string; price: number; cost: number; preparationArea: string; areaAssignmentMode: "INHERIT_FROM_PRODUCT" | "SPECIFIC_AREA" }>;
};

export type CatalogWorkbookIssue = { sheet: string; row: number; column: string; message: string; severity: "ERROR" | "WARNING" };

export type RestaurantMasterWorkbookDraft = {
  users: Array<{ name: string; email: string; roleKey: string }>;
  zones: Array<{ name: string; prefix: string; count: number; seats: number }>;
  customers: Array<{ name: string; documentType: string; documentNumber: string; segment: string; phone: string; email: string; notes: string }>;
  inventoryItems: Array<{ sku: string; barcode: string; name: string; kind: string; unit: string; openingStock: number; minimumStock: number; unitCost: number; trackStock: boolean; notes: string }>;
  recipes: Array<{ product: string; yieldQuantity: number; ingredientSku: string; quantity: number; wastePercent: number }>;
  promotions: Array<{ name: string; code: string; kind: string; value: number; buyQuantity: number; freeQuantity: number; scope: string; target: string; minSubtotal: number; maxDiscount: number; automatic: boolean; weekdays: string; startTime: string; endTime: string }>;
};

type WorkbookSource = {
  tenantId: string;
  tenantName: string;
  areas: string[];
  catalog: CatalogWorkbookDraft;
  masterData?: RestaurantMasterWorkbookDraft;
  lists?: { roles: Array<{ key: string; name: string }>; documentTypes: string[]; customerSegments: string[]; inventoryUnits: string[]; promotionKinds: string[]; promotionScopes: string[] };
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
  workbook.title = `Plantilla maestra de restaurante · ${source.tenantName}`;
  workbook.subject = "Carga masiva validada de carta, equipo, salón, clientes, inventario, recetas y promociones";
  workbook.created = new Date();
  workbook.modified = new Date();

  const instructions = workbook.addWorksheet("Instrucciones", { properties: { tabColor: { argb: colors.navy } } });
  instructions.views = [{ showGridLines: false }];
  instructions.columns = [{ width: 5 }, { width: 34 }, { width: 92 }];
  instructions.mergeCells("A1:C1");
  instructions.getCell("A1").value = `Carga maestra de restaurante · ${source.tenantName}`;
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
    [5, "Completa maestros opcionales", "Equipo, salón, clientes, inventario, recetas y promociones usan listas conectadas con la configuración del negocio."],
    [6, "Sube el archivo", "MOVENDI GO validará todas las filas antes de cargarlas en la interfaz. Nada se guarda hasta confirmar cada paso."],
  ];
  writeMatrix(instructions, 4, 1, instructionRows);
  instructions.getRow(3).eachCell((cell) => { cell.font = { bold: true, color: { argb: colors.white } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.blue } }; });
  for (let row = 4; row <= 9; row += 1) instructions.getRow(row).eachCell((cell) => { cell.alignment = { vertical: "top", wrapText: true }; cell.border = { bottom: { style: "hair", color: { argb: colors.border } } }; });
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

  const master = source.masterData ?? { users: [], zones: [], customers: [], inventoryItems: [], recipes: [], promotions: [] };
  const sourceLists = source.lists ?? { roles: [], documentTypes: [], customerSegments: [], inventoryUnits: [], promotionKinds: [], promotionScopes: [] };
  const team = workbook.addWorksheet("Equipo", { properties: { tabColor: { argb: colors.green } } });
  styleSheet(team, "Usuarios iniciales", "Selecciona una clave de rol existente. Las contraseñas temporales se generan de forma segura al guardar el paso Equipo.", [34, 42, 24]);
  styleHeader(team, ["Nombre*", "Correo*", "Rol*"]);
  master.users.forEach((item, index) => { team.getRow(5 + index).values = [item.name, item.email, item.roleKey]; });
  styleInputRows(team, 5, 104, 3);

  const salon = workbook.addWorksheet("Salón", { properties: { tabColor: { argb: colors.green } } });
  styleSheet(salon, "Zonas y mesas", "Cada fila crea una zona y genera sus mesas de forma automática. Ejemplo: Terraza, Mesa, 8, 4.", [32, 22, 18, 18]);
  styleHeader(salon, ["Zona*", "Prefijo de mesa*", "Cantidad*", "Asientos*"]);
  master.zones.forEach((item, index) => { salon.getRow(5 + index).values = [item.name, item.prefix, item.count, item.seats]; });
  styleInputRows(salon, 5, 54, 4);

  const customers = workbook.addWorksheet("Clientes", { properties: { tabColor: { argb: colors.green } } });
  styleSheet(customers, "Clientes", "Documento y teléfono se usan para actualizar sin duplicar. Deja vacías las columnas opcionales.", [34, 20, 24, 22, 22, 36, 48]);
  styleHeader(customers, ["Nombre*", "Tipo documento", "Número documento", "Segmento", "Teléfono", "Correo", "Observaciones"]);
  master.customers.forEach((item, index) => { customers.getRow(5 + index).values = [item.name, item.documentType, item.documentNumber, item.segment, item.phone, item.email, item.notes]; });
  styleInputRows(customers, 5, 504, 7);

  const inventory = workbook.addWorksheet("Inventario", { properties: { tabColor: { argb: colors.amber } } });
  styleSheet(inventory, "Inventario inicial", "El SKU identifica cada insumo. Una nueva carga actualiza sus datos, pero nunca sobrescribe el stock operativo ya existente.", [20, 24, 36, 20, 16, 18, 18, 18, 18, 46]);
  styleHeader(inventory, ["SKU*", "Código de barras", "Insumo*", "Tipo*", "Unidad*", "Stock inicial", "Stock mínimo", "Costo unitario", "Controlar stock*", "Observaciones"]);
  master.inventoryItems.forEach((item, index) => { inventory.getRow(5 + index).values = [item.sku, item.barcode, item.name, item.kind, item.unit, item.openingStock, item.minimumStock, item.unitCost, item.trackStock ? "Sí" : "No", item.notes]; });
  inventory.getColumn(8).numFmt = "#,##0.00";
  styleInputRows(inventory, 5, 504, 10);

  const recipes = workbook.addWorksheet("Recetas", { properties: { tabColor: { argb: colors.amber } } });
  styleSheet(recipes, "Recetas por producto", "Repite el producto en una fila por ingrediente. Producto y SKU deben existir en las hojas Productos e Inventario.", [36, 18, 24, 20, 18]);
  styleHeader(recipes, ["Producto*", "Rendimiento*", "SKU ingrediente*", "Cantidad*", "Merma %"]);
  master.recipes.forEach((item, index) => { recipes.getRow(5 + index).values = [item.product, item.yieldQuantity, item.ingredientSku, item.quantity, item.wastePercent]; });
  styleInputRows(recipes, 5, 1004, 5);

  const promotions = workbook.addWorksheet("Promociones", { properties: { tabColor: { argb: colors.amber } } });
  styleSheet(promotions, "Promociones", "Para alcance Categoría o Producto selecciona el destino correspondiente. Días usa 0=domingo hasta 6=sábado.", [34, 20, 20, 16, 16, 16, 18, 34, 20, 20, 18, 24, 16, 16]);
  styleHeader(promotions, ["Promoción*", "Código", "Tipo*", "Valor*", "Compra", "Gratis", "Alcance*", "Destino", "Consumo mínimo", "Descuento máximo", "Automática*", "Días", "Hora inicio", "Hora fin"]);
  master.promotions.forEach((item, index) => { promotions.getRow(5 + index).values = [item.name, item.code, item.kind, item.value, item.buyQuantity, item.freeQuantity, item.scope, item.target, item.minSubtotal, item.maxDiscount, item.automatic ? "Sí" : "No", item.weekdays, item.startTime, item.endTime]; });
  styleInputRows(promotions, 5, 204, 14);

  sourceLists.roles.forEach((role, index) => { lists.getCell(2 + index, 3).value = role.key; lists.getCell(2 + index, 4).value = role.name; });
  sourceLists.documentTypes.forEach((value, index) => { lists.getCell(2 + index, 5).value = value; });
  sourceLists.customerSegments.forEach((value, index) => { lists.getCell(2 + index, 6).value = value; });
  sourceLists.inventoryUnits.forEach((value, index) => { lists.getCell(2 + index, 7).value = value; });
  ["PRODUCT", "INPUT", "MATERIAL", "SUPPLY", "PART"].forEach((value, index) => { lists.getCell(2 + index, 8).value = value; });
  sourceLists.promotionKinds.forEach((value, index) => { lists.getCell(2 + index, 9).value = value; });
  sourceLists.promotionScopes.forEach((value, index) => { lists.getCell(2 + index, 10).value = value; });
  ["Sí", "No"].forEach((value, index) => { lists.getCell(2 + index, 11).value = value; });
  workbook.definedNames.add(`'_Listas'!$C$2:$C$${Math.max(2, sourceLists.roles.length + 1)}`, "ListaRoles");
  workbook.definedNames.add(`'_Listas'!$E$2:$E$${Math.max(2, sourceLists.documentTypes.length + 1)}`, "ListaDocumentos");
  workbook.definedNames.add(`'_Listas'!$F$2:$F$${Math.max(2, sourceLists.customerSegments.length + 1)}`, "ListaSegmentos");
  workbook.definedNames.add(`'_Listas'!$G$2:$G$${Math.max(2, sourceLists.inventoryUnits.length + 1)}`, "ListaUnidades");
  workbook.definedNames.add("'_Listas'!$H$2:$H$6", "ListaTiposInventario");
  workbook.definedNames.add(`'_Listas'!$I$2:$I$${Math.max(2, sourceLists.promotionKinds.length + 1)}`, "ListaTiposPromocion");
  workbook.definedNames.add(`'_Listas'!$J$2:$J$${Math.max(2, sourceLists.promotionScopes.length + 1)}`, "ListaAlcancesPromocion");
  workbook.definedNames.add("'_Listas'!$K$2:$K$3", "ListaSiNo");
  workbook.definedNames.add("'Productos'!$A$5:$A$504", "ListaProductos");
  workbook.definedNames.add("'Inventario'!$A$5:$A$504", "ListaSkuInventario");
  for (let row = 5; row <= 104; row += 1) team.getCell(row, 3).dataValidation = listValidation("ListaRoles", "Selecciona una clave de rol existente.");
  for (let row = 5; row <= 504; row += 1) {
    customers.getCell(row, 2).dataValidation = listValidation("ListaDocumentos", "Selecciona un tipo configurado.");
    customers.getCell(row, 4).dataValidation = listValidation("ListaSegmentos", "Selecciona un segmento configurado.");
    inventory.getCell(row, 4).dataValidation = listValidation("ListaTiposInventario", "Selecciona el tipo del artículo.");
    inventory.getCell(row, 5).dataValidation = listValidation("ListaUnidades", "Selecciona una unidad configurada.");
    inventory.getCell(row, 9).dataValidation = listValidation("ListaSiNo", "Indica si se controlará stock.");
  }
  for (let row = 5; row <= 1004; row += 1) {
    recipes.getCell(row, 1).dataValidation = listValidation("ListaProductos", "Selecciona un producto de la carta.");
    recipes.getCell(row, 3).dataValidation = listValidation("ListaSkuInventario", "Selecciona un SKU de Inventario.");
  }
  for (let row = 5; row <= 204; row += 1) {
    promotions.getCell(row, 3).dataValidation = listValidation("ListaTiposPromocion", "Selecciona un tipo configurado.");
    promotions.getCell(row, 7).dataValidation = listValidation("ListaAlcancesPromocion", "Selecciona el alcance.");
    promotions.getCell(row, 11).dataValidation = listValidation("ListaSiNo", "Indica si la promoción es automática.");
  }

  const buffer = await workbook.xlsx.writeBuffer({ useStyles: true, useSharedStrings: true });
  return Buffer.from(buffer);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function prepareSafeWorkbookBuffer(buffer: Buffer) {
  const archive = await JSZip.loadAsync(buffer, { checkCRC32: false });
  let entries = 0;
  let uncompressed = 0;
  archive.forEach((_path, entry) => {
    entries += 1;
    const size = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
    uncompressed += size;
  });
  if (entries > MAX_ARCHIVE_ENTRIES || uncompressed > MAX_UNCOMPRESSED_BYTES) throw new Error("El archivo Excel supera los límites seguros permitidos.");
  let changed = false;
  for (const [path, entry] of Object.entries(archive.files)) {
    if (entry.dir || !path.startsWith("xl/") || !path.endsWith(".xml")) continue;
    const content = await entry.async("string");
    const prefixes = [...content.matchAll(new RegExp(`xmlns:([A-Za-z_][\\w.-]*)=["']${escapeRegExp(SPREADSHEET_MAIN_NAMESPACE)}["']`, "g"))].map((match) => match[1]);
    if (!prefixes.length) continue;
    let normalized = content;
    for (const prefix of prefixes) normalized = normalized.replace(new RegExp(`<(\\/?)${escapeRegExp(prefix)}:`, "g"), "<$1");
    if (normalized !== content) {
      archive.file(path, normalized);
      changed = true;
    }
  }
  if (!changed) return buffer;
  return Buffer.from(await archive.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } }));
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

function numberValue(cell: Cell, issues: CatalogWorkbookIssue[], sheet: string, row: number, column: string, options: { required?: boolean; min?: number; max?: number; integer?: boolean } = {}) {
  const raw = cellText(cell, issues, sheet, row, column);
  if (!raw && !options.required) return 0;
  const value = Number(raw.replace(",", "."));
  const min = options.min ?? 0;
  const max = options.max ?? 1_000_000_000;
  if (!Number.isFinite(value) || value < min || value > max || (options.integer && !Number.isInteger(value))) {
    issues.push({ sheet, row, column, severity: "ERROR", message: `Debe ser un número${options.integer ? " entero" : ""} entre ${min} y ${max}.` });
    return 0;
  }
  return value;
}

function booleanValue(cell: Cell, issues: CatalogWorkbookIssue[], sheet: string, row: number, column: string, fallback = true) {
  const raw = cellText(cell, issues, sheet, row, column).toLocaleLowerCase("es-PE");
  if (!raw) return fallback;
  if (["sí", "si", "true", "1"].includes(raw)) return true;
  if (["no", "false", "0"].includes(raw)) return false;
  issues.push({ sheet, row, column, severity: "ERROR", message: "Selecciona Sí o No." });
  return fallback;
}

export async function parseRestaurantCatalogWorkbook(buffer: Buffer, expectedTenantId: string, allowedAreas: string[]) {
  const safeBuffer = await prepareSafeWorkbookBuffer(buffer);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(safeBuffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  if (workbook.worksheets.length > 18) throw new Error("El archivo contiene demasiadas hojas.");
  const meta = workbook.getWorksheet("_Control");
  if (!meta || ![RESTAURANT_CATALOG_TEMPLATE_VERSION, LEGACY_RESTAURANT_CATALOG_TEMPLATE_VERSION].includes(meta.getCell("B1").text)) throw new Error("Usa la plantilla de Restaurante descargada desde MOVENDI GO.");
  if (meta.getCell("B2").text !== expectedTenantId) throw new Error("La plantilla pertenece a otro negocio.");
  const categoriesSheet = workbook.getWorksheet("Categorías");
  const productsSheet = workbook.getWorksheet("Productos");
  const addonsSheet = workbook.getWorksheet("Adicionales");
  if (!categoriesSheet || !productsSheet || !addonsSheet) throw new Error("La plantilla está incompleta. No cambies los nombres de las hojas.");

  const issues: CatalogWorkbookIssue[] = [];
  const catalog: CatalogWorkbookDraft = { categories: [], products: [], addons: [] };
  const masterData: RestaurantMasterWorkbookDraft = { users: [], zones: [], customers: [], inventoryItems: [], recipes: [], promotions: [] };
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

  const readOptionalSheet = (name: string) => workbook.getWorksheet(name);
  const teamSheet = readOptionalSheet("Equipo");
  if (teamSheet) {
    const emails = new Map<string, number>();
    for (let row = 5; row <= Math.min(teamSheet.rowCount, 104); row += 1) {
      const name = cellText(teamSheet.getCell(row, 1), issues, "Equipo", row, "A");
      const email = cellText(teamSheet.getCell(row, 2), issues, "Equipo", row, "B").toLowerCase();
      const roleKey = cellText(teamSheet.getCell(row, 3), issues, "Equipo", row, "C").toUpperCase();
      if (!name && !email && !roleKey) continue;
      if (name.length < 2 || name.length > 120) issues.push({ sheet: "Equipo", row, column: "A", severity: "ERROR", message: "El nombre debe tener entre 2 y 120 caracteres." });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) issues.push({ sheet: "Equipo", row, column: "B", severity: "ERROR", message: "Ingresa un correo válido." });
      if (!/^[A-Z0-9_-]{1,80}$/.test(roleKey)) issues.push({ sheet: "Equipo", row, column: "C", severity: "ERROR", message: "Selecciona una clave de rol válida." });
      if (emails.has(email)) issues.push({ sheet: "Equipo", row, column: "B", severity: "ERROR", message: `El correo está repetido con la fila ${emails.get(email)}.` });
      else if (email) emails.set(email, row);
      masterData.users.push({ name, email, roleKey });
    }
  }

  const salonSheet = readOptionalSheet("Salón");
  if (salonSheet) {
    const names = new Map<string, number>();
    for (let row = 5; row <= Math.min(salonSheet.rowCount, 54); row += 1) {
      const name = cellText(salonSheet.getCell(row, 1), issues, "Salón", row, "A");
      const prefix = cellText(salonSheet.getCell(row, 2), issues, "Salón", row, "B");
      if (!name && !prefix && salonSheet.getCell(row, 3).value == null && salonSheet.getCell(row, 4).value == null) continue;
      const count = numberValue(salonSheet.getCell(row, 3), issues, "Salón", row, "C", { required: true, min: 1, max: 200, integer: true });
      const seats = numberValue(salonSheet.getCell(row, 4), issues, "Salón", row, "D", { required: true, min: 1, max: 50, integer: true });
      if (name.length < 2 || name.length > 80) issues.push({ sheet: "Salón", row, column: "A", severity: "ERROR", message: "La zona debe tener entre 2 y 80 caracteres." });
      if (prefix.length < 1 || prefix.length > 20) issues.push({ sheet: "Salón", row, column: "B", severity: "ERROR", message: "El prefijo debe tener entre 1 y 20 caracteres." });
      const key = normalizeRestaurantCatalogLabel(name).key;
      if (names.has(key)) issues.push({ sheet: "Salón", row, column: "A", severity: "ERROR", message: `La zona está repetida con la fila ${names.get(key)}.` });
      else if (key) names.set(key, row);
      masterData.zones.push({ name: normalizeRestaurantCatalogLabel(name).name, prefix, count, seats });
    }
  }

  const customersSheet = readOptionalSheet("Clientes");
  if (customersSheet) {
    const identifiers = new Map<string, number>();
    for (let row = 5; row <= Math.min(customersSheet.rowCount, 504); row += 1) {
      const values = Array.from({ length: 7 }, (_, index) => cellText(customersSheet.getCell(row, index + 1), issues, "Clientes", row, String.fromCharCode(65 + index)));
      if (!values.some(Boolean)) continue;
      const [name, documentTypeRaw, documentNumber, segmentRaw, phone, email, notes] = values;
      const documentType = documentTypeRaw.toUpperCase(); const segment = segmentRaw.toUpperCase();
      if (name.length < 2 || name.length > 120) issues.push({ sheet: "Clientes", row, column: "A", severity: "ERROR", message: "El nombre debe tener entre 2 y 120 caracteres." });
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) issues.push({ sheet: "Clientes", row, column: "F", severity: "ERROR", message: "Ingresa un correo válido." });
      if (notes.length > 500) issues.push({ sheet: "Clientes", row, column: "G", severity: "ERROR", message: "Las observaciones admiten hasta 500 caracteres." });
      const identifier = documentNumber ? `D:${documentNumber}` : phone ? `P:${phone}` : "";
      if (identifier && identifiers.has(identifier)) issues.push({ sheet: "Clientes", row, column: documentNumber ? "C" : "E", severity: "ERROR", message: `El identificador está repetido con la fila ${identifiers.get(identifier)}.` });
      else if (identifier) identifiers.set(identifier, row);
      masterData.customers.push({ name, documentType, documentNumber, segment, phone, email, notes });
    }
  }

  const inventorySheet = readOptionalSheet("Inventario");
  const inventorySkus = new Map<string, number>();
  if (inventorySheet) {
    for (let row = 5; row <= Math.min(inventorySheet.rowCount, 504); row += 1) {
      const sku = cellText(inventorySheet.getCell(row, 1), issues, "Inventario", row, "A").toUpperCase();
      const barcode = cellText(inventorySheet.getCell(row, 2), issues, "Inventario", row, "B");
      const name = cellText(inventorySheet.getCell(row, 3), issues, "Inventario", row, "C");
      const kind = cellText(inventorySheet.getCell(row, 4), issues, "Inventario", row, "D").toUpperCase();
      const unit = cellText(inventorySheet.getCell(row, 5), issues, "Inventario", row, "E").toUpperCase();
      const notes = cellText(inventorySheet.getCell(row, 10), issues, "Inventario", row, "J");
      if (!sku && !name && !kind && !unit) continue;
      const openingStock = numberValue(inventorySheet.getCell(row, 6), issues, "Inventario", row, "F");
      const minimumStock = numberValue(inventorySheet.getCell(row, 7), issues, "Inventario", row, "G");
      const unitCost = moneyValue(inventorySheet.getCell(row, 8), issues, "Inventario", row, "H", false);
      const trackStock = booleanValue(inventorySheet.getCell(row, 9), issues, "Inventario", row, "I");
      if (!/^[A-Z0-9._-]{2,40}$/.test(sku)) issues.push({ sheet: "Inventario", row, column: "A", severity: "ERROR", message: "El SKU debe tener 2 a 40 caracteres: letras, números, punto, guion o guion bajo." });
      if (name.length < 2 || name.length > 160) issues.push({ sheet: "Inventario", row, column: "C", severity: "ERROR", message: "El insumo debe tener entre 2 y 160 caracteres." });
      if (!["PRODUCT", "INPUT", "MATERIAL", "SUPPLY", "PART"].includes(kind)) issues.push({ sheet: "Inventario", row, column: "D", severity: "ERROR", message: "Selecciona un tipo de inventario válido." });
      if (!unit || unit.length > 20) issues.push({ sheet: "Inventario", row, column: "E", severity: "ERROR", message: "Selecciona una unidad válida." });
      if (inventorySkus.has(sku)) issues.push({ sheet: "Inventario", row, column: "A", severity: "ERROR", message: `El SKU está repetido con la fila ${inventorySkus.get(sku)}.` });
      else if (sku) inventorySkus.set(sku, row);
      masterData.inventoryItems.push({ sku, barcode, name, kind, unit, openingStock, minimumStock, unitCost, trackStock, notes });
    }
  }

  const recipesSheet = readOptionalSheet("Recetas");
  if (recipesSheet) {
    const pairs = new Map<string, number>();
    for (let row = 5; row <= Math.min(recipesSheet.rowCount, 1004); row += 1) {
      const product = cellText(recipesSheet.getCell(row, 1), issues, "Recetas", row, "A");
      const ingredientSku = cellText(recipesSheet.getCell(row, 3), issues, "Recetas", row, "C").toUpperCase();
      if (!product && !ingredientSku) continue;
      const yieldQuantity = numberValue(recipesSheet.getCell(row, 2), issues, "Recetas", row, "B", { required: true, min: 0.000001 });
      const quantity = numberValue(recipesSheet.getCell(row, 4), issues, "Recetas", row, "D", { required: true, min: 0.000001 });
      const wastePercent = numberValue(recipesSheet.getCell(row, 5), issues, "Recetas", row, "E", { min: 0, max: 100 });
      const productKey = normalizeRestaurantCatalogLabel(product).key;
      if (!catalog.products.some((item) => normalizeRestaurantCatalogLabel(item.name).key === productKey)) issues.push({ sheet: "Recetas", row, column: "A", severity: "ERROR", message: "Selecciona un producto de la hoja Productos." });
      if (!inventorySkus.has(ingredientSku)) issues.push({ sheet: "Recetas", row, column: "C", severity: "ERROR", message: "Selecciona un SKU de la hoja Inventario." });
      const pair = `${productKey}:${ingredientSku}`;
      if (pairs.has(pair)) issues.push({ sheet: "Recetas", row, column: "C", severity: "ERROR", message: `El ingrediente está repetido para este producto en la fila ${pairs.get(pair)}.` });
      else pairs.set(pair, row);
      masterData.recipes.push({ product: catalog.products.find((item) => normalizeRestaurantCatalogLabel(item.name).key === productKey)?.name ?? product, yieldQuantity, ingredientSku, quantity, wastePercent });
    }
  }

  const promotionsSheet = readOptionalSheet("Promociones");
  if (promotionsSheet) {
    const codes = new Map<string, number>();
    for (let row = 5; row <= Math.min(promotionsSheet.rowCount, 204); row += 1) {
      const name = cellText(promotionsSheet.getCell(row, 1), issues, "Promociones", row, "A");
      const code = cellText(promotionsSheet.getCell(row, 2), issues, "Promociones", row, "B").toUpperCase();
      const kind = cellText(promotionsSheet.getCell(row, 3), issues, "Promociones", row, "C").toUpperCase();
      const scope = cellText(promotionsSheet.getCell(row, 7), issues, "Promociones", row, "G").toUpperCase();
      const target = cellText(promotionsSheet.getCell(row, 8), issues, "Promociones", row, "H");
      const weekdays = cellText(promotionsSheet.getCell(row, 12), issues, "Promociones", row, "L") || "0,1,2,3,4,5,6";
      const startTime = cellText(promotionsSheet.getCell(row, 13), issues, "Promociones", row, "M");
      const endTime = cellText(promotionsSheet.getCell(row, 14), issues, "Promociones", row, "N");
      if (!name && !code && !kind && !scope) continue;
      const value = numberValue(promotionsSheet.getCell(row, 4), issues, "Promociones", row, "D", { required: true, min: 0.01, max: 100000 });
      const buyQuantity = numberValue(promotionsSheet.getCell(row, 5), issues, "Promociones", row, "E", { min: 2, max: 100, integer: true }) || 2;
      const freeQuantity = numberValue(promotionsSheet.getCell(row, 6), issues, "Promociones", row, "F", { min: 1, max: 99, integer: true }) || 1;
      const minSubtotal = moneyValue(promotionsSheet.getCell(row, 9), issues, "Promociones", row, "I", false);
      const maxDiscount = moneyValue(promotionsSheet.getCell(row, 10), issues, "Promociones", row, "J", false);
      const automatic = booleanValue(promotionsSheet.getCell(row, 11), issues, "Promociones", row, "K");
      if (name.length < 2 || name.length > 120) issues.push({ sheet: "Promociones", row, column: "A", severity: "ERROR", message: "El nombre debe tener entre 2 y 120 caracteres." });
      if (code && !/^[A-Z0-9_-]{3,40}$/.test(code)) issues.push({ sheet: "Promociones", row, column: "B", severity: "ERROR", message: "El código debe tener 3 a 40 letras, números, guiones o guion bajo." });
      if (code && codes.has(code)) issues.push({ sheet: "Promociones", row, column: "B", severity: "ERROR", message: `El código está repetido con la fila ${codes.get(code)}.` }); else if (code) codes.set(code, row);
      if (scope === "CATEGORY" && !categoryMap.has(normalizeRestaurantCatalogLabel(target).key)) issues.push({ sheet: "Promociones", row, column: "H", severity: "ERROR", message: "Selecciona una categoría de la carta." });
      if (scope === "PRODUCT" && !catalog.products.some((item) => normalizeRestaurantCatalogLabel(item.name).key === normalizeRestaurantCatalogLabel(target).key)) issues.push({ sheet: "Promociones", row, column: "H", severity: "ERROR", message: "Selecciona un producto de la carta." });
      if (kind === "QUANTITY" && freeQuantity >= buyQuantity) issues.push({ sheet: "Promociones", row, column: "F", severity: "ERROR", message: "Las unidades gratuitas deben ser menores que las unidades de compra." });
      if (!/^[0-6](,[0-6])*$/.test(weekdays)) issues.push({ sheet: "Promociones", row, column: "L", severity: "ERROR", message: "Usa días separados por coma, de 0 a 6." });
      if (startTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) issues.push({ sheet: "Promociones", row, column: "M", severity: "ERROR", message: "Usa hora HH:mm." });
      if (endTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)) issues.push({ sheet: "Promociones", row, column: "N", severity: "ERROR", message: "Usa hora HH:mm." });
      masterData.promotions.push({ name, code, kind, value, buyQuantity, freeQuantity, scope, target, minSubtotal, maxDiscount, automatic, weekdays, startTime, endTime });
    }
  }

  if (!catalog.categories.length) issues.push({ sheet: "Categorías", row: 5, column: "A", severity: "ERROR", message: "Agrega al menos una categoría." });
  if (!catalog.products.length) issues.push({ sheet: "Productos", row: 5, column: "A", severity: "ERROR", message: "Agrega al menos un producto." });
  const errors = issues.filter((issue) => issue.severity === "ERROR").length;
  return { valid: errors === 0, catalog, masterData, issues: issues.slice(0, 200), summary: { categories: catalog.categories.length, products: catalog.products.length, addons: catalog.addons.length, users: masterData.users.length, zones: masterData.zones.length, customers: masterData.customers.length, inventoryItems: masterData.inventoryItems.length, recipes: masterData.recipes.length, promotions: masterData.promotions.length, errors, warnings: issues.filter((issue) => issue.severity === "WARNING").length } };
}
