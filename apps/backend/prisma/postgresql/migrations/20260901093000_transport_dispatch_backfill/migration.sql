-- Preserve legacy transport data in the configurable relational architecture.
INSERT INTO "TransportCustomFieldDefinition" ("id", "tenantId", "entityType", "code", "label", "description", "dataType", "required", "uniqueValue", "duplicatePolicy", "showInDispatch", "searchable", "filterable", "importable", "active", "sortOrder", "createdAt", "updatedAt")
SELECT 'legacy_reference_' || "tenantId", "tenantId", 'TRIP', 'LEGACY_REFERENCE', 'Referencia heredada', 'Migrado desde referenceNo; desactívalo cuando el cliente use sus propios campos.', 'TEXT', false, false, 'WARN', true, true, true, true, true, 999, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "TransportTrip" WHERE "referenceNo" IS NOT NULL AND trim("referenceNo") <> '' GROUP BY "tenantId" ON CONFLICT DO NOTHING;

INSERT INTO "TransportCustomFieldScope" ("id", "definitionId", "scopeType", "scopeId")
SELECT 'legacy_scope_' || "tenantId", 'legacy_reference_' || "tenantId", 'TENANT', "tenantId"
FROM "TransportTrip" WHERE "referenceNo" IS NOT NULL AND trim("referenceNo") <> '' GROUP BY "tenantId" ON CONFLICT DO NOTHING;

INSERT INTO "TransportCustomFieldValue" ("id", "tenantId", "tripId", "definitionId", "textValue", "normalizedValue", "uniqueKey", "createdAt", "updatedAt")
SELECT 'legacy_value_' || "id", "tenantId", "id", 'legacy_reference_' || "tenantId", trim("referenceNo"), upper(trim("referenceNo")), NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "TransportTrip" WHERE "referenceNo" IS NOT NULL AND trim("referenceNo") <> '' ON CONFLICT DO NOTHING;

INSERT INTO "TransportAssignmentTrailer" ("id", "tenantId", "assignmentId", "trailerId", "position", "createdAt")
SELECT 'legacy_trailer_' || "id", "tenantId", "id", "trailerId", 0, "assignedAt" FROM "TransportAssignment" WHERE "trailerId" IS NOT NULL ON CONFLICT DO NOTHING;

INSERT INTO "TransportAssignmentDriver" ("id", "tenantId", "assignmentId", "driverId", "role", "position", "createdAt")
SELECT 'legacy_driver_primary_' || "id", "tenantId", "id", "driverId", 'PRIMARY', 0, "assignedAt" FROM "TransportAssignment" ON CONFLICT DO NOTHING;

INSERT INTO "TransportAssignmentDriver" ("id", "tenantId", "assignmentId", "driverId", "role", "position", "createdAt")
SELECT 'legacy_driver_secondary_' || "id", "tenantId", "id", "secondDriverId", 'SECONDARY', 1, "assignedAt" FROM "TransportAssignment" WHERE "secondDriverId" IS NOT NULL ON CONFLICT DO NOTHING;

INSERT INTO "TransportTripEvent" ("id", "tenantId", "tripId", "type", "toValue", "reason", "occurredAt")
SELECT 'legacy_event_' || "id", "tenantId", "id", 'LEGACY_MIGRATED', "status", 'Viaje existente incorporado a la arquitectura de despacho configurable.', "createdAt" FROM "TransportTrip" ON CONFLICT DO NOTHING;

INSERT INTO "TransportSequence" ("id", "tenantId", "branchId", "kind", "year", "prefix", "nextNumber", "createdAt", "updatedAt")
SELECT 'seq_trip_' || "tenantId" || '_' || "branchId" || '_' || EXTRACT(YEAR FROM "scheduledStartAt")::INTEGER, "tenantId", "branchId", 'TRIP', EXTRACT(YEAR FROM "scheduledStartAt")::INTEGER, CASE WHEN position('-' in MIN("code")) > 0 THEN substring(MIN("code") from 1 for position('-' in MIN("code")) - 1) ELSE 'VIA' END, MAX(CAST(replace(right("code", 6), '-', '') AS INTEGER)) + 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "TransportTrip" GROUP BY "tenantId", "branchId", EXTRACT(YEAR FROM "scheduledStartAt") ON CONFLICT DO NOTHING;

INSERT INTO "TransportSequence" ("id", "tenantId", "branchId", "kind", "year", "prefix", "nextNumber", "createdAt", "updatedAt")
SELECT 'seq_operation_' || "tenantId" || '_' || "branchId" || '_' || EXTRACT(YEAR FROM "plannedStartAt")::INTEGER, "tenantId", "branchId", 'OPERATION', EXTRACT(YEAR FROM "plannedStartAt")::INTEGER, CASE WHEN position('-' in MIN("code")) > 0 THEN substring(MIN("code") from 1 for position('-' in MIN("code")) - 1) ELSE 'OPE' END, MAX(CAST(replace(right("code", 6), '-', '') AS INTEGER)) + 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "TransportOperation" GROUP BY "tenantId", "branchId", EXTRACT(YEAR FROM "plannedStartAt") ON CONFLICT DO NOTHING;
