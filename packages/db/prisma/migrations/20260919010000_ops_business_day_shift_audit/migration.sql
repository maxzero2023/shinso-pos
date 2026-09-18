-- CreateEnum
CREATE TYPE "BusinessDayStatus" AS ENUM ('open', 'closed');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('open', 'closed');

-- CreateEnum
CREATE TYPE "CheckExceptionStatus" AS ENUM ('none', 'flagged', 'resolved');

-- CreateTable
CREATE TABLE "BusinessDay" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "status" "BusinessDayStatus" NOT NULL DEFAULT 'open',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "openedByStaffId" TEXT,
    "closedByStaffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "businessDayId" TEXT NOT NULL,
    "status" "ShiftStatus" NOT NULL DEFAULT 'open',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "openedByStaffId" TEXT,
    "closedByStaffId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckAuditLog" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckAuditLog_pkey" PRIMARY KEY ("id")
);

-- AlterTable Check
ALTER TABLE "Check" ADD COLUMN "businessDayId" TEXT;
ALTER TABLE "Check" ADD COLUMN "shiftId" TEXT;
ALTER TABLE "Check" ADD COLUMN "exceptionStatus" "CheckExceptionStatus" NOT NULL DEFAULT 'none';
ALTER TABLE "Check" ADD COLUMN "exceptionNote" TEXT;
ALTER TABLE "Check" ADD COLUMN "exceptionFlaggedAt" TIMESTAMP(3);
ALTER TABLE "Check" ADD COLUMN "exceptionFlaggedByStaffId" TEXT;
ALTER TABLE "Check" ADD COLUMN "exceptionResolvedAt" TIMESTAMP(3);
ALTER TABLE "Check" ADD COLUMN "exceptionResolvedByStaffId" TEXT;
ALTER TABLE "Check" ADD COLUMN "exceptionResolveNote" TEXT;

-- Indexes
CREATE UNIQUE INDEX "BusinessDay_storeId_businessDate_key" ON "BusinessDay"("storeId", "businessDate");
CREATE INDEX "BusinessDay_storeId_status_idx" ON "BusinessDay"("storeId", "status");

CREATE INDEX "Shift_storeId_status_idx" ON "Shift"("storeId", "status");
CREATE INDEX "Shift_businessDayId_idx" ON "Shift"("businessDayId");

CREATE INDEX "CheckAuditLog_storeId_createdAt_idx" ON "CheckAuditLog"("storeId", "createdAt");
CREATE INDEX "CheckAuditLog_checkId_createdAt_idx" ON "CheckAuditLog"("checkId", "createdAt");
CREATE INDEX "CheckAuditLog_staffId_idx" ON "CheckAuditLog"("staffId");
CREATE INDEX "CheckAuditLog_action_idx" ON "CheckAuditLog"("action");

CREATE INDEX "Check_businessDayId_idx" ON "Check"("businessDayId");
CREATE INDEX "Check_shiftId_idx" ON "Check"("shiftId");
CREATE INDEX "Check_exceptionStatus_idx" ON "Check"("exceptionStatus");

-- FKs
ALTER TABLE "BusinessDay" ADD CONSTRAINT "BusinessDay_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Shift" ADD CONSTRAINT "Shift_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_businessDayId_fkey" FOREIGN KEY ("businessDayId") REFERENCES "BusinessDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_openedByStaffId_fkey" FOREIGN KEY ("openedByStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_closedByStaffId_fkey" FOREIGN KEY ("closedByStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CheckAuditLog" ADD CONSTRAINT "CheckAuditLog_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CheckAuditLog" ADD CONSTRAINT "CheckAuditLog_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "Check"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CheckAuditLog" ADD CONSTRAINT "CheckAuditLog_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Check" ADD CONSTRAINT "Check_businessDayId_fkey" FOREIGN KEY ("businessDayId") REFERENCES "BusinessDay"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Check" ADD CONSTRAINT "Check_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
