import "server-only";

import ExcelJS, { ValueType, type Cell, type Worksheet } from "exceljs";
import JSZip from "jszip";

export const TRANSPORT_MASTER_TEMPLATE_VERSION = "MOVENDI_TRANSPORT_MASTER_V1";
const MAX_UNCOMPRESSED_BYTES = 24 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 500;

export type TransportWorkbookIssue = { sheet: string; row: number; column: string; message: string; severity: "ERROR" | "WARNING" };
export type TransportMasterWorkbookDraft = {
  users: Array<{ name: string; email: string; roleKey: string }>;
  parties: Array<{ kind: string; documentType: "RUC" | "DNI" | "CE" | "OTHER"; documentNo: string; legalName: string; tradeName: string; contactName: string; phone: string; email: string; address: string }>;
  locations: Array<{ code: string; name: string; address: string; district: string; province: string; department: string; latitude: number | null; longitude: number | null }>;
  routes: Array<{ code: string; name: string; originCode: string; destinationCode: string; distanceKm: number; estimatedMinutes: number; tollEstimate: number; baseFreight: number }>;
  vehicles: Array<{ plate: string; brand: string; model: string; year: number; type: string; capacityKg: number | null; odometerKm: number; status: string; technicalDueAt: string; soatDueAt: string; gpsDeviceId: string }>;
  trailers: Array<{ plate: string; brand: string; model: string; type: string; capacityKg: number | null; status: string }>;
  drivers: Array<{ documentNo: string; firstName: string; lastName: string; type: string; phone: string; email: string; licenseNo: string; licenseClass: string; licenseDueAt: string; hireDate: string; workRegimeKey: string; workCycleAnchor: string; status: string }>;
};

export type TransportWorkbookSource = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  masterData: TransportMasterWorkbookDraft;
  lists: { roles: Array<{ key: string; name: string }>; partyTypes: string[]; vehicleTypes: string[]; trailerTypes: string[]; vehicleStatuses: string[]; driverTypes: string[]; driverStatuses: string[]; licenseClasses: string[]; workRegimes: string[] };
};

const colors = { navy: "17365D", blue: "1D70D6", pale: "FFFDF4", border: "D9E2EC", muted: "60758A", white: "FFFFFF" };
const sheetLimits: Record<keyof TransportMasterWorkbookDraft, number> = { users: 100, parties: 500, locations: 500, routes: 1_000, vehicles: 500, trailers: 500, drivers: 500 };

function styleInputSheet(sheet: Worksheet, title: string, description: string, headers: string[], widths: number[], maxRows: number) {
  sheet.views = [{ state: "frozen", ySplit: 4, showGridLines: false }];
  sheet.mergeCells(1, 1, 1, headers.length);
  sheet.getCell("A1").value = title;
  sheet.getCell("A1").font = { bold: true, size: 16, color: { argb: colors.white } };
  sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.navy } };
  sheet.getRow(1).height = 30;
  sheet.mergeCells(2, 1, 2, headers.length);
  sheet.getCell("A2").value = description;
  sheet.getCell("A2").font = { italic: true, color: { argb: colors.muted } };
  sheet.getCell("A2").alignment = { wrapText: true };
  sheet.getRow(2).height = 30;
  sheet.getRow(4).values = headers;
  sheet.getRow(4).eachCell((cell) => { cell.font = { bold: true, color: { argb: colors.white } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.blue } }; cell.alignment = { wrapText: true }; });
  sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: headers.length } };
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  for (let row = 5; row <= maxRows + 4; row += 1) for (let column = 1; column <= headers.length; column += 1) {
    const cell = sheet.getCell(row, column);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.pale } };
    cell.border = { bottom: { style: "hair", color: { argb: colors.border } } };
    cell.alignment = { vertical: "middle", wrapText: true };
  }
}

function listValidation(name: string) {
  return { type: "list" as const, allowBlank: false, formulae: [name], showErrorMessage: true, errorStyle: "stop" as const, errorTitle: "Selecciona una opción válida", error: "Usa una opción de la lista de MOVENDI GO." };
}

function writeRows(sheet: Worksheet, rows: Array<Array<string | number | null>>) {
  rows.forEach((values, index) => { sheet.getRow(index + 5).values = values; });
}

export async function buildTransportMasterWorkbook(source: TransportWorkbookSource) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MOVENDI GO";
  workbook.lastModifiedBy = "MOVENDI GO";
  workbook.company = "MOVENDI GO";
  workbook.title = `Plantilla maestra de transporte · ${source.tenantName}`;
  workbook.subject = "Carga validada de clientes, ubicaciones, rutas, flota, conductores y usuarios";
  workbook.created = new Date();
  workbook.modified = new Date();

  const instructions = workbook.addWorksheet("Instrucciones");
  instructions.views = [{ showGridLines: false }];
  instructions.columns = [{ width: 6 }, { width: 34 }, { width: 92 }];
  instructions.mergeCells("A1:C1");
  instructions.getCell("A1").value = `Carga maestra de transporte · ${source.tenantName}`;
  instructions.getCell("A1").font = { bold: true, size: 18, color: { argb: colors.white } };
  instructions.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.navy } };
  instructions.getRow(3).values = ["Paso", "Hoja", "Qué completar"];
  instructions.getRow(3).eachCell((cell) => { cell.font = { bold: true, color: { argb: colors.white } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.blue } }; });
  [
    [1, "Clientes", "Clientes, proveedores y transportistas. Los tipos salen de la configuración guardada."],
    [2, "Ubicaciones y Rutas", "Crea primero las ubicaciones. En Rutas selecciona los códigos de origen y destino del mismo archivo."],
    [3, "Vehículos y Carretas", "Usa las placas sin espacios y selecciona tipos y estados de las listas."],
    [4, "Conductores", "Completa licencias, vencimientos y régimen de trabajo."],
    [5, "Usuarios", "Opcional. Los usuarios aparecerán en el paso Usuarios y roles antes de ser creados."],
    [6, "Subir", "Nada se guarda al subir. Revisa los resúmenes y confirma cada paso del asistente."],
  ].forEach((values, index) => { instructions.getRow(index + 4).values = values; instructions.getRow(index + 4).eachCell((cell) => { cell.alignment = { vertical: "top", wrapText: true }; }); });
  instructions.mergeCells("A11:C11");
  instructions.getCell("A11").value = "No cambies nombres de hojas ni encabezados. No uses fórmulas, macros o enlaces externos.";
  instructions.getCell("A11").font = { bold: true, color: { argb: "9A6700" } };

  const users = workbook.addWorksheet("Usuarios");
  styleInputSheet(users, "Usuarios iniciales", "Opcional. Usa un rol disponible; la contraseña temporal se generará al guardar el paso Usuarios y roles.", ["Nombre*", "Correo*", "Rol*"], [32, 38, 24], sheetLimits.users);
  writeRows(users, source.masterData.users.map((item) => [item.name, item.email, item.roleKey]));

  const parties = workbook.addWorksheet("Clientes");
  styleInputSheet(parties, "Clientes y empresas vinculadas", "Incluye clientes, proveedores y transportistas. Documento + tipo identifican una fila de forma única.", ["Tipo*", "Tipo documento*", "Número documento*", "Razón social*", "Nombre comercial", "Contacto", "Teléfono", "Correo", "Dirección"], [22, 20, 22, 38, 30, 28, 18, 34, 46], sheetLimits.parties);
  writeRows(parties, source.masterData.parties.map((item) => [item.kind, item.documentType, item.documentNo, item.legalName, item.tradeName, item.contactName, item.phone, item.email, item.address]));

  const locations = workbook.addWorksheet("Ubicaciones");
  styleInputSheet(locations, "Plantas, almacenes y destinos", "El código se usa para conectar las rutas. Debe ser único dentro de la empresa.", ["Código*", "Nombre*", "Dirección", "Distrito", "Provincia", "Departamento", "Latitud", "Longitud"], [20, 36, 46, 24, 24, 24, 16, 16], sheetLimits.locations);
  writeRows(locations, source.masterData.locations.map((item) => [item.code, item.name, item.address, item.district, item.province, item.department, item.latitude, item.longitude]));

  const routes = workbook.addWorksheet("Rutas");
  styleInputSheet(routes, "Rutas frecuentes", "Origen y destino deben usar códigos de la hoja Ubicaciones. Importes expresados en la moneda del negocio.", ["Código*", "Nombre*", "Origen*", "Destino*", "Distancia km*", "Duración min*", "Peajes", "Flete base"], [18, 38, 20, 20, 16, 16, 16, 18], sheetLimits.routes);
  writeRows(routes, source.masterData.routes.map((item) => [item.code, item.name, item.originCode, item.destinationCode, item.distanceKm, item.estimatedMinutes, item.tollEstimate, item.baseFreight]));

  const vehicles = workbook.addWorksheet("Vehículos");
  styleInputSheet(vehicles, "Vehículos y tractos", "Las fechas deben usar AAAA-MM-DD. Los códigos de tipo y estado se seleccionan de la configuración.", ["Placa*", "Marca*", "Modelo*", "Año*", "Tipo*", "Capacidad kg", "Odómetro km*", "Estado*", "Revisión técnica", "SOAT", "Dispositivo GPS"], [16, 20, 22, 12, 22, 18, 18, 22, 20, 20, 22], sheetLimits.vehicles);
  writeRows(vehicles, source.masterData.vehicles.map((item) => [item.plate, item.brand, item.model, item.year, item.type, item.capacityKg, item.odometerKm, item.status, item.technicalDueAt, item.soatDueAt, item.gpsDeviceId]));

  const trailers = workbook.addWorksheet("Carretas");
  styleInputSheet(trailers, "Carretas y remolques", "Registra carretas, plataformas, cisternas y configuraciones de bitren.", ["Placa*", "Marca", "Modelo", "Tipo*", "Capacidad kg", "Estado*"], [16, 20, 22, 24, 18, 22], sheetLimits.trailers);
  writeRows(trailers, source.masterData.trailers.map((item) => [item.plate, item.brand, item.model, item.type, item.capacityKg, item.status]));

  const drivers = workbook.addWorksheet("Conductores");
  styleInputSheet(drivers, "Conductores y licencias", "Las fechas deben usar AAAA-MM-DD. El ancla del régimen indica desde qué fecha inicia el ciclo de trabajo.", ["Documento*", "Nombres*", "Apellidos*", "Tipo*", "Teléfono", "Correo", "Licencia*", "Clase*", "Vence licencia*", "Fecha ingreso", "Régimen*", "Inicio ciclo*", "Estado*"], [18, 24, 30, 20, 18, 32, 20, 18, 20, 18, 18, 20, 22], sheetLimits.drivers);
  writeRows(drivers, source.masterData.drivers.map((item) => [item.documentNo, item.firstName, item.lastName, item.type, item.phone, item.email, item.licenseNo, item.licenseClass, item.licenseDueAt, item.hireDate, item.workRegimeKey, item.workCycleAnchor, item.status]));

  const lists = workbook.addWorksheet("_Listas");
  lists.state = "veryHidden";
  const listEntries: Array<[string, string[]]> = [
    ["Roles", source.lists.roles.map((item) => item.key)], ["TiposCuenta", source.lists.partyTypes], ["Documentos", ["RUC", "DNI", "CE", "OTHER"]], ["TiposVehiculo", source.lists.vehicleTypes], ["TiposCarreta", source.lists.trailerTypes], ["EstadosFlota", source.lists.vehicleStatuses], ["TiposConductor", source.lists.driverTypes], ["EstadosConductor", source.lists.driverStatuses], ["Licencias", source.lists.licenseClasses], ["Regimenes", source.lists.workRegimes],
  ];
  listEntries.forEach(([name, values], columnIndex) => {
    lists.getCell(1, columnIndex + 1).value = name;
    values.forEach((value, rowIndex) => { lists.getCell(rowIndex + 2, columnIndex + 1).value = value; });
    const letter = lists.getColumn(columnIndex + 1).letter;
    workbook.definedNames.add(`'_Listas'!$${letter}$2:$${letter}$${Math.max(2, values.length + 1)}`, name);
  });
  workbook.definedNames.add(`'Ubicaciones'!$A$5:$A$${sheetLimits.locations + 4}`, "CodigosUbicacion");

  const control = workbook.addWorksheet("_Control");
  control.state = "veryHidden";
  control.getRow(1).values = ["FORMATO", TRANSPORT_MASTER_TEMPLATE_VERSION];
  control.getRow(2).values = ["EMPRESA_ID", source.tenantId];
  control.getRow(3).values = ["EMPRESA", source.tenantName];
  control.getRow(4).values = ["GENERADO_EN", new Date().toISOString()];

  for (let row = 5; row <= sheetLimits.users + 4; row += 1) users.getCell(row, 3).dataValidation = listValidation("Roles");
  for (let row = 5; row <= sheetLimits.parties + 4; row += 1) { parties.getCell(row, 1).dataValidation = listValidation("TiposCuenta"); parties.getCell(row, 2).dataValidation = listValidation("Documentos"); }
  for (let row = 5; row <= sheetLimits.routes + 4; row += 1) { routes.getCell(row, 3).dataValidation = listValidation("CodigosUbicacion"); routes.getCell(row, 4).dataValidation = listValidation("CodigosUbicacion"); }
  for (let row = 5; row <= sheetLimits.vehicles + 4; row += 1) { vehicles.getCell(row, 5).dataValidation = listValidation("TiposVehiculo"); vehicles.getCell(row, 8).dataValidation = listValidation("EstadosFlota"); }
  for (let row = 5; row <= sheetLimits.trailers + 4; row += 1) { trailers.getCell(row, 4).dataValidation = listValidation("TiposCarreta"); trailers.getCell(row, 6).dataValidation = listValidation("EstadosFlota"); }
  for (let row = 5; row <= sheetLimits.drivers + 4; row += 1) { drivers.getCell(row, 4).dataValidation = listValidation("TiposConductor"); drivers.getCell(row, 8).dataValidation = listValidation("Licencias"); drivers.getCell(row, 11).dataValidation = listValidation("Regimenes"); drivers.getCell(row, 13).dataValidation = listValidation("EstadosConductor"); }
  [routes.getColumn(7), routes.getColumn(8)].forEach((column) => { column.numFmt = "#,##0.00"; });
  [vehicles.getColumn(9), vehicles.getColumn(10), drivers.getColumn(9), drivers.getColumn(10), drivers.getColumn(12)].forEach((column) => { column.numFmt = "yyyy-mm-dd"; });

  return Buffer.from(await workbook.xlsx.writeBuffer({ useStyles: true, useSharedStrings: true }));
}

async function safeWorkbookBuffer(buffer: Buffer) {
  const archive = await JSZip.loadAsync(buffer, { checkCRC32: false });
  let entries = 0;
  let uncompressed = 0;
  archive.forEach((_path, entry) => { entries += 1; uncompressed += (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0; });
  if (entries > MAX_ARCHIVE_ENTRIES || uncompressed > MAX_UNCOMPRESSED_BYTES) throw new Error("El archivo Excel supera los límites seguros permitidos.");
  return buffer;
}

function textValue(cell: Cell, issues: TransportWorkbookIssue[], sheet: string, row: number, column: string) {
  if (cell.type === ValueType.Formula) { issues.push({ sheet, row, column, severity: "ERROR", message: "No se permiten fórmulas." }); return ""; }
  if (cell.value instanceof Date) return cell.value.toISOString().slice(0, 10);
  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (typeof value === "object" && "text" in value && typeof value.text === "string") return value.text.trim();
  if (typeof value === "object" && "richText" in value && Array.isArray(value.richText)) return value.richText.map((item) => item.text).join("").trim();
  return String(cell.text ?? "").trim();
}

function requiredText(cell: Cell, issues: TransportWorkbookIssue[], sheet: string, row: number, column: string, min = 1, max = 160) {
  const value = textValue(cell, issues, sheet, row, column);
  if (value.length < min || value.length > max) issues.push({ sheet, row, column, severity: "ERROR", message: `Debe tener entre ${min} y ${max} caracteres.` });
  return value;
}

function numberValue(cell: Cell, issues: TransportWorkbookIssue[], sheet: string, row: number, column: string, options: { required?: boolean; min?: number; max?: number; integer?: boolean; nullable?: boolean } = {}) {
  const raw = textValue(cell, issues, sheet, row, column);
  if (!raw && options.nullable) return null;
  if (!raw && !options.required) return 0;
  const value = Number(raw.replace(",", "."));
  const min = options.min ?? 0;
  const max = options.max ?? 1_000_000_000;
  if (!Number.isFinite(value) || value < min || value > max || (options.integer && !Number.isInteger(value))) { issues.push({ sheet, row, column, severity: "ERROR", message: `Debe ser un número${options.integer ? " entero" : ""} entre ${min} y ${max}.` }); return options.nullable ? null : 0; }
  return value;
}

function dateValue(cell: Cell, issues: TransportWorkbookIssue[], sheet: string, row: number, column: string, required: boolean) {
  const raw = textValue(cell, issues, sheet, row, column);
  if (!raw && !required) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(new Date(`${raw}T00:00:00Z`).getTime())) { issues.push({ sheet, row, column, severity: "ERROR", message: "Usa una fecha válida con formato AAAA-MM-DD." }); return ""; }
  return raw;
}

function configuredValue(cell: Cell, allowed: Set<string>, issues: TransportWorkbookIssue[], sheet: string, row: number, column: string) {
  const value = requiredText(cell, issues, sheet, row, column).toUpperCase();
  if (value && !allowed.has(value)) issues.push({ sheet, row, column, severity: "ERROR", message: `El valor ${value} no está disponible en la configuración.` });
  return value;
}

function duplicateIssue(value: string, seen: Set<string>, issues: TransportWorkbookIssue[], sheet: string, row: number, column: string) {
  if (seen.has(value)) issues.push({ sheet, row, column, severity: "ERROR", message: `El valor ${value} está repetido.` });
  seen.add(value);
}

export async function parseTransportMasterWorkbook(buffer: Buffer, expectedTenantId: string, lists: TransportWorkbookSource["lists"]) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await safeWorkbookBuffer(buffer) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  if (workbook.worksheets.length > 12) throw new Error("El archivo contiene demasiadas hojas.");
  const control = workbook.getWorksheet("_Control");
  if (!control || control.getCell("B1").text !== TRANSPORT_MASTER_TEMPLATE_VERSION) throw new Error("Usa la plantilla de Transporte descargada desde MOVENDI GO.");
  if (control.getCell("B2").text !== expectedTenantId) throw new Error("La plantilla pertenece a otro negocio.");
  const sheets = { users: workbook.getWorksheet("Usuarios"), parties: workbook.getWorksheet("Clientes"), locations: workbook.getWorksheet("Ubicaciones"), routes: workbook.getWorksheet("Rutas"), vehicles: workbook.getWorksheet("Vehículos"), trailers: workbook.getWorksheet("Carretas"), drivers: workbook.getWorksheet("Conductores") };
  if (Object.values(sheets).some((sheet) => !sheet)) throw new Error("La plantilla está incompleta. No cambies los nombres de las hojas.");
  const issues: TransportWorkbookIssue[] = [];
  const result: TransportMasterWorkbookDraft = { users: [], parties: [], locations: [], routes: [], vehicles: [], trailers: [], drivers: [] };
  const allowed = { roles: new Set(lists.roles.map((item) => item.key)), partyTypes: new Set(lists.partyTypes), vehicleTypes: new Set(lists.vehicleTypes), trailerTypes: new Set(lists.trailerTypes), vehicleStatuses: new Set(lists.vehicleStatuses), driverTypes: new Set(lists.driverTypes), driverStatuses: new Set(lists.driverStatuses), licenseClasses: new Set(lists.licenseClasses), workRegimes: new Set(lists.workRegimes) };
  const documentTypes = new Set(["RUC", "DNI", "CE", "OTHER"]);
  const seen = { users: new Set<string>(), parties: new Set<string>(), locations: new Set<string>(), routes: new Set<string>(), vehicles: new Set<string>(), trailers: new Set<string>(), drivers: new Set<string>(), licenses: new Set<string>() };

  const rows = (sheet: Worksheet, limit: number) => Array.from({ length: Math.min(limit, Math.max(0, sheet.rowCount - 4)) }, (_, index) => index + 5);
  for (const row of rows(sheets.users!, sheetLimits.users)) {
    if (![1, 2, 3].some((column) => textValue(sheets.users!.getCell(row, column), issues, "Usuarios", row, String.fromCharCode(64 + column)))) continue;
    const before = issues.length;
    const name = requiredText(sheets.users!.getCell(row, 1), issues, "Usuarios", row, "A", 2, 120);
    const email = requiredText(sheets.users!.getCell(row, 2), issues, "Usuarios", row, "B", 5, 160).toLowerCase();
    if (email && !zEmail(email)) issues.push({ sheet: "Usuarios", row, column: "B", severity: "ERROR", message: "Ingresa un correo válido." });
    const roleKey = configuredValue(sheets.users!.getCell(row, 3), allowed.roles, issues, "Usuarios", row, "C");
    duplicateIssue(email, seen.users, issues, "Usuarios", row, "B");
    if (issues.length === before) result.users.push({ name, email, roleKey });
  }
  for (const row of rows(sheets.parties!, sheetLimits.parties)) {
    if (![1, 2, 3, 4].some((column) => textValue(sheets.parties!.getCell(row, column), issues, "Clientes", row, String.fromCharCode(64 + column)))) continue;
    const before = issues.length;
    const kind = configuredValue(sheets.parties!.getCell(row, 1), allowed.partyTypes, issues, "Clientes", row, "A");
    const documentType = configuredValue(sheets.parties!.getCell(row, 2), documentTypes, issues, "Clientes", row, "B") as "RUC" | "DNI" | "CE" | "OTHER";
    const documentNo = requiredText(sheets.parties!.getCell(row, 3), issues, "Clientes", row, "C", 8, 20);
    const legalName = requiredText(sheets.parties!.getCell(row, 4), issues, "Clientes", row, "D", 2, 160);
    const email = textValue(sheets.parties!.getCell(row, 8), issues, "Clientes", row, "H").toLowerCase();
    if (email && !zEmail(email)) issues.push({ sheet: "Clientes", row, column: "H", severity: "ERROR", message: "Ingresa un correo válido." });
    duplicateIssue(`${kind}:${documentNo}`, seen.parties, issues, "Clientes", row, "C");
    if (issues.length === before) result.parties.push({ kind, documentType, documentNo, legalName, tradeName: textValue(sheets.parties!.getCell(row, 5), issues, "Clientes", row, "E"), contactName: textValue(sheets.parties!.getCell(row, 6), issues, "Clientes", row, "F"), phone: textValue(sheets.parties!.getCell(row, 7), issues, "Clientes", row, "G"), email, address: textValue(sheets.parties!.getCell(row, 9), issues, "Clientes", row, "I") });
  }
  for (const row of rows(sheets.locations!, sheetLimits.locations)) {
    if (![1, 2].some((column) => textValue(sheets.locations!.getCell(row, column), issues, "Ubicaciones", row, String.fromCharCode(64 + column)))) continue;
    const before = issues.length;
    const code = requiredText(sheets.locations!.getCell(row, 1), issues, "Ubicaciones", row, "A", 2, 20).toUpperCase();
    if (code && !/^[A-Z0-9_-]+$/.test(code)) issues.push({ sheet: "Ubicaciones", row, column: "A", severity: "ERROR", message: "Usa letras, números, guion o guion bajo." });
    const name = requiredText(sheets.locations!.getCell(row, 2), issues, "Ubicaciones", row, "B", 2, 120);
    duplicateIssue(code, seen.locations, issues, "Ubicaciones", row, "A");
    if (issues.length === before) result.locations.push({ code, name, address: textValue(sheets.locations!.getCell(row, 3), issues, "Ubicaciones", row, "C"), district: textValue(sheets.locations!.getCell(row, 4), issues, "Ubicaciones", row, "D"), province: textValue(sheets.locations!.getCell(row, 5), issues, "Ubicaciones", row, "E"), department: textValue(sheets.locations!.getCell(row, 6), issues, "Ubicaciones", row, "F"), latitude: numberValue(sheets.locations!.getCell(row, 7), issues, "Ubicaciones", row, "G", { min: -90, max: 90, nullable: true }) as number | null, longitude: numberValue(sheets.locations!.getCell(row, 8), issues, "Ubicaciones", row, "H", { min: -180, max: 180, nullable: true }) as number | null });
  }
  const locationCodes = new Set(result.locations.map((item) => item.code));
  for (const row of rows(sheets.routes!, sheetLimits.routes)) {
    if (![1, 2, 3, 4].some((column) => textValue(sheets.routes!.getCell(row, column), issues, "Rutas", row, String.fromCharCode(64 + column)))) continue;
    const before = issues.length;
    const code = requiredText(sheets.routes!.getCell(row, 1), issues, "Rutas", row, "A", 2, 20).toUpperCase();
    const name = requiredText(sheets.routes!.getCell(row, 2), issues, "Rutas", row, "B", 2, 140);
    const originCode = requiredText(sheets.routes!.getCell(row, 3), issues, "Rutas", row, "C", 2, 20).toUpperCase();
    const destinationCode = requiredText(sheets.routes!.getCell(row, 4), issues, "Rutas", row, "D", 2, 20).toUpperCase();
    if (!locationCodes.has(originCode)) issues.push({ sheet: "Rutas", row, column: "C", severity: "ERROR", message: "El origen no existe en la hoja Ubicaciones." });
    if (!locationCodes.has(destinationCode)) issues.push({ sheet: "Rutas", row, column: "D", severity: "ERROR", message: "El destino no existe en la hoja Ubicaciones." });
    if (originCode && originCode === destinationCode) issues.push({ sheet: "Rutas", row, column: "D", severity: "ERROR", message: "Origen y destino deben ser diferentes." });
    duplicateIssue(code, seen.routes, issues, "Rutas", row, "A");
    if (issues.length === before) result.routes.push({ code, name, originCode, destinationCode, distanceKm: numberValue(sheets.routes!.getCell(row, 5), issues, "Rutas", row, "E", { required: true, min: 0.1, max: 20_000 }) as number, estimatedMinutes: numberValue(sheets.routes!.getCell(row, 6), issues, "Rutas", row, "F", { required: true, min: 1, max: 43_200, integer: true }) as number, tollEstimate: numberValue(sheets.routes!.getCell(row, 7), issues, "Rutas", row, "G", { min: 0, max: 100_000_000 }) as number, baseFreight: numberValue(sheets.routes!.getCell(row, 8), issues, "Rutas", row, "H", { min: 0, max: 100_000_000 }) as number });
  }
  for (const row of rows(sheets.vehicles!, sheetLimits.vehicles)) {
    if (![1, 2, 3, 4, 5].some((column) => textValue(sheets.vehicles!.getCell(row, column), issues, "Vehículos", row, String.fromCharCode(64 + column)))) continue;
    const before = issues.length;
    const plate = requiredText(sheets.vehicles!.getCell(row, 1), issues, "Vehículos", row, "A", 5, 10).toUpperCase();
    if (plate && !/^[A-Z0-9-]+$/.test(plate)) issues.push({ sheet: "Vehículos", row, column: "A", severity: "ERROR", message: "La placa solo admite letras, números y guiones." });
    duplicateIssue(plate, seen.vehicles, issues, "Vehículos", row, "A");
    const item = { plate, brand: requiredText(sheets.vehicles!.getCell(row, 2), issues, "Vehículos", row, "B", 2, 60), model: requiredText(sheets.vehicles!.getCell(row, 3), issues, "Vehículos", row, "C", 1, 60), year: numberValue(sheets.vehicles!.getCell(row, 4), issues, "Vehículos", row, "D", { required: true, min: 1980, max: new Date().getFullYear() + 1, integer: true }) as number, type: configuredValue(sheets.vehicles!.getCell(row, 5), allowed.vehicleTypes, issues, "Vehículos", row, "E"), capacityKg: numberValue(sheets.vehicles!.getCell(row, 6), issues, "Vehículos", row, "F", { min: 0.1, max: 200_000, nullable: true }) as number | null, odometerKm: numberValue(sheets.vehicles!.getCell(row, 7), issues, "Vehículos", row, "G", { required: true, min: 0, max: 10_000_000 }) as number, status: configuredValue(sheets.vehicles!.getCell(row, 8), allowed.vehicleStatuses, issues, "Vehículos", row, "H"), technicalDueAt: dateValue(sheets.vehicles!.getCell(row, 9), issues, "Vehículos", row, "I", false), soatDueAt: dateValue(sheets.vehicles!.getCell(row, 10), issues, "Vehículos", row, "J", false), gpsDeviceId: textValue(sheets.vehicles!.getCell(row, 11), issues, "Vehículos", row, "K") };
    if (issues.length === before) result.vehicles.push(item);
  }
  for (const row of rows(sheets.trailers!, sheetLimits.trailers)) {
    if (![1, 4].some((column) => textValue(sheets.trailers!.getCell(row, column), issues, "Carretas", row, String.fromCharCode(64 + column)))) continue;
    const before = issues.length;
    const plate = requiredText(sheets.trailers!.getCell(row, 1), issues, "Carretas", row, "A", 5, 10).toUpperCase();
    duplicateIssue(plate, seen.trailers, issues, "Carretas", row, "A");
    const item = { plate, brand: textValue(sheets.trailers!.getCell(row, 2), issues, "Carretas", row, "B"), model: textValue(sheets.trailers!.getCell(row, 3), issues, "Carretas", row, "C"), type: configuredValue(sheets.trailers!.getCell(row, 4), allowed.trailerTypes, issues, "Carretas", row, "D"), capacityKg: numberValue(sheets.trailers!.getCell(row, 5), issues, "Carretas", row, "E", { min: 0.1, max: 200_000, nullable: true }) as number | null, status: configuredValue(sheets.trailers!.getCell(row, 6), allowed.vehicleStatuses, issues, "Carretas", row, "F") };
    if (issues.length === before) result.trailers.push(item);
  }
  for (const row of rows(sheets.drivers!, sheetLimits.drivers)) {
    if (![1, 2, 3, 7, 8, 9, 11, 12, 13].some((column) => textValue(sheets.drivers!.getCell(row, column), issues, "Conductores", row, column <= 26 ? String.fromCharCode(64 + column) : String(column)))) continue;
    const before = issues.length;
    const documentNo = requiredText(sheets.drivers!.getCell(row, 1), issues, "Conductores", row, "A", 8, 20);
    const licenseNo = requiredText(sheets.drivers!.getCell(row, 7), issues, "Conductores", row, "G", 6, 30).toUpperCase();
    duplicateIssue(documentNo, seen.drivers, issues, "Conductores", row, "A");
    duplicateIssue(licenseNo, seen.licenses, issues, "Conductores", row, "G");
    const email = textValue(sheets.drivers!.getCell(row, 6), issues, "Conductores", row, "F").toLowerCase();
    if (email && !zEmail(email)) issues.push({ sheet: "Conductores", row, column: "F", severity: "ERROR", message: "Ingresa un correo válido." });
    const item = { documentNo, firstName: requiredText(sheets.drivers!.getCell(row, 2), issues, "Conductores", row, "B", 2, 80), lastName: requiredText(sheets.drivers!.getCell(row, 3), issues, "Conductores", row, "C", 2, 100), type: configuredValue(sheets.drivers!.getCell(row, 4), allowed.driverTypes, issues, "Conductores", row, "D"), phone: textValue(sheets.drivers!.getCell(row, 5), issues, "Conductores", row, "E"), email, licenseNo, licenseClass: configuredValue(sheets.drivers!.getCell(row, 8), allowed.licenseClasses, issues, "Conductores", row, "H"), licenseDueAt: dateValue(sheets.drivers!.getCell(row, 9), issues, "Conductores", row, "I", true), hireDate: dateValue(sheets.drivers!.getCell(row, 10), issues, "Conductores", row, "J", false), workRegimeKey: configuredValue(sheets.drivers!.getCell(row, 11), allowed.workRegimes, issues, "Conductores", row, "K"), workCycleAnchor: dateValue(sheets.drivers!.getCell(row, 12), issues, "Conductores", row, "L", true), status: configuredValue(sheets.drivers!.getCell(row, 13), allowed.driverStatuses, issues, "Conductores", row, "M") };
    if (issues.length === before) result.drivers.push(item);
  }

  const errors = issues.filter((issue) => issue.severity === "ERROR").length;
  return { valid: errors === 0, masterData: result, issues: issues.slice(0, 200), summary: { users: result.users.length, parties: result.parties.length, locations: result.locations.length, routes: result.routes.length, vehicles: result.vehicles.length, trailers: result.trailers.length, drivers: result.drivers.length, errors, warnings: issues.filter((issue) => issue.severity === "WARNING").length } };
}

function zEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
