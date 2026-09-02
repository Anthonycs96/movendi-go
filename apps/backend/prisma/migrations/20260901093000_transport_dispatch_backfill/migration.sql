-- Preserve legacy transport data in the new relational architecture.
INSERT OR IGNORE INTO "TransportCustomFieldDefinition" ("id", "tenantId", "entityType", "code", "label", "description", "dataType", "required", "uniqueValue", "duplicatePolicy", "showInDispatch", "searchable", "filterable", "importable", "active", "sortOrder", "createdAt", "updatedAt")
SELECT 'legacy_reference_' || "tenantId", "tenantId", 'TRIP', 'LEGACY_REFERENCE', 'Referencia heredada', 'Migrado desde referenceNo; desactívalo cuando el cliente use sus propios campos.', 'TEXT', false, false, 'WARN', true, true, true, true, true, 999, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "TransportTrip" WHERE "referenceNo" IS NOT NULL AND trim("referenceNo") <> '' GROUP BY "tenantId";

INSERT OR IGNORE INTO "TransportCustomFieldScope" ("id", "definitionId", "scopeType", "scopeId")
SELECT 'legacy_scope_' || "tenantId", 'legacy_reference_' || "tenantId", 'TENANT', "tenantId"
FROM "TransportTrip" WHERE "referenceNo" IS NOT NULL AND trim("referenceNo") <> '' GROUP BY "tenantId";

INSERT OR IGNORE INTO "TransportCustomFieldValue" ("id", "tenantId", "tripId", "definitionId", "textValue", "normalizedValue", "uniqueKey", "createdAt", "updatedAt")
SELECT 'legacy_value_' || "id", "tenantId", "id", 'legacy_reference_' || "tenantId", trim("referenceNo"), upper(trim("referenceNo")), NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "TransportTrip" WHERE "referenceNo" IS NOT NULL AND trim("referenceNo") <> '';

INSERT OR IGNORE INTO "TransportAssignmentTrailer" ("id", "tenantId", "assignmentId", "trailerId", "position", "createdAt")
SELECT 'legacy_trailer_' || "id", "tenantId", "id", "trailerId", 0, "assignedAt"
FROM "TransportAssignment" WHERE "trailerId" IS NOT NULL;

INSERT OR IGNORE INTO "TransportAssignmentDriver" ("id", "tenantId", "assignmentId", "driverId", "role", "position", "createdAt")
SELECT 'legacy_driver_primary_' || "id", "tenantId", "id", "driverId", 'PRIMARY', 0, "assignedAt" FROM "TransportAssignment";

INSERT OR IGNORE INTO "TransportAssignmentDriver" ("id", "tenantId", "assignmentId", "driverId", "role", "position", "createdAt")
SELECT 'legacy_driver_secondary_' || "id", "tenantId", "id", "secondDriverId", 'SECONDARY', 1, "assignedAt"
FROM "TransportAssignment" WHERE "secondDriverId" IS NOT NULL;

INSERT OR IGNORE INTO "TransportTripEvent" ("id", "tenantId", "tripId", "type", "toValue", "reason", "occurredAt")
SELECT 'legacy_event_' || "id", "tenantId", "id", 'LEGACY_MIGRATED', "status", 'Viaje existente incorporado a la arquitectura de despacho configurable.', "createdAt" FROM "TransportTrip";

INSERT OR IGNORE INTO "TransportSequence" ("id", "tenantId", "branchId", "kind", "year", "prefix", "nextNumber", "createdAt", "updatedAt")
SELECT 'seq_trip_' || "tenantId" || '_' || "branchId" || '_' || strftime('%Y', "scheduledStartAt"), "tenantId", "branchId", 'TRIP', CAST(strftime('%Y', "scheduledStartAt") AS INTEGER), CASE WHEN instr("code", '-') > 0 THEN substr("code", 1, instr("code", '-') - 1) ELSE 'VIA' END, MAX(CAST(replace(substr("code", -6), '-', '') AS INTEGER)) + 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "TransportTrip" GROUP BY "tenantId", "branchId", strftime('%Y', "scheduledStartAt");

INSERT OR IGNORE INTO "TransportSequence" ("id", "tenantId", "branchId", "kind", "year", "prefix", "nextNumber", "createdAt", "updatedAt")
SELECT 'seq_operation_' || "tenantId" || '_' || "branchId" || '_' || strftime('%Y', "plannedStartAt"), "tenantId", "branchId", 'OPERATION', CAST(strftime('%Y', "plannedStartAt") AS INTEGER), CASE WHEN instr("code", '-') > 0 THEN substr("code", 1, instr("code", '-') - 1) ELSE 'OPE' END, MAX(CAST(replace(substr("code", -6), '-', '') AS INTEGER)) + 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "TransportOperation" GROUP BY "tenantId", "branchId", strftime('%Y', "plannedStartAt");
