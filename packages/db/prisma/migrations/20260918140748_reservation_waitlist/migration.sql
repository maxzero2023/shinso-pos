-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('hold', 'confirmed', 'seated', 'noshow', 'cancelled');

-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('waiting', 'called', 'seated', 'cancelled', 'expired');

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "tableId" TEXT,
    "partySize" INTEGER NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'confirmed',
    "guestName" TEXT,
    "guestPhone" TEXT,
    "guestLineId" TEXT,
    "note" TEXT,
    "checkId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistTicket" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "tableId" TEXT,
    "partySize" INTEGER NOT NULL,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'waiting',
    "ticketNo" INTEGER NOT NULL,
    "guestName" TEXT,
    "guestPhone" TEXT,
    "guestLineId" TEXT,
    "note" TEXT,
    "calledAt" TIMESTAMP(3),
    "seatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "checkId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaitlistTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_checkId_key" ON "Reservation"("checkId");

-- CreateIndex
CREATE INDEX "Reservation_storeId_startAt_idx" ON "Reservation"("storeId", "startAt");

-- CreateIndex
CREATE INDEX "Reservation_tableId_status_idx" ON "Reservation"("tableId", "status");

-- CreateIndex
CREATE INDEX "Reservation_status_idx" ON "Reservation"("status");

-- CreateIndex
CREATE INDEX "Reservation_storeId_status_idx" ON "Reservation"("storeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistTicket_checkId_key" ON "WaitlistTicket"("checkId");

-- CreateIndex
CREATE INDEX "WaitlistTicket_storeId_status_idx" ON "WaitlistTicket"("storeId", "status");

-- CreateIndex
CREATE INDEX "WaitlistTicket_storeId_ticketNo_idx" ON "WaitlistTicket"("storeId", "ticketNo");

-- CreateIndex
CREATE INDEX "WaitlistTicket_tableId_idx" ON "WaitlistTicket"("tableId");

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "Check"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistTicket" ADD CONSTRAINT "WaitlistTicket_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistTicket" ADD CONSTRAINT "WaitlistTicket_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistTicket" ADD CONSTRAINT "WaitlistTicket_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "Check"("id") ON DELETE SET NULL ON UPDATE CASCADE;
