import "server-only";
import { audit } from "@/core/audit/audit";
import { AppError } from "@/core/auth/errors";
import { prisma } from "@/core/database/prisma";
import { owned, parse } from "../command-helpers";
import { inventoryMovementSchema, inventorySchema, maintenanceSchema, maintenanceStatusSchema } from "../command-schemas";
import type { TransportCommandHandler } from "../command-types";
import { applyInventoryMovement, withInventoryTransaction } from "@/modules/inventory/server/service";
import { assertTenantConfigured, getTransportConfiguration } from "../configuration";

export const handleMaintenanceCommand: TransportCommandHandler = async (method, segments, body, scope) => {
  const [resource, id, action] = segments;

  if (method === "POST" && resource === "maintenance") {
    const input = parse(maintenanceSchema, body);
    const configuration = await getTransportConfiguration(scope.tenantId);
    await assertTenantConfigured(scope.tenantId, configuration.maintenance.maintenanceTypes, input.type, "El tipo de mantenimiento");
    await assertTenantConfigured(scope.tenantId, configuration.operations.priorities, input.priority, "La prioridad");
    const vehicle = await owned(prisma.transportVehicle.findFirst({ where: { id: input.vehicleId, tenantId: scope.tenantId, active: true } }), "El vehículo");
    const code = `${configuration.general.maintenancePrefix}-${new Date().getFullYear()}-${String((await prisma.transportMaintenanceOrder.count({ where: { tenantId: scope.tenantId } })) + 1).padStart(5, "0")}`;
    const entity = await prisma.transportMaintenanceOrder.create({ data: { tenantId: scope.tenantId, vehicleId: vehicle.id, code, type: input.type, title: input.title, description: input.description || null, priority: input.priority, scheduledAt: input.scheduledAt, odometerKm: input.odometerKm ?? vehicle.odometerKm, estimatedCents: input.estimated } });
    await audit(scope, "CREATE", "TransportMaintenanceOrder", entity.id);
    return { ok: true, id: entity.id, message: `Orden ${code} creada.` };
  }

  if (method === "PATCH" && resource === "maintenance" && id && action === "status") {
    const input = parse(maintenanceStatusSchema, body);
    const configuration = await getTransportConfiguration(scope.tenantId);
    await assertTenantConfigured(scope.tenantId, configuration.maintenance.maintenanceStatuses, input.status, "El estado de mantenimiento");
    const order = await owned(prisma.transportMaintenanceOrder.findFirst({ where: { id, tenantId: scope.tenantId } }), "La orden");
    if (["COMPLETED", "CANCELLED"].includes(order.status)) throw new AppError("ORDER_CLOSED", 409, "La orden ya está cerrada.");
    await prisma.$transaction(async (tx) => {
      await tx.transportMaintenanceOrder.update({ where: { id }, data: { status: input.status, actualCents: input.actual, completedAt: input.status === "COMPLETED" ? input.completedAt ?? new Date() : null } });
      await tx.transportVehicle.update({ where: { id: order.vehicleId }, data: { status: input.status === "IN_PROGRESS" ? "MAINTENANCE" : input.status === "COMPLETED" || input.status === "CANCELLED" ? "AVAILABLE" : undefined } });
    });
    await audit(scope, "STATUS_CHANGE", "TransportMaintenanceOrder", id, input);
    return { ok: true, id, message: "Orden de mantenimiento actualizada." };
  }

  if (method === "POST" && resource === "inventory" && !id) {
    const input = parse(inventorySchema, body);
    const entity = await prisma.inventoryItem.create({ data: { tenantId: scope.tenantId, branchId: scope.branchId, sku: input.sku, name: input.name, kind: "PART", unit: input.unit, minimumStock: input.minimumStock, unitCostCents: input.unitCost } });
    await audit(scope, "CREATE", "TransportInventoryItem", entity.id);
    return { ok: true, id: entity.id, message: "Repuesto registrado." };
  }

  if (method === "POST" && resource === "inventory" && id && action === "movements") {
    const input = parse(inventoryMovementSchema, body);
    const item = await owned(prisma.inventoryItem.findFirst({ where: { id, tenantId: scope.tenantId, OR: [{ branchId: scope.branchId }, { branchId: null }], active: true } }), "El repuesto");
    const direction = input.type === "OUT" ? "OUT" : "IN";
    const entity = await withInventoryTransaction((tx) => applyInventoryMovement(tx, scope, { itemId: item.id, type: input.type === "ADJUSTMENT" ? (direction === "IN" ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT") : input.type === "IN" ? "RESTOCK" : "CONSUMPTION", direction, quantity: input.quantity, originType: "TRANSPORT_MAINTENANCE", reference: input.reference || null, notes: input.notes || null }));
    await audit(scope, "MOVE", "TransportInventoryItem", item.id, { type: input.type, quantity: input.quantity });
    return { ok: true, id: entity.id, message: "Movimiento de inventario aplicado." };
  }

  return null;
};
