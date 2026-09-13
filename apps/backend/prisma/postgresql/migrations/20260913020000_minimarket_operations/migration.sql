-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "retailSaleId" TEXT;

-- CreateTable
CREATE TABLE "RetailProduct" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'General',
    "trackExpiry" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RetailProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailPresentation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "barcode" TEXT,
    "factor" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "priceCents" INTEGER NOT NULL,
    "weighted" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RetailPresentation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailLot" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresOn" TEXT NOT NULL,
    "stock" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "RetailLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailSale" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "refundedPayments" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailSaleLine" (
    "id" TEXT NOT NULL,
    "retailSaleId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "presentationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "factor" DOUBLE PRECISION NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "unitCostCents" INTEGER NOT NULL,
    "allocations" TEXT NOT NULL DEFAULT '[]',
    "returnedQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "refundedCents" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RetailSaleLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailOperation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RetailProduct_itemId_key" ON "RetailProduct"("itemId");

-- CreateIndex
CREATE INDEX "RetailProduct_tenantId_branchId_idx" ON "RetailProduct"("tenantId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "RetailPresentation_tenantId_branchId_barcode_key" ON "RetailPresentation"("tenantId", "branchId", "barcode");

-- CreateIndex
CREATE UNIQUE INDEX "RetailPresentation_productId_name_key" ON "RetailPresentation"("productId", "name");

-- CreateIndex
CREATE INDEX "RetailLot_productId_expiresOn_idx" ON "RetailLot"("productId", "expiresOn");

-- CreateIndex
CREATE UNIQUE INDEX "RetailLot_productId_code_key" ON "RetailLot"("productId", "code");

-- CreateIndex
CREATE INDEX "RetailSale_tenantId_branchId_createdAt_idx" ON "RetailSale"("tenantId", "branchId", "createdAt");

-- CreateIndex
CREATE INDEX "RetailSaleLine_retailSaleId_idx" ON "RetailSaleLine"("retailSaleId");

-- CreateIndex
CREATE INDEX "RetailOperation_tenantId_branchId_kind_createdAt_idx" ON "RetailOperation"("tenantId", "branchId", "kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_retailSaleId_key" ON "Sale"("retailSaleId");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_retailSaleId_fkey" FOREIGN KEY ("retailSaleId") REFERENCES "RetailSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailProduct" ADD CONSTRAINT "RetailProduct_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailProduct" ADD CONSTRAINT "RetailProduct_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailProduct" ADD CONSTRAINT "RetailProduct_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "TransportInventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailPresentation" ADD CONSTRAINT "RetailPresentation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "RetailProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailLot" ADD CONSTRAINT "RetailLot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "RetailProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailSale" ADD CONSTRAINT "RetailSale_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailSale" ADD CONSTRAINT "RetailSale_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailSaleLine" ADD CONSTRAINT "RetailSaleLine_retailSaleId_fkey" FOREIGN KEY ("retailSaleId") REFERENCES "RetailSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOperation" ADD CONSTRAINT "RetailOperation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOperation" ADD CONSTRAINT "RetailOperation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

