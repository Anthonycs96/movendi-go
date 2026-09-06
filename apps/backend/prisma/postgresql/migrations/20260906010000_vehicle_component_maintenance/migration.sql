CREATE TABLE "TransportMaintenancePlan" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TransportMaintenancePlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TransportMaintenanceTask" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "componentType" TEXT NOT NULL,
    "intervalKm" DOUBLE PRECISION,
    "intervalDays" INTEGER,
    "alertKmBefore" DOUBLE PRECISION,
    "alertDaysBefore" INTEGER,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "estimatedCents" INTEGER NOT NULL DEFAULT 0,
    "instructions" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TransportMaintenanceTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TransportVehicleComponent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "componentType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "serialNo" TEXT,
    "installedAt" TIMESTAMP(3),
    "installedOdometerKm" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TransportVehicleComponent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TransportVehicleMaintenancePlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "baselineKm" DOUBLE PRECISION NOT NULL,
    "baselineAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TransportVehicleMaintenancePlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TransportMaintenanceSchedule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "componentId" TEXT,
    "intervalKm" DOUBLE PRECISION,
    "intervalDays" INTEGER,
    "alertKmBefore" DOUBLE PRECISION,
    "alertDaysBefore" INTEGER,
    "lastServiceKm" DOUBLE PRECISION,
    "lastServiceAt" TIMESTAMP(3),
    "nextDueKm" DOUBLE PRECISION,
    "nextDueAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TransportMaintenanceSchedule_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TransportMaintenanceOrder"
  ADD COLUMN "scheduleId" TEXT,
  ADD COLUMN "planTaskId" TEXT,
  ADD COLUMN "componentId" TEXT,
  ADD COLUMN "cycleKey" TEXT;

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
CREATE INDEX "TransportMaintenanceOrder_tenantId_scheduleId_status_idx" ON "TransportMaintenanceOrder"("tenantId", "scheduleId", "status");
CREATE UNIQUE INDEX "TransportMaintenanceOrder_tenantId_cycleKey_key" ON "TransportMaintenanceOrder"("tenantId", "cycleKey");

ALTER TABLE "TransportMaintenancePlan" ADD CONSTRAINT "TransportMaintenancePlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TransportMaintenanceTask" ADD CONSTRAINT "TransportMaintenanceTask_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TransportMaintenanceTask" ADD CONSTRAINT "TransportMaintenanceTask_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TransportMaintenancePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TransportVehicleComponent" ADD CONSTRAINT "TransportVehicleComponent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TransportVehicleComponent" ADD CONSTRAINT "TransportVehicleComponent_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "TransportVehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TransportVehicleMaintenancePlan" ADD CONSTRAINT "TransportVehicleMaintenancePlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TransportVehicleMaintenancePlan" ADD CONSTRAINT "TransportVehicleMaintenancePlan_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "TransportVehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TransportVehicleMaintenancePlan" ADD CONSTRAINT "TransportVehicleMaintenancePlan_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TransportMaintenancePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransportMaintenanceSchedule" ADD CONSTRAINT "TransportMaintenanceSchedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TransportMaintenanceSchedule" ADD CONSTRAINT "TransportMaintenanceSchedule_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "TransportVehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TransportMaintenanceSchedule" ADD CONSTRAINT "TransportMaintenanceSchedule_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TransportMaintenanceTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TransportMaintenanceSchedule" ADD CONSTRAINT "TransportMaintenanceSchedule_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "TransportVehicleComponent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TransportMaintenanceOrder" ADD CONSTRAINT "TransportMaintenanceOrder_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "TransportMaintenanceSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TransportMaintenanceOrder" ADD CONSTRAINT "TransportMaintenanceOrder_planTaskId_fkey" FOREIGN KEY ("planTaskId") REFERENCES "TransportMaintenanceTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TransportMaintenanceOrder" ADD CONSTRAINT "TransportMaintenanceOrder_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "TransportVehicleComponent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
