-- CreateTable
CREATE TABLE "TransportMaintenancePlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "yearFrom" INTEGER,
    "yearTo" INTEGER,
    "vehicleType" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportMaintenancePlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransportMaintenanceTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "componentType" TEXT NOT NULL,
    "intervalKm" REAL,
    "intervalDays" INTEGER,
    "alertKmBefore" REAL,
    "alertDaysBefore" INTEGER,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "estimatedCents" INTEGER NOT NULL DEFAULT 0,
    "instructions" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportMaintenanceTask_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportMaintenanceTask_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TransportMaintenancePlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransportVehicleComponent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "componentType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "serialNo" TEXT,
    "installedAt" DATETIME,
    "installedOdometerKm" REAL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportVehicleComponent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportVehicleComponent_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "TransportVehicle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransportVehicleMaintenancePlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "baselineKm" REAL NOT NULL,
    "baselineAt" DATETIME NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TransportVehicleMaintenancePlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportVehicleMaintenancePlan_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "TransportVehicle" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportVehicleMaintenancePlan_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TransportMaintenancePlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransportMaintenanceSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "componentId" TEXT,
    "intervalKm" REAL,
    "intervalDays" INTEGER,
    "alertKmBefore" REAL,
    "alertDaysBefore" INTEGER,
    "lastServiceKm" REAL,
    "lastServiceAt" DATETIME,
    "nextDueKm" REAL,
    "nextDueAt" DATETIME,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportMaintenanceSchedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportMaintenanceSchedule_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "TransportVehicle" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportMaintenanceSchedule_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TransportMaintenanceTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportMaintenanceSchedule_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "TransportVehicleComponent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TransportMaintenanceOrder" (
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
    "scheduleId" TEXT,
    "planTaskId" TEXT,
    "componentId" TEXT,
    "cycleKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportMaintenanceOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransportMaintenanceOrder_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "TransportVehicle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TransportMaintenanceOrder_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "TransportMaintenanceSchedule" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TransportMaintenanceOrder_planTaskId_fkey" FOREIGN KEY ("planTaskId") REFERENCES "TransportMaintenanceTask" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TransportMaintenanceOrder_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "TransportVehicleComponent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TransportMaintenanceOrder" ("actualCents", "code", "completedAt", "createdAt", "description", "estimatedCents", "id", "odometerKm", "priority", "scheduledAt", "status", "tenantId", "title", "type", "updatedAt", "vehicleId") SELECT "actualCents", "code", "completedAt", "createdAt", "description", "estimatedCents", "id", "odometerKm", "priority", "scheduledAt", "status", "tenantId", "title", "type", "updatedAt", "vehicleId" FROM "TransportMaintenanceOrder";
DROP TABLE "TransportMaintenanceOrder";
ALTER TABLE "new_TransportMaintenanceOrder" RENAME TO "TransportMaintenanceOrder";
CREATE INDEX "TransportMaintenanceOrder_tenantId_status_scheduledAt_idx" ON "TransportMaintenanceOrder"("tenantId", "status", "scheduledAt");
CREATE INDEX "TransportMaintenanceOrder_tenantId_scheduleId_status_idx" ON "TransportMaintenanceOrder"("tenantId", "scheduleId", "status");
CREATE UNIQUE INDEX "TransportMaintenanceOrder_tenantId_code_key" ON "TransportMaintenanceOrder"("tenantId", "code");
CREATE UNIQUE INDEX "TransportMaintenanceOrder_tenantId_cycleKey_key" ON "TransportMaintenanceOrder"("tenantId", "cycleKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "TransportMaintenancePlan_tenantId_brand_model_active_idx" ON "TransportMaintenancePlan"("tenantId", "brand", "model", "active");
CREATE UNIQUE INDEX "TransportMaintenancePlan_tenantId_code_key" ON "TransportMaintenancePlan"("tenantId", "code");
CREATE INDEX "TransportMaintenanceTask_tenantId_componentType_active_idx" ON "TransportMaintenanceTask"("tenantId", "componentType", "active");
CREATE UNIQUE INDEX "TransportMaintenanceTask_planId_code_key" ON "TransportMaintenanceTask"("planId", "code");
CREATE INDEX "TransportVehicleComponent_tenantId_vehicleId_componentType_active_idx" ON "TransportVehicleComponent"("tenantId", "vehicleId", "componentType", "active");
CREATE UNIQUE INDEX "TransportVehicleComponent_vehicleId_code_key" ON "TransportVehicleComponent"("vehicleId", "code");
CREATE INDEX "TransportVehicleMaintenancePlan_tenantId_vehicleId_active_idx" ON "TransportVehicleMaintenancePlan"("tenantId", "vehicleId", "active");
CREATE UNIQUE INDEX "TransportVehicleMaintenancePlan_vehicleId_planId_key" ON "TransportVehicleMaintenancePlan"("vehicleId", "planId");
CREATE INDEX "TransportMaintenanceSchedule_tenantId_active_nextDueAt_idx" ON "TransportMaintenanceSchedule"("tenantId", "active", "nextDueAt");
CREATE INDEX "TransportMaintenanceSchedule_tenantId_vehicleId_active_idx" ON "TransportMaintenanceSchedule"("tenantId", "vehicleId", "active");
CREATE UNIQUE INDEX "TransportMaintenanceSchedule_vehicleId_taskId_key" ON "TransportMaintenanceSchedule"("vehicleId", "taskId");
