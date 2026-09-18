-- AUT-42: waitlist LINE productionization / CRM depth
-- skipped status, business-day unique ticketNo, member bind, audit, almost-call

-- AlterEnum
ALTER TYPE "WaitlistStatus" ADD VALUE 'skipped';

-- AlterTable WaitlistTicket
ALTER TABLE "WaitlistTicket" ADD COLUMN "businessDate" DATE;
ALTER TABLE "WaitlistTicket" ADD COLUMN "memberId" TEXT;
ALTER TABLE "WaitlistTicket" ADD COLUMN "publicToken" TEXT;
ALTER TABLE "WaitlistTicket" ADD COLUMN "skippedAt" TIMESTAMP(3);
ALTER TABLE "WaitlistTicket" ADD COLUMN "almostCalledAt" TIMESTAMP(3);

-- Backfill businessDate from createdAt (Asia/Tokyo calendar day as UTC midnight date)
UPDATE "WaitlistTicket"
SET "businessDate" = (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tokyo')::date
WHERE "businessDate" IS NULL;

-- Backfill publicToken
UPDATE "WaitlistTicket"
SET "publicToken" = md5(random()::text || id || clock_timestamp()::text)
WHERE "publicToken" IS NULL;

ALTER TABLE "WaitlistTicket" ALTER COLUMN "businessDate" SET NOT NULL;
ALTER TABLE "WaitlistTicket" ALTER COLUMN "publicToken" SET NOT NULL;

CREATE UNIQUE INDEX "WaitlistTicket_publicToken_key" ON "WaitlistTicket"("publicToken");
DROP INDEX IF EXISTS "WaitlistTicket_storeId_ticketNo_idx";
CREATE UNIQUE INDEX "WaitlistTicket_storeId_businessDate_ticketNo_key" ON "WaitlistTicket"("storeId", "businessDate", "ticketNo");
CREATE INDEX "WaitlistTicket_storeId_businessDate_idx" ON "WaitlistTicket"("storeId", "businessDate");
CREATE INDEX "WaitlistTicket_storeId_ticketNo_idx" ON "WaitlistTicket"("storeId", "ticketNo");
CREATE INDEX "WaitlistTicket_memberId_idx" ON "WaitlistTicket"("memberId");

ALTER TABLE "WaitlistTicket" ADD CONSTRAINT "WaitlistTicket_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable WaitlistAuditLog
CREATE TABLE "WaitlistAuditLog" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "staffId" TEXT,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "summary" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WaitlistAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WaitlistAuditLog_storeId_createdAt_idx" ON "WaitlistAuditLog"("storeId", "createdAt");
CREATE INDEX "WaitlistAuditLog_ticketId_createdAt_idx" ON "WaitlistAuditLog"("ticketId", "createdAt");
CREATE INDEX "WaitlistAuditLog_action_idx" ON "WaitlistAuditLog"("action");

ALTER TABLE "WaitlistAuditLog" ADD CONSTRAINT "WaitlistAuditLog_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WaitlistAuditLog" ADD CONSTRAINT "WaitlistAuditLog_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "WaitlistTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WaitlistAuditLog" ADD CONSTRAINT "WaitlistAuditLog_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
