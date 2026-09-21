-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "inventoryItemId" TEXT,
ADD COLUMN     "showInMenu" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stockMode" TEXT NOT NULL DEFAULT 'RECIPE';

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "stockModeSnapshot" TEXT NOT NULL DEFAULT 'RECIPE';

-- AlterTable
ALTER TABLE "TransportInventoryItem" ADD COLUMN     "inventoryCategory" TEXT;

-- AlterTable
ALTER TABLE "InventoryPurchaseLine" ADD COLUMN     "presentationCostCents" INTEGER,
ADD COLUMN     "presentationFactor" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "presentationName" TEXT NOT NULL DEFAULT 'Unidad base',
ADD COLUMN     "purchasedQuantity" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "InventoryPresentation" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "factor" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "InventoryPresentation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryPresentation_itemId_name_key" ON "InventoryPresentation"("itemId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Product_inventoryItemId_key" ON "Product"("inventoryItemId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "TransportInventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryPresentation" ADD CONSTRAINT "InventoryPresentation_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "TransportInventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

