-- Baseline de las áreas de preparación creadas originalmente mediante
-- sincronización de esquema. Debe ejecutarse antes de la migración que agrega
-- detección automática y conserva compatibilidad con bases locales existentes.

CREATE TABLE IF NOT EXISTS "PreparationArea" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PreparationArea_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PreparationArea_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "PreparationArea_tenantId_branchId_name_key" ON "PreparationArea"("tenantId", "branchId", "name");
CREATE INDEX IF NOT EXISTS "PreparationArea_tenantId_branchId_active_idx" ON "PreparationArea"("tenantId", "branchId", "active");
