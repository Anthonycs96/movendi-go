import "server-only";
import { audit } from "@/core/audit/audit";
import { AppError } from "@/core/auth/errors";
import { prisma } from "@/core/database/prisma";
import { owned, parse } from "../command-helpers";
import { fuelSchema } from "../command-schemas";
import type { TransportCommandHandler } from "../command-types";
import { getTransportConfiguration, hasStoredTransportConfiguration } from "../configuration";

export const handleFuelCommand: TransportCommandHandler = async (method, segments, body, scope) => {
  const [resource] = segments;
  if (method !== "POST" || resource !== "fuel") return null;

  const input = parse(fuelSchema, body);
  if (await hasStoredTransportConfiguration(scope.tenantId)) {
    const configuration = await getTransportConfiguration(scope.tenantId);
    if (configuration.modules.fuel.requireInvoice && !input.invoiceNo) throw new AppError("FUEL_INVOICE_REQUIRED", 400, "La factura es obligatoria según la configuración de combustible.");
  }
  const vehicle = await owned(prisma.transportVehicle.findFirst({ where: { id: input.vehicleId, tenantId: scope.tenantId, active: true } }), "El vehículo");
  if (input.odometerKm < vehicle.odometerKm) throw new AppError("ODOMETER_ROLLBACK", 409, "El kilometraje de carga no puede ser menor al actual.");
  if (input.tripId) await owned(prisma.transportTrip.findFirst({ where: { id: input.tripId, tenantId: scope.tenantId }, select: { id: true } }), "El viaje");
  const totalCents = Math.round(input.liters * input.price);
  const entity = await prisma.$transaction(async (tx) => {
    const created = await tx.transportFuelLog.create({ data: { tenantId: scope.tenantId, tripId: input.tripId || null, vehicleId: vehicle.id, loadedAt: input.loadedAt, station: input.station, liters: input.liters, priceCents: input.price, totalCents, odometerKm: input.odometerKm, invoiceNo: input.invoiceNo || null } });
    await tx.transportVehicle.update({ where: { id: vehicle.id }, data: { odometerKm: input.odometerKm } });
    return created;
  });
  await audit(scope, "CREATE", "TransportFuelLog", entity.id);
  return { ok: true, id: entity.id, message: "Carga de combustible registrada." };
};
