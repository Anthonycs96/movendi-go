import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { buildTransportMasterWorkbook, parseTransportMasterWorkbook, type TransportWorkbookSource } from "./transport-workbook";

const source: TransportWorkbookSource = {
  tenantId: "tenant-transport-test",
  tenantName: "Transportes de prueba",
  tenantSlug: "transportes-prueba",
  lists: { roles: [{ key: "DISPATCH", name: "Despacho" }], partyTypes: ["CUSTOMER"], vehicleTypes: ["TRACTOR"], trailerTypes: ["FLATBED"], vehicleStatuses: ["AVAILABLE"], driverTypes: ["PAYROLL"], driverStatuses: ["AVAILABLE"], licenseClasses: ["AIIIB"], workRegimes: ["6X1"] },
  masterData: {
    users: [{ name: "Ana Despacho", email: "ana@example.com", roleKey: "DISPATCH" }],
    parties: [{ kind: "CUSTOMER", documentType: "RUC", documentNo: "20123456789", legalName: "Cliente Uno SAC", tradeName: "", contactName: "", phone: "", email: "", address: "" }],
    locations: [{ code: "LIMA", name: "Base Lima", address: "", district: "", province: "Lima", department: "Lima", latitude: -12.05, longitude: -77.04 }, { code: "CALLAO", name: "Puerto Callao", address: "", district: "", province: "Callao", department: "Callao", latitude: -12.06, longitude: -77.14 }],
    routes: [{ code: "LIM-CAL", name: "Lima - Callao", originCode: "LIMA", destinationCode: "CALLAO", distanceKm: 18, estimatedMinutes: 60, tollEstimate: 0, baseFreight: 350 }],
    vehicles: [{ plate: "ABC-123", brand: "Volvo", model: "FH", year: 2024, type: "TRACTOR", capacityKg: 30000, odometerKm: 1000, status: "AVAILABLE", technicalDueAt: "2027-01-10", soatDueAt: "2027-02-10", gpsDeviceId: "" }],
    trailers: [{ plate: "TBC-123", brand: "Randon", model: "Sider", type: "FLATBED", capacityKg: 28000, status: "AVAILABLE" }],
    drivers: [{ documentNo: "44556677", firstName: "Jorge", lastName: "Quispe", type: "PAYROLL", phone: "", email: "jorge@example.com", licenseNo: "Q44556677", licenseClass: "AIIIB", licenseDueAt: "2027-03-10", hireDate: "2024-01-10", workRegimeKey: "6X1", workCycleAnchor: "2026-01-01", status: "AVAILABLE" }],
  },
};

test("genera y recupera la plantilla maestra conectando ubicaciones y rutas", async () => {
  const file = await buildTransportMasterWorkbook(source);
  const parsed = await parseTransportMasterWorkbook(file, source.tenantId, source.lists);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.summary.parties, 1);
  assert.equal(parsed.summary.vehicles, 1);
  assert.equal(parsed.masterData.routes[0]?.originCode, "LIMA");
  assert.equal(parsed.masterData.drivers[0]?.workRegimeKey, "6X1");
});

test("rechaza una plantilla de transporte perteneciente a otro negocio", async () => {
  const file = await buildTransportMasterWorkbook(source);
  await assert.rejects(() => parseTransportMasterWorkbook(file, "otro-tenant", source.lists), /otro negocio/);
});

test("detecta referencias de ruta inválidas", async () => {
  const file = await buildTransportMasterWorkbook(source);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(file as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  workbook.getWorksheet("Rutas")!.getCell("C5").value = "NO-EXISTE";
  const changed = Buffer.from(await workbook.xlsx.writeBuffer());
  const parsed = await parseTransportMasterWorkbook(changed, source.tenantId, source.lists);
  assert.equal(parsed.valid, false);
  assert.ok(parsed.issues.some((issue) => issue.sheet === "Rutas" && issue.column === "C"));
});
