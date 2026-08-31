import "server-only";

import { normalizeRestaurantArea, type RestaurantAreaDispatchMode } from "@movendi/contracts";
import { prisma } from "@/core/database/prisma";
import { AppError } from "@/core/auth/errors";

export interface PreparationAreaInput {
  name: string;
  normalizedKey?: string;
  type?: string;
  source?: string;
  dispatchMode?: RestaurantAreaDispatchMode;
  enabled?: boolean;
}

export async function existingPreparationAreasByKey(tenantId: string, branchId: string) {
  const areas = await prisma.preparationArea.findMany({ where: { tenantId, branchId, active: true } });
  return new Map(areas.flatMap((area) => {
    const normalized = area.normalizedKey ? { key: area.normalizedKey } : normalizeRestaurantArea(area.name);
    return normalized ? [[normalized.key, area] as const] : [];
  }));
}

async function mergeDuplicateArea(primaryId: string, duplicateId: string) {
  if (primaryId === duplicateId) return;
  const links = await prisma.preparationAreaPrinter.findMany({ where: { areaId: duplicateId } });
  for (const link of links) {
    await prisma.preparationAreaPrinter.upsert({
      where: { areaId_printerId: { areaId: primaryId, printerId: link.printerId } },
      create: { tenantId: link.tenantId, branchId: link.branchId, areaId: primaryId, printerId: link.printerId, copies: link.copies, active: link.active },
      update: { copies: Math.max(1, link.copies), active: link.active },
    });
  }
  await prisma.$transaction([
    prisma.category.updateMany({ where: { preparationAreaId: duplicateId }, data: { preparationAreaId: primaryId } }),
    prisma.product.updateMany({ where: { preparationAreaId: duplicateId }, data: { preparationAreaId: primaryId } }),
    prisma.restaurantPrintJob.updateMany({ where: { preparationAreaId: duplicateId }, data: { preparationAreaId: primaryId } }),
    prisma.preparationAreaPrinter.deleteMany({ where: { areaId: duplicateId } }),
    prisma.preparationArea.update({ where: { id: duplicateId }, data: { active: false, normalizedKey: null } }),
  ]);
}

export async function materializePreparationAreas(tenantId: string, branchId: string, inputs: PreparationAreaInput[]) {
  const requested = new Map<string, Required<Pick<PreparationAreaInput, "name">> & PreparationAreaInput>();
  for (const input of inputs) {
    if (input.enabled === false) continue;
    const normalized = normalizeRestaurantArea(input.name);
    if (!normalized) continue;
    // The canonical key is always derived server-side. Client-provided keys are
    // display hints only and must never be able to route data across area types.
    const key = normalized.key;
    requested.set(key, { ...input, name: normalized.name, normalizedKey: key, type: input.type || normalized.type, source: input.source || "ONBOARDING", dispatchMode: input.dispatchMode || "KDS" });
  }

  const existing = await prisma.preparationArea.findMany({ where: { tenantId, branchId } });
  const result = new Map<string, { id: string; name: string; normalizedKey: string | null; type: string; dispatchMode: string }>();
  for (const [key, input] of requested) {
    const matches = existing.filter((area) => area.normalizedKey === key || (!area.normalizedKey && normalizeRestaurantArea(area.name)?.key === key));
    let primary = matches.find((area) => area.name.localeCompare(input.name, undefined, { sensitivity: "base" }) === 0) ?? matches[0];
    if (!primary) {
      primary = await prisma.preparationArea.create({ data: { tenantId, branchId, name: input.name, normalizedKey: key, type: input.type, source: input.source, dispatchMode: input.dispatchMode } });
      existing.push(primary);
    } else {
      const conflictingName = existing.find((area) => area.id !== primary!.id && area.name === input.name);
      primary = await prisma.preparationArea.update({ where: { id: primary.id }, data: { name: conflictingName ? primary.name : input.name, normalizedKey: key, type: input.type, source: input.source, dispatchMode: input.dispatchMode, active: true } });
    }
    for (const duplicate of matches) if (duplicate.id !== primary.id) await mergeDuplicateArea(primary.id, duplicate.id);
    result.set(key, primary);
  }
  return result;
}

export async function reconcilePreparationAreas(tenantId: string, branchId: string, inputs: PreparationAreaInput[]) {
  const enabledKeys = new Set(inputs.filter((input) => input.enabled !== false).map((input) => normalizeRestaurantArea(input.name)?.key).filter((key): key is string => Boolean(key)));
  const result = await materializePreparationAreas(tenantId, branchId, inputs);
  const existing = await prisma.preparationArea.findMany({ where: { tenantId, branchId, active: true } });
  for (const input of inputs.filter((item) => item.enabled === false)) {
    const key = normalizeRestaurantArea(input.name)?.key;
    if (!key || enabledKeys.has(key)) continue;
    const matches = existing.filter((area) => area.normalizedKey === key || (!area.normalizedKey && normalizeRestaurantArea(area.name)?.key === key));
    for (const area of matches) {
      await prisma.$transaction([
        prisma.category.updateMany({ where: { tenantId, branchId, preparationAreaId: area.id }, data: { preparationAreaId: null } }),
        prisma.product.updateMany({ where: { tenantId, branchId, preparationAreaId: area.id }, data: { preparationAreaId: null } }),
        prisma.preparationAreaPrinter.updateMany({ where: { tenantId, branchId, areaId: area.id }, data: { active: false } }),
        prisma.preparationArea.update({ where: { id: area.id }, data: { active: false } }),
      ]);
    }
  }
  return result;
}

export async function updateOwnedPreparationArea(tenantId: string, branchId: string, id: string, input: PreparationAreaInput) {
  const current = await prisma.preparationArea.findFirst({ where: { id, tenantId, branchId } });
  if (!current) throw new AppError("PREPARATION_AREA_TENANT_MISMATCH", 404, "El área no existe o pertenece a otro negocio o sede.");
  const normalized = normalizeRestaurantArea(input.name);
  if (!normalized) throw new AppError("PREPARATION_AREA_INVALID", 400, "No se pudo normalizar el área de preparación.");
  const existing = await prisma.preparationArea.findMany({ where: { tenantId, branchId, id: { not: current.id } } });
  const canonical = existing.find((area) => area.normalizedKey === normalized.key || (!area.normalizedKey && normalizeRestaurantArea(area.name)?.key === normalized.key));
  if (canonical) {
    await mergeDuplicateArea(canonical.id, current.id);
    return prisma.preparationArea.update({ where: { id: canonical.id }, data: { normalizedKey: normalized.key, type: input.type || normalized.type, source: input.source || "MANUAL", dispatchMode: input.dispatchMode || canonical.dispatchMode, active: input.enabled !== false } });
  }
  return prisma.preparationArea.update({ where: { id: current.id }, data: { name: normalized.name, normalizedKey: normalized.key, type: input.type || normalized.type, source: input.source || "MANUAL", dispatchMode: input.dispatchMode || current.dispatchMode, active: input.enabled !== false } });
}

export async function requireOwnedPreparationArea(tenantId: string, branchId: string, areaId: string) {
  const area = await prisma.preparationArea.findFirst({ where: { id: areaId, tenantId, branchId, active: true } });
  if (!area) throw new AppError("PREPARATION_AREA_TENANT_MISMATCH", 400, "El área no existe o pertenece a otro negocio o sede.");
  return area;
}
