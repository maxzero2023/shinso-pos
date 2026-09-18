-- CreateEnum
CREATE TYPE "MarketingRuleType" AS ENUM ('sleep_recall', 'coupon_nudge', 'welcome');

-- CreateEnum
CREATE TYPE "MarketingSendStatus" AS ENUM ('sent', 'skipped_freq', 'skipped_opt_out', 'skipped_disabled', 'skipped_no_match', 'failed');

-- AlterTable
ALTER TABLE "Member" ADD COLUMN "marketingOptIn" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "MarketingRule" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" "MarketingRuleType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "params" JSONB NOT NULL DEFAULT '{}',
    "frequencyDays" INTEGER NOT NULL DEFAULT 7,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingSendLog" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "memberId" TEXT,
    "status" "MarketingSendStatus" NOT NULL,
    "messageText" TEXT NOT NULL DEFAULT '',
    "errorMessage" TEXT,
    "meta" JSONB,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingSendLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Member_storeId_marketingOptIn_idx" ON "Member"("storeId", "marketingOptIn");

-- CreateIndex
CREATE INDEX "MarketingRule_storeId_enabled_idx" ON "MarketingRule"("storeId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingRule_storeId_type_key" ON "MarketingRule"("storeId", "type");

-- CreateIndex
CREATE INDEX "MarketingSendLog_storeId_createdAt_idx" ON "MarketingSendLog"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "MarketingSendLog_ruleId_memberId_createdAt_idx" ON "MarketingSendLog"("ruleId", "memberId", "createdAt");

-- CreateIndex
CREATE INDEX "MarketingSendLog_ruleId_status_createdAt_idx" ON "MarketingSendLog"("ruleId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "MarketingRule" ADD CONSTRAINT "MarketingRule_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingSendLog" ADD CONSTRAINT "MarketingSendLog_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingSendLog" ADD CONSTRAINT "MarketingSendLog_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "MarketingRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingSendLog" ADD CONSTRAINT "MarketingSendLog_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
