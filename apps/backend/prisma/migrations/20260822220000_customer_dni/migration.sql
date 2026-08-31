ALTER TABLE "Customer" ADD COLUMN "dni" TEXT;

CREATE UNIQUE INDEX "Customer_tenantId_dni_key" ON "Customer"("tenantId", "dni");
