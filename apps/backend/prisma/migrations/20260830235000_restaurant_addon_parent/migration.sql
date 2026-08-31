ALTER TABLE "OrderItem" ADD COLUMN "parentProductId" TEXT;
CREATE INDEX "OrderItem_parentProductId_idx" ON "OrderItem"("parentProductId");
