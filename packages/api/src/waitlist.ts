import { z } from "zod";

export const waitlistStatuses = [
  "waiting",
  "called",
  "seated",
  "cancelled",
  "expired",
] as const;

export const joinWaitlistSchema = z.object({
  partySize: z.number().int().min(1).max(99),
  guestName: z.string().max(100).optional().nullable(),
  guestPhone: z.string().max(40).optional().nullable(),
  guestLineId: z.string().max(100).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

export const seatWaitlistSchema = z.object({
  tableId: z.string().min(1),
  guestCount: z.number().int().min(1).max(99).optional(),
});

export const WAITLIST_CALL_TIMEOUT_MINUTES = 10;
