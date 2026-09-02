import ExcelJS from "exceljs";
import { errorResponse } from "@/core/auth/errors";
import { requireSession } from "@/core/auth/session";
import { prisma } from "@/core/database/prisma";

export async function GET() {
  try {
    const session = await requireSession("transport:operations:read");
    const [fields, customers, routes] = await Promise.all([
      prisma.transportCustomFieldDefinition.findMany({ where: { tenantId: session.tenantId, entityType: "TRIP", active: true, importable: true }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }] }),
      prisma.transportParty.findMany({ where: { tenantId: session.tenantId, kind: "CUSTOMER", active: true }, select: { documentNo: true, legalName: true }, orderBy: { legalName: "asc" }, take: 1000 }),
      prisma.transportRoute.findMany({ where: { tenantId: session.tenantId, active: true }, select: { code: true, name: true }, orderBy: { name: "asc" }, take: 1000 }),
    ]);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "MOVENDI GO";
    const sheet = workbook.addWorksheet("Plan diario");
    const core = ["Código MOVENDI", "Documento cliente*", "Código ruta*", "Tipo servicio*", "Carga*", "Peso kg", "Salida*", "Llegada*", "Cita inicio", "Cita fin", "Prioridad", "Referencia heredada", "Flete", "Presupuesto", "Notas"];
    const headers = [...core, ...fields.map((field) => `${field.label}${field.required ? "*" : ""} [${field.code}]`)];
    sheet.getRow(1).values = headers;
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17365D" } };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
    sheet.columns = headers.map((header) => ({ header, width: Math.max(16, Math.min(34, header.length + 4)) }));
    const catalog = workbook.addWorksheet("Catálogos");
    catalog.getRow(1).values = ["Documento cliente", "Cliente", "Código ruta", "Ruta"];
    const size = Math.max(customers.length, routes.length);
    for (let index = 0; index < size; index += 1) catalog.getRow(index + 2).values = [customers[index]?.documentNo ?? "", customers[index]?.legalName ?? "", routes[index]?.code ?? "", routes[index]?.name ?? ""];
    catalog.getRow(1).font = { bold: true };
    const instructions = workbook.addWorksheet("Instrucciones");
    instructions.getColumn(1).width = 110;
    instructions.getCell("A1").value = "Carga operacional MOVENDI";
    instructions.getCell("A1").font = { bold: true, size: 16 };
    instructions.getCell("A3").value = "El Código MOVENDI es opcional: vacío crea un viaje y con código existente actualiza. Las columnas con * son obligatorias. Los campos entre [corchetes] son códigos automáticos configurados por tu empresa. Primero se previsualiza; nada se guarda hasta confirmar.";
    instructions.getCell("A3").alignment = { wrapText: true };
    instructions.getRow(3).height = 50;
    const buffer = await workbook.xlsx.writeBuffer();
    return new Response(Buffer.from(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="movendi-plan-diario-${new Date().toISOString().slice(0, 10)}.xlsx"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return errorResponse(error); }
}
