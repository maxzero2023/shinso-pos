-- CreateEnum
CREATE TYPE "CouponIssueStatus" AS ENUM ('issued', 'redeemed');

-- AlterTable
ALTER TABLE "Check" ADD COLUMN "memberId" TEXT;

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "lineUserId" TEXT NOT NULL,
    "displayName" TEXT,
    "points" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponTemplate" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "discountYen" INTEGER NOT NULL DEFAULT 0,
    "pointsCost" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CouponTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponIssue" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "CouponIssueStatus" NOT NULL DEFAULT 'issued',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redeemedAt" TIMESTAMP(3),
    "redeemedByStaffId" TEXT,
    "checkId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CouponIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointAward" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "amountYen" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointAward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Member_storeId_idx" ON "Member"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "Member_storeId_lineUserId_key" ON "Member"("storeId", "lineUserId");

-- CreateIndex
CREATE INDEX "CouponTemplate_storeId_active_idx" ON "CouponTemplate"("storeId", "active");

-- CreateIndex
CREATE INDEX "CouponIssue_memberId_status_idx" ON "CouponIssue"("memberId", "status");

-- CreateIndex
CREATE INDEX "CouponIssue_storeId_status_idx" ON "CouponIssue"("storeId", "status");

-- CreateIndex
CREATE INDEX "CouponIssue_checkId_idx" ON "CouponIssue"("checkId");

-- CreateIndex
CREATE UNIQUE INDEX "CouponIssue_storeId_code_key" ON "CouponIssue"("storeId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "PointAward_checkId_key" ON "PointAward"("checkId");

-- CreateIndex
CREATE INDEX "PointAward_storeId_memberId_idx" ON "PointAward"("storeId", "memberId");

-- CreateIndex
CREATE INDEX "PointAward_memberId_idx" ON "PointAward"("memberId");

-- CreateIndex
CREATE INDEX "Check_memberId_idx" ON "Check"("memberId");

-- AddForeignKey
ALTER TABLE "Check" ADD CONSTRAINT "Check_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponTemplate" ADD CONSTRAINT "CouponTemplate_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponIssue" ADD CONSTRAINT "CouponIssue_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponIssue" ADD CONSTRAINT "CouponIssue_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CouponTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponIssue" ADD CONSTRAINT "CouponIssue_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointAward" ADD CONSTRAINT "PointAward_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointAward" ADD CONSTRAINT "PointAward_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
