-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "readyAt" TIMESTAMP(3),
ADD COLUMN     "readyByUserId" TEXT,
ADD COLUMN     "servedAt" TIMESTAMP(3),
ADD COLUMN     "servedByUserId" TEXT,
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "startedByUserId" TEXT;

-- AlterTable
ALTER TABLE "CashSession" ADD COLUMN     "cashRegisterId" TEXT;

-- CreateTable
CREATE TABLE "CashRegister" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashRegister_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashRegister_tenantId_branchId_active_idx" ON "CashRegister"("tenantId", "branchId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "CashRegister_tenantId_branchId_nameKey_key" ON "CashRegister"("tenantId", "branchId", "nameKey");

-- AddForeignKey
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "CashRegister"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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

UPDATE "Role" SET "permissions" = ("permissions"::jsonb || '["restaurant:orders:serve"]'::jsonb)::text
WHERE "tenantId" IN (SELECT "id" FROM "Tenant" WHERE "type" = 'RESTAURANT')
AND "permissions"::jsonb ? 'restaurant:orders:write' AND NOT "permissions"::jsonb ? 'restaurant:orders:serve';

CREATE INDEX "CashSession_cashRegisterId_status_idx" ON "CashSession"("cashRegisterId", "status");
