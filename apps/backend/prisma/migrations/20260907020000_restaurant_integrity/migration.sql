ALTER TABLE "RestaurantOrder" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "RestaurantOrder" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "RestaurantOrder" ADD COLUMN "requestHash" TEXT;
CREATE UNIQUE INDEX "RestaurantOrder_tenantId_branchId_idempotencyKey_key" ON "RestaurantOrder"("tenantId", "branchId", "idempotencyKey");
-- Fail safely if legacy data has simultaneous open tills; never discard balances.
CREATE UNIQUE INDEX "CashSession_one_open_per_branch" ON "CashSession"("tenantId", "branchId") WHERE "status" = 'OPEN';
