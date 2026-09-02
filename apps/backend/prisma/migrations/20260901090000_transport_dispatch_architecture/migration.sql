-- CreateTable
CREATE TABLE "TransportSequence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "prefix" TEXT NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportSequence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransportAssignmentTrailer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "trailerId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TransportAssignmentTrailer_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "TransportAssignment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportAssignmentTrailer_trailerId_fkey" FOREIGN KEY ("trailerId") REFERENCES "TransportTrailer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransportAssignmentDriver" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'PRIMARY',
    "position" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TransportAssignmentDriver_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "TransportAssignment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportAssignmentDriver_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "TransportDriver" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransportTripEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT,
    "reason" TEXT,
    "payload" TEXT,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    CONSTRAINT "TransportTripEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportTripEvent_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "TransportTrip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransportCustomFieldDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL DEFAULT 'TRIP',
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "dataType" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "uniqueValue" BOOLEAN NOT NULL DEFAULT false,
    "duplicatePolicy" TEXT NOT NULL DEFAULT 'IGNORE',
    "showInDispatch" BOOLEAN NOT NULL DEFAULT false,
    "searchable" BOOLEAN NOT NULL DEFAULT false,
    "filterable" BOOLEAN NOT NULL DEFAULT false,
    "importable" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportCustomFieldDefinition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransportCustomFieldScope" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "definitionId" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL DEFAULT 'TENANT',
    "scopeId" TEXT NOT NULL,
    "required" BOOLEAN,
    "sortOrder" INTEGER,
    CONSTRAINT "TransportCustomFieldScope_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "TransportCustomFieldDefinition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransportCustomFieldOption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "definitionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "TransportCustomFieldOption_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "TransportCustomFieldDefinition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransportCustomFieldValue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "textValue" TEXT,
    "numberValue" REAL,
    "dateValue" DATETIME,
    "booleanValue" BOOLEAN,
    "normalizedValue" TEXT,
    "uniqueKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportCustomFieldValue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportCustomFieldValue_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "TransportTrip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportCustomFieldValue_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "TransportCustomFieldDefinition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransportWorkflowDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL DEFAULT 'TENANT',
    "scopeId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportWorkflowDefinition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransportWorkflowState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workflowId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#64748b',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "initial" BOOLEAN NOT NULL DEFAULT false,
    "terminal" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "TransportWorkflowState_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "TransportWorkflowDefinition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransportWorkflowTransition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workflowId" TEXT NOT NULL,
    "fromStateId" TEXT NOT NULL,
    "toStateId" TEXT NOT NULL,
    "label" TEXT,
    "requiresReason" BOOLEAN NOT NULL DEFAULT false,
    "notifyClient" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "TransportWorkflowTransition_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "TransportWorkflowDefinition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportWorkflowTransition_fromStateId_fkey" FOREIGN KEY ("fromStateId") REFERENCES "TransportWorkflowState" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportWorkflowTransition_toStateId_fkey" FOREIGN KEY ("toStateId") REFERENCES "TransportWorkflowState" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransportResourcePreset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL DEFAULT 'TENANT',
    "scopeId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportResourcePreset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportResourcePreset_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "TransportVehicle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransportResourcePresetTrailer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "presetId" TEXT NOT NULL,
    "trailerId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    CONSTRAINT "TransportResourcePresetTrailer_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "TransportResourcePreset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportResourcePresetTrailer_trailerId_fkey" FOREIGN KEY ("trailerId") REFERENCES "TransportTrailer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransportResourcePresetDriver" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "presetId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'PRIMARY',
    "position" INTEGER NOT NULL,
    CONSTRAINT "TransportResourcePresetDriver_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "TransportResourcePreset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportResourcePresetDriver_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "TransportDriver" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransportImportProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL DEFAULT 'TENANT',
    "scopeId" TEXT NOT NULL,
    "worksheetName" TEXT,
    "headerRow" INTEGER NOT NULL DEFAULT 1,
    "identityStrategy" TEXT NOT NULL DEFAULT 'INTERNAL_CODE',
    "identityFieldId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportImportProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportImportProfile_identityFieldId_fkey" FOREIGN KEY ("identityFieldId") REFERENCES "TransportCustomFieldDefinition" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransportImportColumnMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "sourceColumn" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL,
    "fieldId" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "defaultValue" TEXT,
    CONSTRAINT "TransportImportColumnMapping_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "TransportImportProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportImportColumnMapping_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "TransportCustomFieldDefinition" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransportImportBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "profileId" TEXT,
    "fileName" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'PREVIEW',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "createdRows" INTEGER NOT NULL DEFAULT 0,
    "updatedRows" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" DATETIME,
    CONSTRAINT "TransportImportBatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportImportBatch_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "TransportImportProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransportImportRowResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "tripId" TEXT,
    "rawData" TEXT NOT NULL,
    "normalizedData" TEXT,
    "errors" TEXT,
    "warnings" TEXT,
    CONSTRAINT "TransportImportRowResult_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "TransportImportBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportImportRowResult_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "TransportTrip" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransportDocumentTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL DEFAULT 'TENANT',
    "scopeId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportDocumentTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransportDispatchView" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL DEFAULT 'TENANT',
    "scopeId" TEXT NOT NULL,
    "columns" TEXT NOT NULL DEFAULT '[]',
    "filters" TEXT NOT NULL DEFAULT '{}',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportDispatchView_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TransportTrip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "operationId" TEXT,
    "customerId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "cargoDescription" TEXT NOT NULL,
    "cargoWeightKg" REAL,
    "scheduledStartAt" DATETIME NOT NULL,
    "scheduledEndAt" DATETIME NOT NULL,
    "appointmentStartAt" DATETIME,
    "appointmentEndAt" DATETIME,
    "appointmentStatus" TEXT NOT NULL DEFAULT 'NONE',
    "actualStartAt" DATETIME,
    "actualEndAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "workflowDefinitionId" TEXT,
    "workflowStateId" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "referenceNo" TEXT,
    "notes" TEXT,
    "freightCents" INTEGER NOT NULL DEFAULT 0,
    "budgetCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportTrip_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportTrip_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "TransportOperation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TransportTrip_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "TransportParty" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TransportTrip_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "TransportRoute" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TransportTrip_workflowDefinitionId_fkey" FOREIGN KEY ("workflowDefinitionId") REFERENCES "TransportWorkflowDefinition" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TransportTrip_workflowStateId_fkey" FOREIGN KEY ("workflowStateId") REFERENCES "TransportWorkflowState" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TransportTrip" ("actualEndAt", "actualStartAt", "branchId", "budgetCents", "cargoDescription", "cargoWeightKg", "code", "createdAt", "customerId", "freightCents", "id", "notes", "operationId", "priority", "referenceNo", "routeId", "scheduledEndAt", "scheduledStartAt", "serviceType", "status", "tenantId", "updatedAt") SELECT "actualEndAt", "actualStartAt", "branchId", "budgetCents", "cargoDescription", "cargoWeightKg", "code", "createdAt", "customerId", "freightCents", "id", "notes", "operationId", "priority", "referenceNo", "routeId", "scheduledEndAt", "scheduledStartAt", "serviceType", "status", "tenantId", "updatedAt" FROM "TransportTrip";
DROP TABLE "TransportTrip";
ALTER TABLE "new_TransportTrip" RENAME TO "TransportTrip";
CREATE INDEX "TransportTrip_tenantId_branchId_scheduledStartAt_idx" ON "TransportTrip"("tenantId", "branchId", "scheduledStartAt");
CREATE INDEX "TransportTrip_tenantId_branchId_operationId_scheduledStartAt_idx" ON "TransportTrip"("tenantId", "branchId", "operationId", "scheduledStartAt");
CREATE INDEX "TransportTrip_tenantId_status_idx" ON "TransportTrip"("tenantId", "status");
CREATE INDEX "TransportTrip_tenantId_branchId_status_scheduledStartAt_idx" ON "TransportTrip"("tenantId", "branchId", "status", "scheduledStartAt");
CREATE UNIQUE INDEX "TransportTrip_tenantId_code_key" ON "TransportTrip"("tenantId", "code");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "TransportSequence_tenantId_kind_year_idx" ON "TransportSequence"("tenantId", "kind", "year");

-- CreateIndex
CREATE UNIQUE INDEX "TransportSequence_tenantId_branchId_kind_year_key" ON "TransportSequence"("tenantId", "branchId", "kind", "year");

-- CreateIndex
CREATE INDEX "TransportAssignmentTrailer_tenantId_trailerId_idx" ON "TransportAssignmentTrailer"("tenantId", "trailerId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportAssignmentTrailer_assignmentId_trailerId_key" ON "TransportAssignmentTrailer"("assignmentId", "trailerId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportAssignmentTrailer_assignmentId_position_key" ON "TransportAssignmentTrailer"("assignmentId", "position");

-- CreateIndex
CREATE INDEX "TransportAssignmentDriver_tenantId_driverId_idx" ON "TransportAssignmentDriver"("tenantId", "driverId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportAssignmentDriver_assignmentId_driverId_key" ON "TransportAssignmentDriver"("assignmentId", "driverId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportAssignmentDriver_assignmentId_position_key" ON "TransportAssignmentDriver"("assignmentId", "position");

-- CreateIndex
CREATE INDEX "TransportTripEvent_tenantId_tripId_occurredAt_idx" ON "TransportTripEvent"("tenantId", "tripId", "occurredAt");

-- CreateIndex
CREATE INDEX "TransportTripEvent_tenantId_type_occurredAt_idx" ON "TransportTripEvent"("tenantId", "type", "occurredAt");

-- CreateIndex
CREATE INDEX "TransportCustomFieldDefinition_tenantId_entityType_active_sortOrder_idx" ON "TransportCustomFieldDefinition"("tenantId", "entityType", "active", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "TransportCustomFieldDefinition_tenantId_entityType_code_key" ON "TransportCustomFieldDefinition"("tenantId", "entityType", "code");

-- CreateIndex
CREATE INDEX "TransportCustomFieldScope_scopeType_scopeId_idx" ON "TransportCustomFieldScope"("scopeType", "scopeId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportCustomFieldScope_definitionId_scopeType_scopeId_key" ON "TransportCustomFieldScope"("definitionId", "scopeType", "scopeId");

-- CreateIndex
CREATE INDEX "TransportCustomFieldOption_definitionId_active_sortOrder_idx" ON "TransportCustomFieldOption"("definitionId", "active", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "TransportCustomFieldOption_definitionId_code_key" ON "TransportCustomFieldOption"("definitionId", "code");

-- CreateIndex
CREATE INDEX "TransportCustomFieldValue_tenantId_definitionId_normalizedValue_idx" ON "TransportCustomFieldValue"("tenantId", "definitionId", "normalizedValue");

-- CreateIndex
CREATE UNIQUE INDEX "TransportCustomFieldValue_tripId_definitionId_key" ON "TransportCustomFieldValue"("tripId", "definitionId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportCustomFieldValue_tenantId_definitionId_uniqueKey_key" ON "TransportCustomFieldValue"("tenantId", "definitionId", "uniqueKey");

-- CreateIndex
CREATE INDEX "TransportWorkflowDefinition_tenantId_scopeType_scopeId_active_idx" ON "TransportWorkflowDefinition"("tenantId", "scopeType", "scopeId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "TransportWorkflowDefinition_tenantId_code_key" ON "TransportWorkflowDefinition"("tenantId", "code");

-- CreateIndex
CREATE INDEX "TransportWorkflowState_workflowId_active_sortOrder_idx" ON "TransportWorkflowState"("workflowId", "active", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "TransportWorkflowState_workflowId_code_key" ON "TransportWorkflowState"("workflowId", "code");

-- CreateIndex
CREATE INDEX "TransportWorkflowTransition_workflowId_fromStateId_active_idx" ON "TransportWorkflowTransition"("workflowId", "fromStateId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "TransportWorkflowTransition_workflowId_fromStateId_toStateId_key" ON "TransportWorkflowTransition"("workflowId", "fromStateId", "toStateId");

-- CreateIndex
CREATE INDEX "TransportResourcePreset_tenantId_scopeType_scopeId_active_idx" ON "TransportResourcePreset"("tenantId", "scopeType", "scopeId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "TransportResourcePreset_tenantId_code_key" ON "TransportResourcePreset"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "TransportResourcePresetTrailer_presetId_trailerId_key" ON "TransportResourcePresetTrailer"("presetId", "trailerId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportResourcePresetTrailer_presetId_position_key" ON "TransportResourcePresetTrailer"("presetId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "TransportResourcePresetDriver_presetId_driverId_key" ON "TransportResourcePresetDriver"("presetId", "driverId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportResourcePresetDriver_presetId_position_key" ON "TransportResourcePresetDriver"("presetId", "position");

-- CreateIndex
CREATE INDEX "TransportImportProfile_tenantId_scopeType_scopeId_active_idx" ON "TransportImportProfile"("tenantId", "scopeType", "scopeId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "TransportImportProfile_tenantId_code_key" ON "TransportImportProfile"("tenantId", "code");

-- CreateIndex
CREATE INDEX "TransportImportColumnMapping_profileId_targetType_targetKey_idx" ON "TransportImportColumnMapping"("profileId", "targetType", "targetKey");

-- CreateIndex
CREATE UNIQUE INDEX "TransportImportColumnMapping_profileId_sourceColumn_key" ON "TransportImportColumnMapping"("profileId", "sourceColumn");

-- CreateIndex
CREATE INDEX "TransportImportBatch_tenantId_createdAt_idx" ON "TransportImportBatch"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "TransportImportBatch_tenantId_status_idx" ON "TransportImportBatch"("tenantId", "status");

-- CreateIndex
CREATE INDEX "TransportImportRowResult_batchId_status_idx" ON "TransportImportRowResult"("batchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TransportImportRowResult_batchId_rowNumber_key" ON "TransportImportRowResult"("batchId", "rowNumber");

-- CreateIndex
CREATE INDEX "TransportDocumentTemplate_tenantId_scopeType_scopeId_active_idx" ON "TransportDocumentTemplate"("tenantId", "scopeType", "scopeId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "TransportDocumentTemplate_tenantId_code_key" ON "TransportDocumentTemplate"("tenantId", "code");

-- CreateIndex
CREATE INDEX "TransportDispatchView_tenantId_scopeType_scopeId_active_idx" ON "TransportDispatchView"("tenantId", "scopeType", "scopeId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "TransportDispatchView_tenantId_code_key" ON "TransportDispatchView"("tenantId", "code");
