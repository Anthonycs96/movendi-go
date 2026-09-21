-- AlterTable
ALTER TABLE "StaffMember" ADD COLUMN     "commissionFixedCents" INTEGER,
ADD COLUMN     "productCommissionFixedCents" INTEGER,
ADD COLUMN     "productCommissionPct" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "scheduleVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "commissionFixedCents" INTEGER,
ADD COLUMN     "commissionPct" INTEGER;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "salonSaleId" TEXT;

-- CreateTable
CREATE TABLE "ServiceStaff" (
    "serviceId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,

    CONSTRAINT "ServiceStaff_pkey" PRIMARY KEY ("serviceId","staffId")
);

-- CreateTable
CREATE TABLE "ServiceSupply" (
    "serviceId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ServiceSupply_pkey" PRIMARY KEY ("serviceId","itemId")
);

-- CreateTable
CREATE TABLE "StaffTimeBlock" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "StaffTimeBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalonProduct" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SalonProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalonSale" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalonSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalonSaleLine" (
    "id" TEXT NOT NULL,
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
    "commissionPaidAt" TIMESTAMP(3),
    "commissionPaymentReference" TEXT,
    "supplySnapshot" TEXT NOT NULL,

    CONSTRAINT "SalonSaleLine_pkey" PRIMARY KEY ("id")
);

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

-- CreateIndex
CREATE UNIQUE INDEX "Sale_salonSaleId_key" ON "Sale"("salonSaleId");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_salonSaleId_fkey" FOREIGN KEY ("salonSaleId") REFERENCES "SalonSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceStaff" ADD CONSTRAINT "ServiceStaff_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceStaff" ADD CONSTRAINT "ServiceStaff_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceSupply" ADD CONSTRAINT "ServiceSupply_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceSupply" ADD CONSTRAINT "ServiceSupply_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "TransportInventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffTimeBlock" ADD CONSTRAINT "StaffTimeBlock_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffTimeBlock" ADD CONSTRAINT "StaffTimeBlock_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffTimeBlock" ADD CONSTRAINT "StaffTimeBlock_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalonProduct" ADD CONSTRAINT "SalonProduct_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalonProduct" ADD CONSTRAINT "SalonProduct_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalonProduct" ADD CONSTRAINT "SalonProduct_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "TransportInventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalonSale" ADD CONSTRAINT "SalonSale_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalonSale" ADD CONSTRAINT "SalonSale_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalonSaleLine" ADD CONSTRAINT "SalonSaleLine_salonSaleId_fkey" FOREIGN KEY ("salonSaleId") REFERENCES "SalonSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalonSaleLine" ADD CONSTRAINT "SalonSaleLine_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalonSaleLine" ADD CONSTRAINT "SalonSaleLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "TransportInventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalonSaleLine" ADD CONSTRAINT "SalonSaleLine_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Repair only the unchanged, incorrectly provisioned salon cashier role.
-- Custom permissions and restaurant roles remain untouched.
UPDATE "Role"
SET "permissions" = '["dashboard:read","barbershop:cash:write","customers:read","services:read","barbershop:appointments:read"]'
WHERE "key" = 'CASHIER'
  AND "tenantId" IN (SELECT "id" FROM "Tenant" WHERE "type" = 'BARBERSHOP')
  AND "permissions" = '["dashboard:read","restaurant:orders:read","restaurant:cash:write","customers:read"]';
