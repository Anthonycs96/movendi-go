-- CreateTable
CREATE TABLE "RetailScannerConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "ownerSessionId" TEXT NOT NULL,
    "cashSessionId" TEXT NOT NULL,
    "receiverHash" TEXT NOT NULL,
    "pairingHash" TEXT NOT NULL,
    "senderHash" TEXT,
    "pairExpiresAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "receiverSeenAt" DATETIME NOT NULL,
    "senderSeenAt" DATETIME,
    "accepting" BOOLEAN NOT NULL DEFAULT false,
    "cartIntentId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RetailScannerConnection_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RetailScanEvent" (
    "sequence" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "connectionId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "cartIntentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RetailScanEvent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "RetailScannerConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RetailPaymentQr" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "payee" TEXT NOT NULL,
    "imageBase64" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RetailPaymentQr_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
