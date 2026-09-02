import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { audit } from "@/core/audit/audit";
import { AppError } from "@/core/auth/errors";
import { prisma } from "@/core/database/prisma";
import { saveTripCustomFields } from "../custom-fields";
import { owned, parse } from "../command-helpers";
import { customFieldDefinitionSchema, resourcePresetSchema, tripDispatchSchema, tripWorkflowSchema, workflowDefinitionSchema } from "../command-schemas";
import type { TransportCommandHandler } from "../command-types";

function automaticCode(label: string, fallback: string) {
  const base = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 52) || fallback;
  return `${base}_${randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase()}`;
}

async function resolveScopeId(scope: { tenantId: string; branchId: string }, scopeType: "TENANT" | "CUSTOMER" | "OPERATION", value?: string) {
  if (scopeType === "TENANT") return scope.tenantId;
  if (!value) throw new AppError("SCOPE_REQUIRED", 400, "Selecciona el cliente u operación del alcance.");
  const exists = scopeType === "CUSTOMER"
    ? await prisma.transportParty.count({ where: { id: value, tenantId: scope.tenantId, kind: "CUSTOMER" } })
    : await prisma.transportOperation.count({ where: { id: value, tenantId: scope.tenantId, branchId: scope.branchId } });
  if (!exists) throw new AppError("SCOPE_NOT_FOUND", 404, "El alcance no pertenece a esta empresa.");
  return value;
}

// Views are presentation metadata, so JSON is acceptable here; business values remain relational and typed.
const dispatchViewSchema = z.object({ name: z.string().trim().min(2).max(100), columns: z.array(z.string().trim().min(1)).max(100), filters: z.record(z.unknown()).default({}), scopeType: z.enum(["TENANT", "CUSTOMER", "OPERATION"]).default("TENANT"), scopeId: z.string().optional(), isDefault: z.boolean().default(false) });
const importProfileSchema = z.object({ name: z.string().trim().min(2).max(100), scopeType: z.enum(["TENANT", "CUSTOMER", "OPERATION"]).default("TENANT"), scopeId: z.string().optional(), worksheetName: z.string().trim().max(80).optional(), headerRow: z.coerce.number().int().min(1).max(50).default(1), identityStrategy: z.enum(["INTERNAL_CODE", "CUSTOM_FIELD", "CREATE_ONLY"]).default("INTERNAL_CODE"), identityFieldId: z.string().optional(), mappings: z.array(z.object({ sourceColumn: z.string().trim().min(1).max(120), targetType: z.enum(["CORE", "CUSTOM", "ASSIGNMENT"]), targetKey: z.string().trim().min(1).max(80), fieldId: z.string().optional(), required: z.boolean().default(false), defaultValue: z.string().optional() })).min(1).max(150) });
const documentTemplateSchema = z.object({ name: z.string().trim().min(2).max(100), documentType: z.enum(["PURCHASE_ORDER", "ROUTE_SHEET", "SERVICE_ORDER", "MANIFEST", "OTHER"]), scopeType: z.enum(["TENANT", "CUSTOMER", "OPERATION"]).default("TENANT"), scopeId: z.string().optional(), content: z.string().trim().min(10).max(100_000) });

export const handlePlanningCommand: TransportCommandHandler = async (method, segments, body, scope) => {
  const [resource, id, action] = segments;

  if (method === "POST" && resource === "custom-fields" && !id) {
    const input = parse(customFieldDefinitionSchema, body);
    const code = automaticCode(input.label, "CAMPO");
    const scopeId = await resolveScopeId(scope, input.scopeType, input.scopeId);
    const entity = await prisma.transportCustomFieldDefinition.create({ data: {
      tenantId: scope.tenantId, entityType: "TRIP", code, label: input.label, description: input.description || null, dataType: input.dataType, required: input.required, uniqueValue: input.uniqueValue, duplicatePolicy: input.duplicatePolicy, showInDispatch: input.showInDispatch, searchable: input.searchable, filterable: input.filterable, importable: input.importable,
      scopes: { create: { scopeType: input.scopeType, scopeId } },
      options: { create: input.options.map((option, index) => ({ code: automaticCode(option.label, `OPCION_${index + 1}`), label: option.label, sortOrder: index })) },
    } });
    await audit(scope, "CREATE", "TransportCustomFieldDefinition", entity.id, { code, scopeType: input.scopeType, scopeId });
    return { ok: true, id: entity.id, message: `Campo ${input.label} creado con código automático ${code}.` };
  }

  if (method === "PATCH" && resource === "custom-fields" && id && action === "toggle") {
    const field = await owned(prisma.transportCustomFieldDefinition.findFirst({ where: { id, tenantId: scope.tenantId } }), "El campo adicional");
    await prisma.transportCustomFieldDefinition.update({ where: { id }, data: { active: !field.active } });
    await audit(scope, field.active ? "DEACTIVATE" : "ACTIVATE", "TransportCustomFieldDefinition", id);
    return { ok: true, id, message: field.active ? "Campo desactivado; sus datos históricos se conservaron." : "Campo activado." };
  }

  if (method === "POST" && resource === "workflows" && !id) {
    const input = parse(workflowDefinitionSchema, body);
    if (input.states.filter((state) => state.initial).length !== 1) throw new AppError("WORKFLOW_INITIAL_STATE", 400, "El flujo necesita exactamente un estado inicial.");
    if (input.transitions.some((item) => item.from >= input.states.length || item.to >= input.states.length || item.from === item.to)) throw new AppError("WORKFLOW_TRANSITION_INVALID", 400, "Una transición del flujo no es válida.");
    const scopeId = await resolveScopeId(scope, input.scopeType, input.scopeId);
    const code = automaticCode(input.name, "FLUJO");
    const entity = await prisma.$transaction(async (tx) => {
      if (input.isDefault) await tx.transportWorkflowDefinition.updateMany({ where: { tenantId: scope.tenantId, scopeType: input.scopeType, scopeId }, data: { isDefault: false } });
      const workflow = await tx.transportWorkflowDefinition.create({ data: { tenantId: scope.tenantId, code, name: input.name, scopeType: input.scopeType, scopeId, isDefault: input.isDefault } });
      const states = [];
      for (const [index, state] of input.states.entries()) states.push(await tx.transportWorkflowState.create({ data: { workflowId: workflow.id, code: automaticCode(state.label, `ESTADO_${index + 1}`), label: state.label, color: state.color, sortOrder: index, initial: state.initial, terminal: state.terminal } }));
      for (const transition of input.transitions) await tx.transportWorkflowTransition.create({ data: { workflowId: workflow.id, fromStateId: states[transition.from].id, toStateId: states[transition.to].id, label: transition.label || null, requiresReason: transition.requiresReason, notifyClient: transition.notifyClient } });
      return workflow;
    });
    await audit(scope, "CREATE", "TransportWorkflowDefinition", entity.id, { code });
    return { ok: true, id: entity.id, message: `Flujo ${input.name} creado.` };
  }

  if (method === "POST" && resource === "resource-presets" && !id) {
    const input = parse(resourcePresetSchema, body);
    const scopeId = await resolveScopeId(scope, input.scopeType, input.scopeId);
    const [vehicleCount, trailerCount, driverCount] = await Promise.all([
      prisma.transportVehicle.count({ where: { id: input.vehicleId, tenantId: scope.tenantId, active: true } }),
      prisma.transportTrailer.count({ where: { id: { in: input.trailerIds }, tenantId: scope.tenantId, active: true } }),
      prisma.transportDriver.count({ where: { id: { in: input.driverIds }, tenantId: scope.tenantId, active: true } }),
    ]);
    if (vehicleCount !== 1 || trailerCount !== input.trailerIds.length || driverCount !== input.driverIds.length) throw new AppError("INVALID_PRESET_RESOURCE", 400, "Uno de los recursos del ensamble no pertenece a la empresa o está inactivo.");
    const code = automaticCode(input.name, "ENSAMBLE");
    const entity = await prisma.transportResourcePreset.create({ data: { tenantId: scope.tenantId, code, name: input.name, vehicleId: input.vehicleId, scopeType: input.scopeType, scopeId, trailers: { create: input.trailerIds.map((trailerId, position) => ({ trailerId, position })) }, drivers: { create: input.driverIds.map((driverId, position) => ({ driverId, position, role: position === 0 ? "PRIMARY" : position === 1 ? "SECONDARY" : "RELIEF" })) } } });
    await audit(scope, "CREATE", "TransportResourcePreset", entity.id, { code });
    return { ok: true, id: entity.id, message: `Ensamble habitual ${input.name} guardado.` };
  }

  if (method === "PATCH" && resource === "trips" && id && action === "dispatch") {
    const input = parse(tripDispatchSchema, body);
    const trip = await owned(prisma.transportTrip.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId } }), "El viaje");
    if (trip.version !== input.version) throw new AppError("STALE_TRIP_VERSION", 409, "El viaje cambió mientras lo editabas. Recarga el plan y vuelve a intentar.");
    const scheduledStartAt = input.scheduledStartAt ?? trip.scheduledStartAt;
    const scheduledEndAt = input.scheduledEndAt ?? trip.scheduledEndAt;
    if (scheduledEndAt <= scheduledStartAt) throw new AppError("INVALID_DATE_RANGE", 400, "La llegada debe ser posterior a la salida.");
    if (input.appointmentStartAt && input.appointmentEndAt && input.appointmentEndAt <= input.appointmentStartAt) throw new AppError("INVALID_APPOINTMENT_RANGE", 400, "El fin de la cita debe ser posterior al inicio.");
    const appointmentChanged = input.appointmentStartAt !== undefined || input.appointmentEndAt !== undefined || input.appointmentStatus !== undefined;
    await prisma.$transaction(async (tx) => {
      await tx.transportTrip.update({ where: { id }, data: { scheduledStartAt, scheduledEndAt, appointmentStartAt: input.appointmentStartAt, appointmentEndAt: input.appointmentEndAt, appointmentStatus: input.appointmentStatus, priority: input.priority, notes: input.notes, version: { increment: 1 } } });
      if (input.customFields) await saveTripCustomFields(tx, { tenantId: scope.tenantId, tripId: id, customerId: trip.customerId, operationId: trip.operationId, values: input.customFields });
      await tx.transportTripEvent.create({ data: { tenantId: scope.tenantId, tripId: id, type: appointmentChanged ? "APPOINTMENT_UPDATED" : "DISPATCH_UPDATED", reason: input.reprogramReason || null, payload: JSON.stringify({ notifyClient: input.notifyClient === true }), actorId: scope.actorId } });
      if (input.notifyClient) await tx.transportTripEvent.create({ data: { tenantId: scope.tenantId, tripId: id, type: "CLIENT_NOTIFIED", actorId: scope.actorId } });
    });
    await audit(scope, "DISPATCH_UPDATE", "TransportTrip", id, { version: input.version + 1 });
    return { ok: true, id, message: "Plan de despacho actualizado." };
  }

  if (method === "PATCH" && resource === "trips" && id && action === "workflow") {
    const input = parse(tripWorkflowSchema, body);
    const trip = await owned(prisma.transportTrip.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId } }), "El viaje");
    const target = await owned(prisma.transportWorkflowState.findFirst({ where: { id: input.stateId, active: true, workflow: { tenantId: scope.tenantId, active: true } }, include: { workflow: true } }), "El estado operacional");
    if (target.workflow.scopeType === "CUSTOMER" && target.workflow.scopeId !== trip.customerId || target.workflow.scopeType === "OPERATION" && target.workflow.scopeId !== trip.operationId) throw new AppError("WORKFLOW_SCOPE_MISMATCH", 409, "El flujo operacional no aplica a este viaje.");
    if (trip.workflowDefinitionId && trip.workflowDefinitionId !== target.workflowId) throw new AppError("WORKFLOW_LOCKED", 409, "El viaje ya pertenece a otro flujo operacional.");
    let transition: { requiresReason: boolean; notifyClient: boolean } | null = null;
    if (trip.workflowStateId) {
      transition = await prisma.transportWorkflowTransition.findFirst({ where: { workflowId: target.workflowId, fromStateId: trip.workflowStateId, toStateId: target.id, active: true }, select: { requiresReason: true, notifyClient: true } });
      if (!transition) throw new AppError("WORKFLOW_TRANSITION_INVALID", 409, "La transición operacional no está permitida.");
      if (transition.requiresReason && !input.reason) throw new AppError("WORKFLOW_REASON_REQUIRED", 400, "Esta transición requiere un motivo.");
    } else if (!target.initial) throw new AppError("WORKFLOW_INITIAL_REQUIRED", 409, "El viaje debe iniciar en el estado inicial del flujo.");
    await prisma.$transaction(async (tx) => {
      await tx.transportTrip.update({ where: { id }, data: { workflowDefinitionId: target.workflowId, workflowStateId: target.id, version: { increment: 1 } } });
      await tx.transportTripEvent.create({ data: { tenantId: scope.tenantId, tripId: id, type: "WORKFLOW_CHANGED", fromValue: trip.workflowStateId, toValue: target.id, reason: input.reason || null, actorId: scope.actorId } });
      if (transition?.notifyClient) await tx.transportTripEvent.create({ data: { tenantId: scope.tenantId, tripId: id, type: "CLIENT_NOTIFICATION_REQUIRED", payload: JSON.stringify({ workflowStateId: target.id }), actorId: scope.actorId } });
    });
    await audit(scope, "WORKFLOW_CHANGE", "TransportTrip", id, { stateId: target.id });
    return { ok: true, id, message: `Estado operacional actualizado a ${target.label}.` };
  }

  if (method === "POST" && resource === "dispatch-views" && !id) {
    const input = parse(dispatchViewSchema, body);
    const scopeId = await resolveScopeId(scope, input.scopeType, input.scopeId);
    const code = automaticCode(input.name, "VISTA");
    const entity = await prisma.$transaction(async (tx) => {
      if (input.isDefault) await tx.transportDispatchView.updateMany({ where: { tenantId: scope.tenantId, scopeType: input.scopeType, scopeId }, data: { isDefault: false } });
      return tx.transportDispatchView.create({ data: { tenantId: scope.tenantId, code, name: input.name, scopeType: input.scopeType, scopeId, columns: JSON.stringify(input.columns), filters: JSON.stringify(input.filters), isDefault: input.isDefault } });
    });
    await audit(scope, "CREATE", "TransportDispatchView", entity.id);
    return { ok: true, id: entity.id, message: `Vista ${input.name} guardada.` };
  }

  if (method === "POST" && resource === "import-profiles" && !id) {
    const input = parse(importProfileSchema, body);
    const scopeId = await resolveScopeId(scope, input.scopeType, input.scopeId);
    if (input.identityStrategy === "CUSTOM_FIELD" && !input.identityFieldId) throw new AppError("IDENTITY_FIELD_REQUIRED", 400, "Selecciona el campo externo que identifica los viajes.");
    if (input.identityFieldId) {
      const identityField = await prisma.transportCustomFieldDefinition.findFirst({ where: { id: input.identityFieldId, tenantId: scope.tenantId, active: true, importable: true } });
      if (!identityField || !identityField.uniqueValue && identityField.duplicatePolicy !== "BLOCK") throw new AppError("IDENTITY_FIELD_INVALID", 400, "La identidad externa debe usar un campo único o con duplicados bloqueados.");
    }
    const fieldIds = input.mappings.flatMap((item) => item.fieldId ? [item.fieldId] : []);
    if (fieldIds.length) {
      const count = await prisma.transportCustomFieldDefinition.count({ where: { id: { in: fieldIds }, tenantId: scope.tenantId, active: true, importable: true } });
      if (count !== new Set(fieldIds).size) throw new AppError("IMPORT_FIELD_INVALID", 400, "Uno de los campos mapeados no se puede importar.");
    }
    const code = automaticCode(input.name, "IMPORTACION");
    const entity = await prisma.transportImportProfile.create({ data: { tenantId: scope.tenantId, code, name: input.name, scopeType: input.scopeType, scopeId, worksheetName: input.worksheetName || null, headerRow: input.headerRow, identityStrategy: input.identityStrategy, identityFieldId: input.identityFieldId || null, mappings: { create: input.mappings.map((item) => ({ sourceColumn: item.sourceColumn, targetType: item.targetType, targetKey: item.targetKey, fieldId: item.fieldId || null, required: item.required, defaultValue: item.defaultValue || null })) } } });
    await audit(scope, "CREATE", "TransportImportProfile", entity.id, { code });
    return { ok: true, id: entity.id, message: `Plantilla de importación ${input.name} guardada.` };
  }

  if (method === "POST" && resource === "document-templates" && !id) {
    const input = parse(documentTemplateSchema, body);
    const scopeId = await resolveScopeId(scope, input.scopeType, input.scopeId);
    const code = automaticCode(input.name, "DOCUMENTO");
    const entity = await prisma.transportDocumentTemplate.create({ data: { tenantId: scope.tenantId, code, name: input.name, documentType: input.documentType, scopeType: input.scopeType, scopeId, content: input.content } });
    await audit(scope, "CREATE", "TransportDocumentTemplate", entity.id, { code });
    return { ok: true, id: entity.id, message: `Plantilla opcional ${input.name} creada.` };
  }

  return null;
};
