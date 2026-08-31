-- Baseline de Transporte para instalaciones SQLite creadas desde cero.
--
-- La primera versión del módulo se incorporó mediante `db push`, por lo que la
-- migración de la fase 2 asumía que estas tablas ya existían. Los `IF NOT
-- EXISTS` permiten aplicar este baseline también en bases de desarrollo que ya
-- poseen las tablas sin alterar ni perder información.

CREATE TABLE IF NOT EXISTS "TransportParty" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "documentType" TEXT NOT NULL DEFAULT 'RUC',
    "documentNo" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportParty_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "TransportLocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "district" TEXT,
    "province" TEXT,
    "department" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportLocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "TransportRoute" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "originId" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "distanceKm" REAL NOT NULL,
    "estimatedMinutes" INTEGER NOT NULL,
    "tollEstimateCents" INTEGER NOT NULL DEFAULT 0,
    "baseFreightCents" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportRoute_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportRoute_originId_fkey" FOREIGN KEY ("originId") REFERENCES "TransportLocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TransportRoute_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "TransportLocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "TransportVehicle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "capacityKg" REAL,
    "odometerKm" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "technicalDueAt" DATETIME,
    "soatDueAt" DATETIME,
    "gpsDeviceId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportVehicle_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "TransportTrailer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "type" TEXT NOT NULL,
    "capacityKg" REAL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportTrailer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "TransportDriver" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "documentNo" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "licenseNo" TEXT NOT NULL,
    "licenseClass" TEXT NOT NULL,
    "licenseDueAt" DATETIME NOT NULL,
    "hireDate" DATETIME,
    "workRegimeName" TEXT NOT NULL DEFAULT '6x1',
    "workDays" INTEGER NOT NULL DEFAULT 6,
    "restDays" INTEGER NOT NULL DEFAULT 1,
    "workCycleAnchor" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportDriver_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "TransportDriverLeave" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportDriverLeave_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportDriverLeave_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "TransportDriver" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "TransportWorkLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "workDate" DATETIME NOT NULL,
    "scheduledType" TEXT NOT NULL DEFAULT 'WORK',
    "clockInAt" DATETIME,
    "clockOutAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportWorkLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportWorkLog_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "TransportDriver" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "TransportTrip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "cargoDescription" TEXT NOT NULL,
    "cargoWeightKg" REAL,
    "scheduledStartAt" DATETIME NOT NULL,
    "scheduledEndAt" DATETIME NOT NULL,
    "actualStartAt" DATETIME,
    "actualEndAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "referenceNo" TEXT,
    "notes" TEXT,
    "freightCents" INTEGER NOT NULL DEFAULT 0,
    "budgetCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportTrip_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportTrip_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "TransportParty" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TransportTrip_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "TransportRoute" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "TransportAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "trailerId" TEXT,
    "driverId" TEXT NOT NULL,
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" DATETIME,
    "reason" TEXT,
    CONSTRAINT "TransportAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportAssignment_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "TransportTrip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportAssignment_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "TransportVehicle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TransportAssignment_trailerId_fkey" FOREIGN KEY ("trailerId") REFERENCES "TransportTrailer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TransportAssignment_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "TransportDriver" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "TransportTrackingEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" REAL,
    "longitude" REAL,
    "odometerKm" REAL,
    "description" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    CONSTRAINT "TransportTrackingEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportTrackingEvent_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "TransportTrip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "TransportDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "number" TEXT,
    "issuedAt" DATETIME,
    "expiresAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'VALID',
    "fileUrl" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "TransportIncident" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "occurredAt" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "resolution" TEXT,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportIncident_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportIncident_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "TransportTrip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "TransportExpense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "tripId" TEXT,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "receiptNo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportExpense_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportExpense_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "TransportTrip" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "TransportSettlement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "incomeCents" INTEGER NOT NULL,
    "expenseCents" INTEGER NOT NULL,
    "balanceCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "closedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportSettlement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportSettlement_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "TransportTrip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "TransportPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "tripId" TEXT,
    "direction" TEXT NOT NULL,
    "partyType" TEXT NOT NULL,
    "partyId" TEXT,
    "category" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "paidAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TransportPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportPayment_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "TransportTrip" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "TransportFuelLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "tripId" TEXT,
    "vehicleId" TEXT NOT NULL,
    "loadedAt" DATETIME NOT NULL,
    "station" TEXT NOT NULL,
    "liters" REAL NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "odometerKm" REAL NOT NULL,
    "invoiceNo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TransportFuelLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportFuelLog_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "TransportTrip" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TransportFuelLog_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "TransportVehicle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "TransportMaintenanceOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "scheduledAt" DATETIME,
    "completedAt" DATETIME,
    "odometerKm" REAL,
    "estimatedCents" INTEGER NOT NULL DEFAULT 0,
    "actualCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportMaintenanceOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportMaintenanceOrder_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "TransportVehicle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "TransportTire" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "serialNo" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT,
    "size" TEXT NOT NULL,
    "purchaseAt" DATETIME,
    "purchaseCents" INTEGER NOT NULL DEFAULT 0,
    "initialTreadMm" REAL,
    "currentTreadMm" REAL,
    "status" TEXT NOT NULL DEFAULT 'STOCK',
    "currentVehicleId" TEXT,
    "currentPosition" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportTire_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "TransportTireEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "tireId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "type" TEXT NOT NULL,
    "position" TEXT,
    "treadMm" REAL,
    "odometerKm" REAL,
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TransportTireEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportTireEvent_tireId_fkey" FOREIGN KEY ("tireId") REFERENCES "TransportTire" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportTireEvent_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "TransportVehicle" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "TransportParty_tenantId_documentNo_kind_key" ON "TransportParty"("tenantId", "documentNo", "kind");
CREATE INDEX IF NOT EXISTS "TransportParty_tenantId_kind_active_idx" ON "TransportParty"("tenantId", "kind", "active");
CREATE UNIQUE INDEX IF NOT EXISTS "TransportLocation_tenantId_code_key" ON "TransportLocation"("tenantId", "code");
CREATE INDEX IF NOT EXISTS "TransportLocation_tenantId_active_idx" ON "TransportLocation"("tenantId", "active");
CREATE UNIQUE INDEX IF NOT EXISTS "TransportRoute_tenantId_code_key" ON "TransportRoute"("tenantId", "code");
CREATE INDEX IF NOT EXISTS "TransportRoute_tenantId_originId_destinationId_active_idx" ON "TransportRoute"("tenantId", "originId", "destinationId", "active");
CREATE UNIQUE INDEX IF NOT EXISTS "TransportVehicle_tenantId_plate_key" ON "TransportVehicle"("tenantId", "plate");
CREATE INDEX IF NOT EXISTS "TransportVehicle_tenantId_status_active_idx" ON "TransportVehicle"("tenantId", "status", "active");
CREATE UNIQUE INDEX IF NOT EXISTS "TransportTrailer_tenantId_plate_key" ON "TransportTrailer"("tenantId", "plate");
CREATE INDEX IF NOT EXISTS "TransportTrailer_tenantId_status_active_idx" ON "TransportTrailer"("tenantId", "status", "active");
CREATE UNIQUE INDEX IF NOT EXISTS "TransportDriver_tenantId_documentNo_key" ON "TransportDriver"("tenantId", "documentNo");
CREATE UNIQUE INDEX IF NOT EXISTS "TransportDriver_tenantId_licenseNo_key" ON "TransportDriver"("tenantId", "licenseNo");
CREATE INDEX IF NOT EXISTS "TransportDriver_tenantId_status_active_idx" ON "TransportDriver"("tenantId", "status", "active");
CREATE INDEX IF NOT EXISTS "TransportDriverLeave_tenantId_driverId_startsAt_endsAt_idx" ON "TransportDriverLeave"("tenantId", "driverId", "startsAt", "endsAt");
CREATE UNIQUE INDEX IF NOT EXISTS "TransportWorkLog_driverId_workDate_key" ON "TransportWorkLog"("driverId", "workDate");
CREATE INDEX IF NOT EXISTS "TransportWorkLog_tenantId_workDate_status_idx" ON "TransportWorkLog"("tenantId", "workDate", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "TransportTrip_tenantId_code_key" ON "TransportTrip"("tenantId", "code");
CREATE INDEX IF NOT EXISTS "TransportTrip_tenantId_branchId_scheduledStartAt_idx" ON "TransportTrip"("tenantId", "branchId", "scheduledStartAt");
CREATE INDEX IF NOT EXISTS "TransportTrip_tenantId_status_idx" ON "TransportTrip"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "TransportAssignment_tenantId_tripId_status_idx" ON "TransportAssignment"("tenantId", "tripId", "status");
CREATE INDEX IF NOT EXISTS "TransportAssignment_tenantId_driverId_startsAt_endsAt_idx" ON "TransportAssignment"("tenantId", "driverId", "startsAt", "endsAt");
CREATE INDEX IF NOT EXISTS "TransportAssignment_tenantId_vehicleId_startsAt_endsAt_idx" ON "TransportAssignment"("tenantId", "vehicleId", "startsAt", "endsAt");
CREATE INDEX IF NOT EXISTS "TransportTrackingEvent_tenantId_tripId_recordedAt_idx" ON "TransportTrackingEvent"("tenantId", "tripId", "recordedAt");
CREATE INDEX IF NOT EXISTS "TransportDocument_tenantId_ownerType_ownerId_idx" ON "TransportDocument"("tenantId", "ownerType", "ownerId");
CREATE INDEX IF NOT EXISTS "TransportDocument_tenantId_expiresAt_status_idx" ON "TransportDocument"("tenantId", "expiresAt", "status");
CREATE INDEX IF NOT EXISTS "TransportIncident_tenantId_status_severity_idx" ON "TransportIncident"("tenantId", "status", "severity");
CREATE INDEX IF NOT EXISTS "TransportExpense_tenantId_tripId_status_idx" ON "TransportExpense"("tenantId", "tripId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "TransportSettlement_tripId_key" ON "TransportSettlement"("tripId");
CREATE INDEX IF NOT EXISTS "TransportSettlement_tenantId_status_idx" ON "TransportSettlement"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "TransportPayment_tenantId_tripId_paidAt_idx" ON "TransportPayment"("tenantId", "tripId", "paidAt");
CREATE INDEX IF NOT EXISTS "TransportFuelLog_tenantId_vehicleId_loadedAt_idx" ON "TransportFuelLog"("tenantId", "vehicleId", "loadedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "TransportMaintenanceOrder_tenantId_code_key" ON "TransportMaintenanceOrder"("tenantId", "code");
CREATE INDEX IF NOT EXISTS "TransportMaintenanceOrder_tenantId_status_scheduledAt_idx" ON "TransportMaintenanceOrder"("tenantId", "status", "scheduledAt");
CREATE UNIQUE INDEX IF NOT EXISTS "TransportTire_tenantId_serialNo_key" ON "TransportTire"("tenantId", "serialNo");
CREATE INDEX IF NOT EXISTS "TransportTire_tenantId_status_active_idx" ON "TransportTire"("tenantId", "status", "active");
CREATE INDEX IF NOT EXISTS "TransportTireEvent_tenantId_tireId_occurredAt_idx" ON "TransportTireEvent"("tenantId", "tireId", "occurredAt");
