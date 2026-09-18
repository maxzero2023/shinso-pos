import { z } from "zod";

export const notifyChannels = ["line", "log"] as const;

export const notifyEventTypes = [
  "reservation.confirmed",
  "reservation.reminder",
  "reservation.cancelled",
  "waitlist.joined",
  "waitlist.called",
  "waitlist.almost_called",
  "waitlist.seated",
  "waitlist.skipped",
  "waitlist.recalled",
] as const;

export type NotifyEventType = (typeof notifyEventTypes)[number];

export const notifySchema = z.object({
  channel: z.enum(notifyChannels).default("line"),
  event: z.enum(notifyEventTypes),
  to: z.string().max(200).optional().nullable(),
  message: z.string().min(1).max(2000),
  meta: z.record(z.unknown()).optional(),
});

export type NotifyPayload = z.infer<typeof notifySchema>;
