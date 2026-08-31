CREATE TABLE "RestaurantIntegrationCredential" (
    "id" TEXT NOT NULL PRIMARY KEY, "tenantId" TEXT NOT NULL, "provider" TEXT NOT NULL, "apiUrl" TEXT NOT NULL,
    "encryptedToken" TEXT NOT NULL, "iv" TEXT NOT NULL, "authTag" TEXT NOT NULL, "tokenHint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING', "lastTestedAt" DATETIME, "lastError" TEXT, "updatedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RestaurantIntegrationCredential_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RestaurantIntegrationCredential_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RestaurantIntegrationCredential_tenantId_provider_key" ON "RestaurantIntegrationCredential"("tenantId", "provider");
CREATE INDEX "RestaurantIntegrationCredential_tenantId_status_idx" ON "RestaurantIntegrationCredential"("tenantId", "status");

CREATE TABLE "RestaurantDocumentSequence" (
    "id" TEXT NOT NULL PRIMARY KEY, "tenantId" TEXT NOT NULL, "branchId" TEXT NOT NULL, "kind" TEXT NOT NULL, "series" TEXT NOT NULL, "nextNumber" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "RestaurantDocumentSequence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RestaurantDocumentSequence_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RestaurantDocumentSequence_tenantId_branchId_kind_series_key" ON "RestaurantDocumentSequence"("tenantId", "branchId", "kind", "series");

CREATE TABLE "RestaurantElectronicDocument" (
    "id" TEXT NOT NULL PRIMARY KEY, "tenantId" TEXT NOT NULL, "branchId" TEXT NOT NULL, "saleId" TEXT NOT NULL,
    "kind" TEXT NOT NULL, "series" TEXT NOT NULL, "number" INTEGER NOT NULL, "provider" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestId" TEXT, "response" TEXT, "pdfUrl" TEXT, "xmlUrl" TEXT, "cdrUrl" TEXT, "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT, "issuedAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RestaurantElectronicDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RestaurantElectronicDocument_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RestaurantElectronicDocument_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RestaurantElectronicDocument_saleId_key" ON "RestaurantElectronicDocument"("saleId");
CREATE UNIQUE INDEX "RestaurantElectronicDocument_tenantId_kind_series_number_key" ON "RestaurantElectronicDocument"("tenantId", "kind", "series", "number");
CREATE INDEX "RestaurantElectronicDocument_tenantId_branchId_createdAt_idx" ON "RestaurantElectronicDocument"("tenantId", "branchId", "createdAt");
CREATE INDEX "RestaurantElectronicDocument_tenantId_status_updatedAt_idx" ON "RestaurantElectronicDocument"("tenantId", "status", "updatedAt");
