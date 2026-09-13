-- Nullable: historical sales stay unchanged; new checkouts capture their detail.
ALTER TABLE "Sale" ADD COLUMN "commercialSnapshot" TEXT;
