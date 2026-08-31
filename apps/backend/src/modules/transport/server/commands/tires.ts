import "server-only";
import { audit } from "@/core/audit/audit";
import { AppError } from "@/core/auth/errors";
import { prisma } from "@/core/database/prisma";
import { owned, parse } from "../command-helpers";
import { tireEventSchema, tireSchema } from "../command-schemas";
import type { TransportCommandHandler } from "../command-types";
import { assertTenantConfigured, getTransportConfiguration } from "../configuration";

export const handleTireCommand: TransportCommandHandler = async (method, segments, body, scope) => {
  const [resource, id, action] = segments;

  if (method === "POST" && resource === "tires" && !id) {
    const input = parse(tireSchema, body);
    const entity = await prisma.transportTire.create({ data: { tenantId: scope.tenantId, serialNo: input.serialNo, brand: input.brand, model: input.model || null, size: input.size, purchaseAt: input.purchaseAt, purchaseCents: input.purchase, initialTreadMm: input.initialTreadMm ?? null, currentTreadMm: input.initialTreadMm ?? null } });
    await audit(scope, "CREATE", "TransportTire", entity.id);
    return { ok: true, id: entity.id, message: "Neumático serializado registrado." };
  }

  if (method === "POST" && resource === "tires" && id && action === "events") {
    const input = parse(tireEventSchema, body);
    const tire = await owned(prisma.transportTire.findFirst({ where: { id, tenantId: scope.tenantId, active: true } }), "El neumático");
    const vehicle = input.vehicleId ? await owned(prisma.transportVehicle.findFirst({ where: { id: input.vehicleId, tenantId: scope.tenantId, active: true } }), "El vehículo") : null;
    if (["INSTALL", "ROTATION"].includes(input.type) && (!vehicle || !input.position)) throw new AppError("INSTALL_DATA_REQUIRED", 400, "Selecciona vehículo y posición.");
    if (["INSTALL", "ROTATION"].includes(input.type)) {
      const configuration = await getTransportConfiguration(scope.tenantId);
      await assertTenantConfigured(scope.tenantId, configuration.modules.tires.positions, input.position!, "La posición del neumático");
      const occupied = await prisma.transportTire.findFirst({ where: { tenantId: scope.tenantId, id: { not: tire.id }, currentVehicleId: vehicle!.id, currentPosition: input.position, status: "INSTALLED", active: true } });
      if (occupied) throw new AppError("TIRE_POSITION_OCCUPIED", 409, "La posición ya tiene un neumático instalado.");
    }
    const entity = await prisma.$transaction(async (tx) => {
      const event = await tx.transportTireEvent.create({ data: { tenantId: scope.tenantId, tireId: tire.id, vehicleId: vehicle?.id ?? null, type: input.type, position: input.position || null, treadMm: input.treadMm ?? null, odometerKm: input.odometerKm ?? null, costCents: input.cost, notes: input.notes || null, occurredAt: input.occurredAt } });
      const installed = ["INSTALL", "ROTATION"].includes(input.type);
      const removed = ["REMOVE", "RETIRE"].includes(input.type);
      await tx.transportTire.update({ where: { id: tire.id }, data: { currentVehicleId: installed ? vehicle!.id : removed ? null : tire.currentVehicleId, currentPosition: installed ? input.position : removed ? null : tire.currentPosition, currentTreadMm: input.treadMm ?? tire.currentTreadMm, status: input.type === "RETIRE" ? "RETIRED" : installed ? "INSTALLED" : input.type === "REMOVE" ? "STOCK" : tire.status, active: input.type === "RETIRE" ? false : tire.active } });
      return event;
    });
    await audit(scope, input.type, "TransportTire", tire.id);
    return { ok: true, id: entity.id, message: "Evento del neumático aplicado." };
  }

  return null;
};
