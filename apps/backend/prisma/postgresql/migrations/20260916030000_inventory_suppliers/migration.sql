-- AlterTable
ALTER TABLE "InventoryPurchase" ADD COLUMN     "supplierId" TEXT;

-- CreateTable
CREATE TABLE "InventorySupplier" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "contact" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "InventorySupplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryPayable" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "paidCents" INTEGER NOT NULL DEFAULT 0,
    "dueOn" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryPayable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventorySupplierPayment" (
    "id" TEXT NOT NULL,
    "payableId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventorySupplierPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventorySupplier_tenantId_branchId_documentType_documentNu_key" ON "InventorySupplier"("tenantId", "branchId", "documentType", "documentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryPayable_purchaseId_key" ON "InventoryPayable"("purchaseId");

-- CreateIndex
CREATE INDEX "InventoryPayable_tenantId_branchId_dueOn_idx" ON "InventoryPayable"("tenantId", "branchId", "dueOn");

-- CreateIndex
CREATE INDEX "InventorySupplierPayment_payableId_createdAt_idx" ON "InventorySupplierPayment"("payableId", "createdAt");

-- AddForeignKey
ALTER TABLE "InventoryPurchase" ADD CONSTRAINT "InventoryPurchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "InventorySupplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventorySupplier" ADD CONSTRAINT "InventorySupplier_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventorySupplier" ADD CONSTRAINT "InventorySupplier_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryPayable" ADD CONSTRAINT "InventoryPayable_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryPayable" ADD CONSTRAINT "InventoryPayable_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryPayable" ADD CONSTRAINT "InventoryPayable_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "InventorySupplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryPayable" ADD CONSTRAINT "InventoryPayable_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "InventoryPurchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventorySupplierPayment" ADD CONSTRAINT "InventorySupplierPayment_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "InventoryPayable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

