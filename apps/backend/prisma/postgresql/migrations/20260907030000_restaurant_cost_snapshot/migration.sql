-- Historical costs cannot be reconstructed from today's catalog. Keep legacy
-- lines nullable; all newly ordered lines preserve the cost at ordering time.
ALTER TABLE "OrderItem" ADD COLUMN "unitCostCents" INTEGER;
