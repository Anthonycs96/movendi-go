-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN "readyAt" DATETIME;
ALTER TABLE "OrderItem" ADD COLUMN "readyByUserId" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "servedAt" DATETIME;
ALTER TABLE "OrderItem" ADD COLUMN "servedByUserId" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "startedAt" DATETIME;
ALTER TABLE "OrderItem" ADD COLUMN "startedByUserId" TEXT;

-- CreateTable
CREATE TABLE "CashRegister" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CashRegister_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CashRegister_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CashSession" (
    "cashRegisterId" TEXT,
    "balanceBasis" TEXT NOT NULL DEFAULT 'CASH_ONLY',
    "registerName" TEXT NOT NULL DEFAULT 'Caja principal',
    "openingNote" TEXT,
    "closingNote" TEXT,
    "activeSlot" TEXT,
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "openedById" TEXT NOT NULL,
    "closedById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "openingCents" INTEGER NOT NULL DEFAULT 0,
    "expectedCents" INTEGER NOT NULL DEFAULT 0,
    "countedCents" INTEGER,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME,
    CONSTRAINT "CashSession_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "CashRegister" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CashSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CashSession_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CashSession_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CashSession_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CashSession" ("activeSlot", "balanceBasis", "branchId", "closedAt", "closedById", "closingNote", "countedCents", "expectedCents", "id", "openedAt", "openedById", "openingCents", "openingNote", "registerName", "status", "tenantId") SELECT "activeSlot", "balanceBasis", "branchId", "closedAt", "closedById", "closingNote", "countedCents", "expectedCents", "id", "openedAt", "openedById", "openingCents", "openingNote", "registerName", "status", "tenantId" FROM "CashSession";
DROP TABLE "CashSession";
ALTER TABLE "new_CashSession" RENAME TO "CashSession";
CREATE INDEX "CashSession_tenantId_branchId_status_idx" ON "CashSession"("tenantId", "branchId", "status");
CREATE INDEX "CashSession_tenantId_openedAt_idx" ON "CashSession"("tenantId", "openedAt");
CREATE UNIQUE INDEX "CashSession_tenantId_branchId_activeSlot_key" ON "CashSession"("tenantId", "branchId", "activeSlot");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "CashRegister_tenantId_branchId_active_idx" ON "CashRegister"("tenantId", "branchId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "CashRegister_tenantId_branchId_nameKey_key" ON "CashRegister"("tenantId", "branchId", "nameKey");

-- Preserve historical register labels and sessions. Duplicate open physical registers
-- intentionally fail the existing unique activeSlot constraint for manual reconciliation.
INSERT INTO "CashRegister" ("id", "tenantId", "branchId", "name", "nameKey", "updatedAt")
SELECT 'legacy_register_' || MIN(s."id"), s."tenantId", s."branchId", MIN(TRIM(s."registerName")), LOWER(TRIM(s."registerName")), CURRENT_TIMESTAMP
FROM "CashSession" s JOIN "Tenant" t ON t."id" = s."tenantId"
WHERE t."type" = 'RESTAURANT'
GROUP BY s."tenantId", s."branchId", LOWER(TRIM(s."registerName"));
UPDATE "CashSession" SET "cashRegisterId" = (
 SELECT r."id" FROM "CashRegister" r WHERE r."tenantId" = "CashSession"."tenantId"
 AND r."branchId" = "CashSession"."branchId" AND r."nameKey" = LOWER(TRIM("CashSession"."registerName"))
) WHERE "tenantId" IN (SELECT "id" FROM "Tenant" WHERE "type" = 'RESTAURANT');
UPDATE "CashSession" SET "activeSlot" = 'REGISTER_ID:' || "cashRegisterId" WHERE "cashRegisterId" IS NOT NULL AND "status" = 'OPEN';
INSERT INTO "CashRegister" ("id", "tenantId", "branchId", "name", "nameKey", "updatedAt")
SELECT 'default_register_' || b."id", b."tenantId", b."id", 'Caja principal', 'caja principal', CURRENT_TIMESTAMP
FROM "Branch" b JOIN "Tenant" t ON t."id" = b."tenantId" WHERE t."type" = 'RESTAURANT'
AND NOT EXISTS (SELECT 1 FROM "CashRegister" r WHERE r."branchId" = b."id");

-- Existing order operators keep serving access; kitchen-only roles do not gain it.
UPDATE "Role" SET "permissions" = json_insert("permissions", '$[#]', 'restaurant:orders:serve')
WHERE "tenantId" IN (SELECT "id" FROM "Tenant" WHERE "type" = 'RESTAURANT')
AND EXISTS (SELECT 1 FROM json_each("permissions") WHERE value = 'restaurant:orders:write')
AND NOT EXISTS (SELECT 1 FROM json_each("permissions") WHERE value = 'restaurant:orders:serve');

CREATE INDEX "CashSession_cashRegisterId_status_idx" ON "CashSession"("cashRegisterId", "status");
