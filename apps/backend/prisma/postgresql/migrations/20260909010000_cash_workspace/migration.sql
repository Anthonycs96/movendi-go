ALTER TABLE "CashSession" ADD COLUMN "registerName" TEXT NOT NULL DEFAULT 'Caja principal';
ALTER TABLE "CashSession" ADD COLUMN "openingNote" TEXT;
ALTER TABLE "CashSession" ADD COLUMN "closingNote" TEXT;
ALTER TABLE "CashSession" ADD COLUMN "activeSlot" TEXT;
ALTER TABLE "CashMovement" ADD COLUMN "notes" TEXT;
UPDATE "CashSession" SET "activeSlot" = 'OPEN' WHERE "status" = 'OPEN' AND (SELECT COUNT(*) FROM "CashSession" AS other WHERE other."tenantId" = "CashSession"."tenantId" AND other."branchId" = "CashSession"."branchId" AND other."status" = 'OPEN') = 1;
CREATE UNIQUE INDEX "CashSession_tenantId_branchId_activeSlot_key" ON "CashSession"("tenantId", "branchId", "activeSlot");
