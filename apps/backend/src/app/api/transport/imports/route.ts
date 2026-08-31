import { z } from "zod";
import { AppError, errorResponse } from "@/core/auth/errors";
import { requireSession } from "@/core/auth/session";
import { prisma } from "@/core/database/prisma";
import { parse } from "@/modules/transport/server/command-helpers";

const partyRow = z.object({ kind: z.enum(["CUSTOMER", "PROVIDER", "CARRIER"]), documentType: z.string().min(1).default("RUC"), documentNo: z.string().min(3), legalName: z.string().min(2), tradeName: z.string().optional(), contactName: z.string().optional(), phone: z.string().optional(), email: z.string().optional(), address: z.string().optional() });
const vehicleRow = z.object({ plate: z.string().min(5), brand: z.string().min(1), model: z.string().min(1), year: z.coerce.number().int().min(1950).max(2100), type: z.string().min(1), capacityKg: z.coerce.number().nonnegative().optional(), odometerKm: z.coerce.number().nonnegative().default(0), status: z.string().default("AVAILABLE") });
const driverRow = z.object({ documentNo: z.string().min(6), firstName: z.string().min(1), lastName: z.string().min(1), phone: z.string().optional(), email: z.string().optional(), licenseNo: z.string().min(4), licenseClass: z.string().min(1), licenseDueAt: z.coerce.date(), workRegimeName: z.string().default("6x1"), workDays: z.coerce.number().int().min(1).max(30).default(6), restDays: z.coerce.number().int().min(1).max(30).default(1), status: z.string().default("AVAILABLE") });
const inputSchema = z.object({ resource: z.enum(["parties", "vehicles", "drivers"]), rows: z.array(z.record(z.unknown())).min(1).max(1_000) });

export async function POST(request: Request) {
  try {
    const input = parse(inputSchema, await request.json());
    const permission = input.resource === "parties" ? "transport:masters:write" : input.resource === "vehicles" ? "transport:fleet:write" : "transport:drivers:write";
    const session = await requireSession(permission);
    if (session.tenantType !== "TRANSPORT") throw new AppError("MODULE_ACCESS_DENIED", 403, "La importación pertenece al módulo Transporte.");

    if (input.resource === "parties") {
      const rows = input.rows.map((row) => parse(partyRow, row));
      await prisma.$transaction(rows.map((row) => prisma.transportParty.upsert({ where: { tenantId_documentNo_kind: { tenantId: session.tenantId, documentNo: row.documentNo.trim(), kind: row.kind } }, update: { ...row, documentNo: row.documentNo.trim() }, create: { tenantId: session.tenantId, ...row, documentNo: row.documentNo.trim() } })));
    } else if (input.resource === "vehicles") {
      const rows = input.rows.map((row) => parse(vehicleRow, row));
      await prisma.$transaction(rows.map((row) => prisma.transportVehicle.upsert({ where: { tenantId_plate: { tenantId: session.tenantId, plate: row.plate.trim().toUpperCase() } }, update: { ...row, plate: row.plate.trim().toUpperCase() }, create: { tenantId: session.tenantId, ...row, plate: row.plate.trim().toUpperCase() } })));
    } else {
      const rows = input.rows.map((row) => parse(driverRow, row));
      await prisma.$transaction(rows.map((row) => prisma.transportDriver.upsert({ where: { tenantId_documentNo: { tenantId: session.tenantId, documentNo: row.documentNo.trim() } }, update: { ...row, documentNo: row.documentNo.trim(), workCycleAnchor: new Date() }, create: { tenantId: session.tenantId, ...row, documentNo: row.documentNo.trim(), workCycleAnchor: new Date() } })));
    }
    return Response.json({ ok: true, imported: input.rows.length, resource: input.resource, message: `${input.rows.length} filas importadas correctamente.` });
  } catch (error) {
    return errorResponse(error);
  }
}
