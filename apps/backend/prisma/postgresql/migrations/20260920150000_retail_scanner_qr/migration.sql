-- CreateTable
CREATE TABLE "RetailScannerConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "ownerSessionId" TEXT NOT NULL,
    "cashSessionId" TEXT NOT NULL,
    "receiverHash" TEXT NOT NULL,
    "pairingHash" TEXT NOT NULL,
    "senderHash" TEXT,
    "pairExpiresAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "receiverSeenAt" TIMESTAMP(3) NOT NULL,
    "senderSeenAt" TIMESTAMP(3),
    "accepting" BOOLEAN NOT NULL DEFAULT false,
    "cartIntentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailScannerConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailScanEvent" (
    "sequence" SERIAL NOT NULL,
    "connectionId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "cartIntentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailScanEvent_pkey" PRIMARY KEY ("sequence")
);

-- CreateTable
CREATE TABLE "RetailPaymentQr" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "payee" TEXT NOT NULL,
    "imageBase64" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailPaymentQr_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RetailScannerConnection_cashSessionId_key" ON "RetailScannerConnection"("cashSessionId");

-- CreateIndex
CREATE INDEX "RetailScannerConnection_tenantId_branchId_idx" ON "RetailScannerConnection"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "RetailScanEvent_connectionId_status_sequence_idx" ON "RetailScanEvent"("connectionId", "status", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "RetailScanEvent_connectionId_requestId_key" ON "RetailScanEvent"("connectionId", "requestId");

-- CreateIndex
CREATE INDEX "RetailPaymentQr_tenantId_branchId_idx" ON "RetailPaymentQr"("tenantId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "RetailPaymentQr_branchId_method_key" ON "RetailPaymentQr"("branchId", "method");

-- AddForeignKey
ALTER TABLE "RetailScannerConnection" ADD CONSTRAINT "RetailScannerConnection_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailScanEvent" ADD CONSTRAINT "RetailScanEvent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "RetailScannerConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailPaymentQr" ADD CONSTRAINT "RetailPaymentQr_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
