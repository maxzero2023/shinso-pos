import { z } from "zod";

export const reservationStatuses = [
  "hold",
  "confirmed",
  "seated",
  "noshow",
  "cancelled",
] as const;

export const createReservationSchema = z.object({
  tableId: z.string().min(1).optional().nullable(),
  partySize: z.number().int().min(1).max(99),
  startAt: z.string().min(1),
  endAt: z.string().min(1).optional(),
  status: z.enum(["hold", "confirmed"]).default("confirmed"),
  guestName: z.string().max(100).optional().nullable(),
  guestPhone: z.string().max(40).optional().nullable(),
  guestLineId: z.string().max(100).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

export const updateReservationSchema = z.object({
  tableId: z.string().min(1).optional().nullable(),
  partySize: z.number().int().min(1).max(99).optional(),
  startAt: z.string().min(1).optional(),
  endAt: z.string().min(1).optional(),
  status: z.enum(["hold", "confirmed", "noshow"]).optional(),
  guestName: z.string().max(100).optional().nullable(),
  guestPhone: z.string().max(40).optional().nullable(),
  guestLineId: z.string().max(100).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

export const seatReservationSchema = z.object({
  tableId: z.string().min(1).optional(),
  guestCount: z.number().int().min(1).max(99).optional(),
});

export const DEFAULT_RESERVATION_MINUTES = 90;

export function parseTokyoDayBounds(dateStr: string): { start: Date; end: Date } {
  const start = new Date(`${dateStr}T00:00:00+09:00`);
  const end = new Date(`${dateStr}T23:59:59.999+09:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("invalid date");
  }
  return { start, end };
}

export function tokyoTodayYmd(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function defaultEndAt(startAt: Date, minutes = DEFAULT_RESERVATION_MINUTES): Date {
  return new Date(startAt.getTime() + minutes * 60_000);
}
