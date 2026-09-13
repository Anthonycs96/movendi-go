ALTER TABLE "CashSession" ADD COLUMN "balanceBasis" TEXT NOT NULL DEFAULT 'CASH_ONLY';

-- Preserve the meaning of historical barber balances, including open sessions.
UPDATE "CashSession" SET "balanceBasis" = 'ALL_PAYMENTS'
WHERE "tenantId" IN (SELECT "id" FROM "Tenant" WHERE "type" = 'BARBERSHOP');
