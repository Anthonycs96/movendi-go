-- AlterTable
ALTER TABLE "Service" ADD COLUMN "commissionFixedCents" INTEGER;
ALTER TABLE "Service" ADD COLUMN "commissionPct" INTEGER;

-- CreateTable
CREATE TABLE "ServiceStaff" (
    "serviceId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,

    PRIMARY KEY ("serviceId", "staffId"),
    CONSTRAINT "ServiceStaff_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ServiceStaff_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServiceSupply" (
    "serviceId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" REAL NOT NULL,

    PRIMARY KEY ("serviceId", "itemId"),
    CONSTRAINT "ServiceSupply_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ServiceSupply_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "TransportInventoryItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StaffTimeBlock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME NOT NULL,
    "reason" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "StaffTimeBlock_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StaffTimeBlock_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StaffTimeBlock_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SalonProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "SalonProduct_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SalonProduct_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SalonProduct_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "TransportInventoryItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SalonSale" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalonSale_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SalonSale_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SalonSaleLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "salonSaleId" TEXT NOT NULL,
    "serviceId" TEXT,
    "itemId" TEXT,
    "staffId" TEXT,
    "name" TEXT NOT NULL,
    "staffName" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "grossCents" INTEGER NOT NULL,
    "discountCents" INTEGER NOT NULL,
    "netCents" INTEGER NOT NULL,
    "costCents" INTEGER NOT NULL,
    "commissionCents" INTEGER NOT NULL,
    "commissionPaidAt" DATETIME,
    "commissionPaymentReference" TEXT,
    "supplySnapshot" TEXT NOT NULL,
    CONSTRAINT "SalonSaleLine_salonSaleId_fkey" FOREIGN KEY ("salonSaleId") REFERENCES "SalonSale" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SalonSaleLine_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SalonSaleLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "TransportInventoryItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SalonSaleLine_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Additive changes preserve existing rows and references.
ALTER TABLE "StaffMember" ADD COLUMN "scheduleVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "StaffMember" ADD COLUMN "commissionFixedCents" INTEGER;
ALTER TABLE "StaffMember" ADD COLUMN "productCommissionPct" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "StaffMember" ADD COLUMN "productCommissionFixedCents" INTEGER;
ALTER TABLE "Sale" ADD COLUMN "salonSaleId" TEXT REFERENCES "SalonSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Sale_salonSaleId_key" ON "Sale"("salonSaleId");

-- CreateIndex
CREATE INDEX "StaffTimeBlock_tenantId_branchId_staffId_startsAt_idx" ON "StaffTimeBlock"("tenantId", "branchId", "staffId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "SalonProduct_itemId_key" ON "SalonProduct"("itemId");

-- CreateIndex
CREATE INDEX "SalonProduct_tenantId_branchId_active_idx" ON "SalonProduct"("tenantId", "branchId", "active");

-- CreateIndex
CREATE INDEX "SalonSale_tenantId_branchId_createdAt_idx" ON "SalonSale"("tenantId", "branchId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SalonSale_tenantId_branchId_idempotencyKey_key" ON "SalonSale"("tenantId", "branchId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "SalonSaleLine_salonSaleId_idx" ON "SalonSaleLine"("salonSaleId");

-- CreateIndex
CREATE INDEX "SalonSaleLine_staffId_commissionPaidAt_idx" ON "SalonSaleLine"("staffId", "commissionPaidAt");

-- Repair only the unchanged, incorrectly provisioned salon cashier role.
-- Custom permissions and restaurant roles remain untouched.
UPDATE "Role"
SET "permissions" = '["dashboard:read","barbershop:cash:write","customers:read","services:read","barbershop:appointments:read"]'
WHERE "key" = 'CASHIER'
  AND "tenantId" IN (SELECT "id" FROM "Tenant" WHERE "type" = 'BARBERSHOP')
  AND "permissions" = '["dashboard:read","restaurant:orders:read","restaurant:cash:write","customers:read"]';
