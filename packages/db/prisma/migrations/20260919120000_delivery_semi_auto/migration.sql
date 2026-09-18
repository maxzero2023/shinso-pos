-- CreateEnum
CREATE TYPE "CheckChannel" AS ENUM ('dine_in', 'delivery');

-- CreateEnum
CREATE TYPE "ExternalOrderChannel" AS ENUM ('demaecan', 'uber_eats_jp');

-- CreateEnum
CREATE TYPE "ExternalOrderStatus" AS ENUM ('pending', 'confirmed', 'cancelled');

-- AlterTable
ALTER TABLE "Check" ADD COLUMN "channel" "CheckChannel" NOT NULL DEFAULT 'dine_in';

-- CreateTable
CREATE TABLE "ExternalOrder" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "channel" "ExternalOrderChannel" NOT NULL,
    "externalId" TEXT NOT NULL,
    "status" "ExternalOrderStatus" NOT NULL DEFAULT 'pending',
    "customerName" TEXT,
    "customerPhone" TEXT,
    "note" TEXT,
    "rawPayload" JSONB,
    "mappingError" TEXT,
    "checkId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "confirmedByStaffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalOrderLine" (
    "id" TEXT NOT NULL,
    "externalOrderId" TEXT NOT NULL,
    "externalItemName" TEXT NOT NULL,
    "externalItemCode" TEXT,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "unitPriceYen" INTEGER NOT NULL DEFAULT 0,
    "menuItemId" TEXT,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExternalOrder_checkId_key" ON "ExternalOrder"("checkId");

-- CreateIndex
CREATE INDEX "ExternalOrder_storeId_status_idx" ON "ExternalOrder"("storeId", "status");

-- CreateIndex
CREATE INDEX "ExternalOrder_storeId_createdAt_idx" ON "ExternalOrder"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "ExternalOrder_confirmedByStaffId_idx" ON "ExternalOrder"("confirmedByStaffId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalOrder_storeId_channel_externalId_key" ON "ExternalOrder"("storeId", "channel", "externalId");

-- CreateIndex
CREATE INDEX "ExternalOrderLine_externalOrderId_idx" ON "ExternalOrderLine"("externalOrderId");

-- CreateIndex
CREATE INDEX "ExternalOrderLine_menuItemId_idx" ON "ExternalOrderLine"("menuItemId");

-- CreateIndex
CREATE INDEX "Check_channel_idx" ON "Check"("channel");

-- AddForeignKey
ALTER TABLE "ExternalOrder" ADD CONSTRAINT "ExternalOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalOrder" ADD CONSTRAINT "ExternalOrder_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "Check"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalOrder" ADD CONSTRAINT "ExternalOrder_confirmedByStaffId_fkey" FOREIGN KEY ("confirmedByStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalOrderLine" ADD CONSTRAINT "ExternalOrderLine_externalOrderId_fkey" FOREIGN KEY ("externalOrderId") REFERENCES "ExternalOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalOrderLine" ADD CONSTRAINT "ExternalOrderLine_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
