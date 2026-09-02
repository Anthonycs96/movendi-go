import "server-only";

import type { Prisma } from "@prisma/client";
import { AppError } from "@/core/auth/errors";

export type CustomFieldInput = { fieldId?: string; code?: string; value?: unknown };

export function normalizeCustomFieldValue(value: unknown) {
  return String(value ?? "").trim().normalize("NFKC").toUpperCase();
}

export function typedCustomFieldValue(definition: { dataType: string; uniqueValue: boolean }, value: unknown) {
  const empty = value === null || value === undefined || value === "";
  if (empty) return { textValue: null, numberValue: null, dateValue: null, booleanValue: null, normalizedValue: null, uniqueKey: null };
  const normalizedValue = normalizeCustomFieldValue(value);
  const result = { textValue: null as string | null, numberValue: null as number | null, dateValue: null as Date | null, booleanValue: null as boolean | null, normalizedValue, uniqueKey: definition.uniqueValue ? normalizedValue : null };
  if (["TEXT", "SELECT", "CODE", "EMAIL", "PHONE"].includes(definition.dataType)) result.textValue = String(value).trim();
  else if (["NUMBER", "MONEY"].includes(definition.dataType)) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new AppError("INVALID_CUSTOM_FIELD", 400, "El valor numérico de un campo adicional no es válido.");
    result.numberValue = number;
  } else if (["DATE", "DATETIME"].includes(definition.dataType)) {
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) throw new AppError("INVALID_CUSTOM_FIELD", 400, "La fecha de un campo adicional no es válida.");
    result.dateValue = date;
  } else if (definition.dataType === "BOOLEAN") {
    if (typeof value === "boolean") result.booleanValue = value;
    else if (["TRUE", "1", "SI", "SÍ", "YES"].includes(normalizedValue)) result.booleanValue = true;
    else if (["FALSE", "0", "NO"].includes(normalizedValue)) result.booleanValue = false;
    else throw new AppError("INVALID_CUSTOM_FIELD", 400, "El valor lógico de un campo adicional no es válido.");
  } else throw new AppError("INVALID_CUSTOM_FIELD_TYPE", 400, `El tipo ${definition.dataType} no está soportado.`);
  return result;
}

export async function saveTripCustomFields(tx: Prisma.TransactionClient, input: { tenantId: string; tripId: string; customerId: string; operationId: string | null; values: CustomFieldInput[]; enforceRequired?: boolean }) {
  const definitions = await tx.transportCustomFieldDefinition.findMany({
    where: { tenantId: input.tenantId, entityType: "TRIP", active: true },
    include: { scopes: true, options: { where: { active: true } } },
  });
  const applicable = definitions.filter((item) => item.scopes.length === 0 || item.scopes.some((scope) => scope.scopeType === "TENANT" && scope.scopeId === input.tenantId || scope.scopeType === "CUSTOMER" && scope.scopeId === input.customerId || scope.scopeType === "OPERATION" && scope.scopeId === input.operationId));
  const byId = new Map(applicable.map((item) => [item.id, item]));
  const byCode = new Map(applicable.map((item) => [item.code, item]));
  const supplied = new Set<string>();
  for (const item of input.values) {
    const definition = item.fieldId ? byId.get(item.fieldId) : item.code ? byCode.get(item.code.toUpperCase()) : undefined;
    if (!definition) throw new AppError("CUSTOM_FIELD_NOT_APPLICABLE", 400, "Uno de los campos adicionales no pertenece a este cliente u operación.");
    supplied.add(definition.id);
    const typed = typedCustomFieldValue(definition, item.value);
    if (definition.required && !typed.normalizedValue) throw new AppError("CUSTOM_FIELD_REQUIRED", 400, `${definition.label} es obligatorio.`);
    if (definition.dataType === "SELECT" && typed.textValue && !definition.options.some((option) => option.code === normalizeCustomFieldValue(typed.textValue))) throw new AppError("CUSTOM_FIELD_OPTION_INVALID", 400, `${definition.label} no contiene una opción permitida.`);
    if (typed.normalizedValue && (definition.uniqueValue || definition.duplicatePolicy === "BLOCK")) {
      const duplicate = await tx.transportCustomFieldValue.findFirst({ where: { tenantId: input.tenantId, definitionId: definition.id, normalizedValue: typed.normalizedValue, tripId: { not: input.tripId } }, select: { id: true } });
      if (duplicate) throw new AppError("DUPLICATE_CUSTOM_FIELD", 409, `${definition.label} ya está asociado a otro viaje.`);
    }
    try {
      if (!typed.normalizedValue) await tx.transportCustomFieldValue.deleteMany({ where: { tripId: input.tripId, definitionId: definition.id } });
      else await tx.transportCustomFieldValue.upsert({ where: { tripId_definitionId: { tripId: input.tripId, definitionId: definition.id } }, create: { tenantId: input.tenantId, tripId: input.tripId, definitionId: definition.id, ...typed }, update: typed });
    } catch (error) {
      if (definition.uniqueValue) throw new AppError("DUPLICATE_CUSTOM_FIELD", 409, `${definition.label} ya está asociado a otro viaje.`);
      throw error;
    }
  }
  if (input.enforceRequired) for (const definition of applicable.filter((item) => item.required && !supplied.has(item.id))) {
    const existing = await tx.transportCustomFieldValue.findUnique({ where: { tripId_definitionId: { tripId: input.tripId, definitionId: definition.id } }, select: { id: true } });
    if (!existing) throw new AppError("CUSTOM_FIELD_REQUIRED", 400, `${definition.label} es obligatorio.`);
  }
}

export function customFieldOutput(value: { textValue: string | null; numberValue: number | null; dateValue: Date | null; booleanValue: boolean | null }) {
  return value.textValue ?? value.numberValue ?? value.dateValue?.toISOString() ?? value.booleanValue;
}
