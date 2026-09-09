ALTER TABLE "Sale" ADD COLUMN "loyaltyPointsRedeemed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Sale" ADD COLUMN "loyaltyDiscountCents" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "RestaurantMenuImport" (
 "id" TEXT NOT NULL PRIMARY KEY, "tenantId" TEXT NOT NULL, "branchId" TEXT NOT NULL, "actorId" TEXT NOT NULL,
 "filename" TEXT NOT NULL, "sourceHash" TEXT NOT NULL, "pageCount" INTEGER NOT NULL,
 "nextPage" INTEGER NOT NULL DEFAULT 0, "attempts" INTEGER NOT NULL DEFAULT 0, "status" TEXT NOT NULL DEFAULT 'DRAFT',
 "rows" TEXT NOT NULL DEFAULT '[]', "lastError" TEXT, "leaseUntil" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "RestaurantMenuImport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "RestaurantMenuImport_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "RestaurantMenuImport_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "RestaurantMenuImport_tenantId_branchId_createdAt_idx" ON "RestaurantMenuImport"("tenantId", "branchId", "createdAt");
CREATE INDEX "AuditLog_tenantId_branchId_createdAt_id_idx" ON "AuditLog"("tenantId", "branchId", "createdAt", "id");
ALTER TABLE "RestaurantPrintJob" ADD COLUMN "deliveryAttempt" INTEGER NOT NULL DEFAULT 0;
