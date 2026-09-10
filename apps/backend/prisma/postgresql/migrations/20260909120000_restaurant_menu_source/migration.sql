ALTER TABLE "RestaurantMenuImport" ADD COLUMN "sourceManifest" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "RestaurantMenuImport" ADD COLUMN "sourceVerified" BOOLEAN NOT NULL DEFAULT false;
