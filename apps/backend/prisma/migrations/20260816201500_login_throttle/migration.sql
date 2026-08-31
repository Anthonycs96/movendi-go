-- CreateTable
CREATE TABLE "LoginThrottle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "keyHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blockedUntil" DATETIME,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "LoginThrottle_keyHash_key" ON "LoginThrottle"("keyHash");

-- CreateIndex
CREATE INDEX "LoginThrottle_blockedUntil_idx" ON "LoginThrottle"("blockedUntil");
