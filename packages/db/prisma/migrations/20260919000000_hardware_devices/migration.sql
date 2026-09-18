-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('t1_pos', 'kitchen_display', 'printer');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('online', 'offline', 'out_of_paper', 'error');

-- CreateEnum
CREATE TYPE "PrintJobType" AS ENUM ('receipt', 'kitchen');

-- CreateEnum
CREATE TYPE "PrintJobStatus" AS ENUM ('queued', 'printing', 'printed', 'failed');

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" "DeviceType" NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "DeviceStatus" NOT NULL DEFAULT 'offline',
    "lastHeartbeatAt" TIMESTAMP(3),
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintJob" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "deviceId" TEXT,
    "type" "PrintJobType" NOT NULL,
    "status" "PrintJobStatus" NOT NULL DEFAULT 'queued',
    "checkId" TEXT,
    "kitchenTicketId" TEXT,
    "contentText" TEXT NOT NULL,
    "contentHtml" TEXT,
    "errorMessage" TEXT,
    "printedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrintJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Device_storeId_idx" ON "Device"("storeId");
CREATE INDEX "Device_storeId_type_idx" ON "Device"("storeId", "type");
CREATE INDEX "Device_status_idx" ON "Device"("status");
CREATE UNIQUE INDEX "Device_storeId_code_key" ON "Device"("storeId", "code");

CREATE INDEX "PrintJob_storeId_status_idx" ON "PrintJob"("storeId", "status");
CREATE INDEX "PrintJob_deviceId_idx" ON "PrintJob"("deviceId");
CREATE INDEX "PrintJob_checkId_idx" ON "PrintJob"("checkId");
CREATE INDEX "PrintJob_kitchenTicketId_idx" ON "PrintJob"("kitchenTicketId");
CREATE INDEX "PrintJob_createdAt_idx" ON "PrintJob"("createdAt");

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "Check"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_kitchenTicketId_fkey" FOREIGN KEY ("kitchenTicketId") REFERENCES "KitchenTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
