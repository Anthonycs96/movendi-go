-- Preserve the single-shift rule for existing business adapters (slot OPEN/null).
-- Minimarket uses an explicit REGISTER:<normalized-name> slot. No financial rows change.
DROP INDEX "CashSession_one_open_per_branch";
CREATE UNIQUE INDEX "CashSession_one_open_per_branch" ON "CashSession"("tenantId", "branchId")
WHERE "status" = 'OPEN' AND ("activeSlot" IS NULL OR "activeSlot" NOT LIKE 'REGISTER:%');
-- A cashier must close their own shift before opening another named register.
CREATE UNIQUE INDEX "CashSession_one_retail_shift_per_actor" ON "CashSession"("tenantId", "branchId", "openedById")
WHERE "status" = 'OPEN' AND "activeSlot" LIKE 'REGISTER:%';
