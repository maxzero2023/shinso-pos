-- AUT-41: second Japan-common hardware pack (alt) + pack flag
-- Does not replace Q1 standard pack (t1_pos / kitchen_display / printer).

-- CreateEnum
CREATE TYPE "DevicePack" AS ENUM ('standard', 'alt');

-- AlterEnum DeviceType
ALTER TYPE "DeviceType" ADD VALUE 'handheld_pos';
ALTER TYPE "DeviceType" ADD VALUE 'kitchen_display_alt';
ALTER TYPE "DeviceType" ADD VALUE 'thermal_printer_alt';

-- AlterTable
ALTER TABLE "Device" ADD COLUMN "pack" "DevicePack" NOT NULL DEFAULT 'standard';
ALTER TABLE "Device" ADD COLUMN "isPrimaryStandardPack" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "Device_storeId_pack_idx" ON "Device"("storeId", "pack");

-- Existing devices remain standard pack / primary
UPDATE "Device" SET "pack" = 'standard', "isPrimaryStandardPack" = true;
