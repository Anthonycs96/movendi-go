-- Display-only snapshot from the paired PC; each connection belongs to one cash shift.
ALTER TABLE "RetailScannerConnection" ADD COLUMN "cartSummary" TEXT;
