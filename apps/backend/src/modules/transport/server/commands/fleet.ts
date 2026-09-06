import "server-only";
import { audit } from "@/core/audit/audit";
import { AppError } from "@/core/auth/errors";
import { prisma } from "@/core/database/prisma";
import { owned, parse } from "../command-helpers";
import { documentSchema, trailerSchema, trailerUpdateSchema, vehicleSchema, vehicleUpdateSchema } from "../command-schemas";
import type { TransportCommandHandler } from "../command-types";
import type { z } from "zod";
import { assertTenantConfigured, getTransportConfiguration, hasStoredTransportConfiguration } from "../configuration";

type DocumentInput = z.infer<typeof documentSchema>;

export async function assertDocumentOwner(tenantId: string, ownerType: DocumentInput["ownerType"], ownerId: string) {
  const found = ownerType === "DRIVER" ? await prisma.transportDriver.count({ where: { id: ownerId, tenantId } })
    : ownerType === "VEHICLE" ? await prisma.transportVehicle.count({ where: { id: ownerId, tenantId } })
      : ownerType === "TRAILER" ? await prisma.transportTrailer.count({ where: { id: ownerId, tenantId } })
        : ownerType === "TRIP" ? await prisma.transportTrip.count({ where: { id: ownerId, tenantId } })
          : ownerId === tenantId ? 1 : 0;
  if (!found) throw new AppError("INVALID_DOCUMENT_OWNER", 400, "El titular del documento no pertenece a esta empresa.");
}

export async function createTransportDocument(input: DocumentInput, scope: Parameters<TransportCommandHandler>[3], storageObjectId?: string) {
  if (input.issuedAt && input.expiresAt && input.expiresAt <= input.issuedAt) throw new AppError("INVALID_DOCUMENT_DATES", 400, "El vencimiento debe ser posterior a la emisión.");
  await assertDocumentOwner(scope.tenantId, input.ownerType, input.ownerId);
  if (await hasStoredTransportConfiguration(scope.tenantId)) {
    const configuration = await getTransportConfiguration(scope.tenantId);
    const requirement = configuration.documents.requirements.find((item) => item.active && item.key === input.type);
    if (!requirement) throw new AppError("CONFIG_VALUE_NOT_ALLOWED", 400, "El tipo de documento no está habilitado en la configuración de esta empresa.");
    if (requirement.ownerType !== input.ownerType) throw new AppError("INVALID_DOCUMENT_OWNER_TYPE", 400, `${requirement.label} corresponde a titulares de tipo ${requirement.ownerType}.`);
    if (requirement.expires && !input.expiresAt) throw new AppError("DOCUMENT_EXPIRY_REQUIRED", 400, `${requirement.label} requiere fecha de vencimiento.`);
  }
  const entity = await prisma.transportDocument.create({ data: { tenantId: scope.tenantId, ...input, number: input.number || null, issuedAt: input.issuedAt, expiresAt: input.expiresAt, fileUrl: input.fileUrl || null, storageObjectId: storageObjectId ?? null, notes: input.notes || null, status: input.expiresAt && input.expiresAt < new Date() ? "EXPIRED" : "VALID" } });
  await audit(scope, "CREATE", "TransportDocument", entity.id, storageObjectId ? { storageObjectId } : undefined);
  return entity;
}

export const handleFleetCommand: TransportCommandHandler = async (method, segments, body, scope) => {
  const [resource, id] = segments;

  if (method === "POST" && resource === "vehicles") {
    const input = parse(vehicleSchema, body);
    const configuration = await getTransportConfiguration(scope.tenantId);
    await assertTenantConfigured(scope.tenantId, configuration.fleet.vehicleTypes, input.type, "El tipo de vehículo");
    const entity = await prisma.transportVehicle.create({ data: { tenantId: scope.tenantId, ...input, capacityKg: input.capacityKg ?? null, technicalDueAt: input.technicalDueAt, soatDueAt: input.soatDueAt, gpsDeviceId: input.gpsDeviceId || null } });
    await audit(scope, "CREATE", "TransportVehicle", entity.id);
    return { ok: true, id: entity.id, message: "Vehículo registrado." };
  }

  if (method === "PATCH" && resource === "vehicles" && id) {
    const input = parse(vehicleUpdateSchema, body);
    const configuration = await getTransportConfiguration(scope.tenantId);
    await assertTenantConfigured(scope.tenantId, configuration.fleet.vehicleTypes, input.type, "El tipo de vehículo");
    await assertTenantConfigured(scope.tenantId, configuration.fleet.vehicleStatuses, input.status, "El estado de vehículo");
    const current = await owned(prisma.transportVehicle.findFirst({ where: { id, tenantId: scope.tenantId } }), "El vehículo");
    if (input.odometerKm < current.odometerKm) throw new AppError("ODOMETER_ROLLBACK", 409, "El kilometraje no puede disminuir.");
    await prisma.transportVehicle.update({ where: { id }, data: { ...input, capacityKg: input.capacityKg ?? null, technicalDueAt: input.technicalDueAt, soatDueAt: input.soatDueAt, gpsDeviceId: input.gpsDeviceId || null } });
    await audit(scope, "UPDATE", "TransportVehicle", id);
    return { ok: true, id, message: "Vehículo actualizado." };
  }

  if (method === "POST" && resource === "trailers") {
    const input = parse(trailerSchema, body);
    const configuration = await getTransportConfiguration(scope.tenantId);
    await assertTenantConfigured(scope.tenantId, configuration.fleet.trailerTypes, input.type, "El tipo de remolque");
    const entity = await prisma.transportTrailer.create({ data: { tenantId: scope.tenantId, ...input, brand: input.brand || null, model: input.model || null, capacityKg: input.capacityKg ?? null } });
    await audit(scope, "CREATE", "TransportTrailer", entity.id);
    return { ok: true, id: entity.id, message: "Remolque registrado." };
  }

  if (method === "PATCH" && resource === "trailers" && id) {
    const input = parse(trailerUpdateSchema, body);
    const configuration = await getTransportConfiguration(scope.tenantId);
    await assertTenantConfigured(scope.tenantId, configuration.fleet.trailerTypes, input.type, "El tipo de remolque");
    await assertTenantConfigured(scope.tenantId, configuration.fleet.vehicleStatuses, input.status, "El estado de remolque");
    await owned(prisma.transportTrailer.findFirst({ where: { id, tenantId: scope.tenantId } }), "El remolque");
    await prisma.transportTrailer.update({ where: { id }, data: { ...input, brand: input.brand || null, model: input.model || null, capacityKg: input.capacityKg ?? null } });
    await audit(scope, "UPDATE", "TransportTrailer", id);
    return { ok: true, id, message: "Remolque actualizado." };
  }

  if (method === "POST" && resource === "documents") {
    const input = parse(documentSchema, body);
    const entity = await createTransportDocument(input, scope);
    return { ok: true, id: entity.id, message: "Documento registrado." };
  }

  return null;
};
