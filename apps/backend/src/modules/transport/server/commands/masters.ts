import "server-only";
import { audit } from "@/core/audit/audit";
import { AppError } from "@/core/auth/errors";
import { prisma } from "@/core/database/prisma";
import { owned, parse } from "../command-helpers";
import { locationSchema, partySchema, partyUpdateSchema, routeSchema } from "../command-schemas";
import type { TransportCommandHandler } from "../command-types";
import { assertTenantConfigured, getTransportConfiguration } from "../configuration";

export const handleMasterCommand: TransportCommandHandler = async (method, segments, body, scope) => {
  const [resource, id] = segments;

  if (method === "POST" && resource === "parties") {
    const input = parse(partySchema, body);
    const configuration = await getTransportConfiguration(scope.tenantId);
    await assertTenantConfigured(scope.tenantId, configuration.customers.partyTypes, input.kind, "El tipo de cuenta");
    const entity = await prisma.transportParty.create({ data: { tenantId: scope.tenantId, ...input, tradeName: input.tradeName || null, contactName: input.contactName || null, phone: input.phone || null, email: input.email || null, address: input.address || null } });
    await audit(scope, "CREATE", "TransportParty", entity.id);
    return { ok: true, id: entity.id, message: "Empresa vinculada correctamente." };
  }

  if (method === "PATCH" && resource === "parties" && id) {
    const input = parse(partyUpdateSchema, body);
    const configuration = await getTransportConfiguration(scope.tenantId);
    await assertTenantConfigured(scope.tenantId, configuration.customers.partyTypes, input.kind, "El tipo de cuenta");
    await owned(prisma.transportParty.findFirst({ where: { id, tenantId: scope.tenantId }, select: { id: true } }), "La empresa");
    await prisma.transportParty.update({ where: { id }, data: { ...input, tradeName: input.tradeName || null, contactName: input.contactName || null, phone: input.phone || null, email: input.email || null, address: input.address || null } });
    await audit(scope, "UPDATE", "TransportParty", id);
    return { ok: true, id, message: "Empresa actualizada." };
  }

  if (method === "POST" && resource === "locations") {
    const input = parse(locationSchema, body);
    const entity = await prisma.transportLocation.create({ data: { tenantId: scope.tenantId, ...input, address: input.address || null, district: input.district || null, province: input.province || null, department: input.department || null } });
    await audit(scope, "CREATE", "TransportLocation", entity.id);
    return { ok: true, id: entity.id, message: "Ubicación creada." };
  }

  if (method === "POST" && resource === "routes") {
    const input = parse(routeSchema, body);
    if (input.originId === input.destinationId) throw new AppError("SAME_LOCATION", 400, "Origen y destino deben ser diferentes.");
    const count = await prisma.transportLocation.count({ where: { tenantId: scope.tenantId, id: { in: [input.originId, input.destinationId] }, active: true } });
    if (count !== 2) throw new AppError("INVALID_ROUTE", 400, "Origen o destino no pertenecen a la empresa.");
    const entity = await prisma.transportRoute.create({ data: { tenantId: scope.tenantId, code: input.code, name: input.name, originId: input.originId, destinationId: input.destinationId, distanceKm: input.distanceKm, estimatedMinutes: input.estimatedMinutes, tollEstimateCents: input.tollEstimate, baseFreightCents: input.baseFreight } });
    await audit(scope, "CREATE", "TransportRoute", entity.id);
    return { ok: true, id: entity.id, message: "Ruta creada." };
  }

  return null;
};
