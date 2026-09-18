-- CreateEnum
CREATE TYPE "OwnerLineDigestKind" AS ENUM ('daily', 'weekly');

-- CreateEnum
CREATE TYPE "OwnerLineDeliveryStatus" AS ENUM ('sent', 'failed', 'skipped');

-- CreateTable
CREATE TABLE "OwnerLineBinding" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "lineUserId" TEXT NOT NULL,
    "dailyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "weeklyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnerLineBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnerLineDeliveryLog" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "bindingId" TEXT,
    "kind" "OwnerLineDigestKind" NOT NULL,
    "status" "OwnerLineDeliveryStatus" NOT NULL,
    "periodFrom" TEXT NOT NULL,
    "periodTo" TEXT NOT NULL,
    "messageText" TEXT NOT NULL DEFAULT '',
    "snapshot" JSONB,
    "errorMessage" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnerLineDeliveryLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OwnerLineBinding_storeId_key" ON "OwnerLineBinding"("storeId");

-- CreateIndex
CREATE INDEX "OwnerLineBinding_lineUserId_idx" ON "OwnerLineBinding"("lineUserId");

-- CreateIndex
CREATE INDEX "OwnerLineDeliveryLog_storeId_createdAt_idx" ON "OwnerLineDeliveryLog"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "OwnerLineDeliveryLog_storeId_kind_createdAt_idx" ON "OwnerLineDeliveryLog"("storeId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "OwnerLineDeliveryLog_bindingId_idx" ON "OwnerLineDeliveryLog"("bindingId");

-- AddForeignKey
ALTER TABLE "OwnerLineBinding" ADD CONSTRAINT "OwnerLineBinding_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerLineDeliveryLog" ADD CONSTRAINT "OwnerLineDeliveryLog_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerLineDeliveryLog" ADD CONSTRAINT "OwnerLineDeliveryLog_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "OwnerLineBinding"("id") ON DELETE SET NULL ON UPDATE CASCADE;
