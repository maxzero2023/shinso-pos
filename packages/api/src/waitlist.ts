import { z } from "zod";
import { tokyoBusinessDate, tokyoBusinessDateString } from "./ops";

export const waitlistStatuses = [
  "waiting",
  "called",
  "seated",
  "cancelled",
  "expired",
  "skipped",
] as const;

export type WaitlistStatus = (typeof waitlistStatuses)[number];

export const joinWaitlistSchema = z.object({
  partySize: z.number().int().min(1).max(99),
  guestName: z.string().max(100).optional().nullable(),
  guestPhone: z.string().max(40).optional().nullable(),
  guestLineId: z.string().max(100).optional().nullable(),
  memberId: z.string().min(1).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

export const seatWaitlistSchema = z.object({
  tableId: z.string().min(1),
  guestCount: z.number().int().min(1).max(99).optional(),
});

export const WAITLIST_CALL_TIMEOUT_MINUTES = 10;

/** Almost-call when guest position (1-indexed among waiting) is <= this. */
export const WAITLIST_ALMOST_CALL_POSITION = 2;

export const WAITLIST_STATUS_JA: Record<WaitlistStatus, string> = {
  waiting: "お待ちです",
  called: "呼び出し中",
  seated: "ご案内済み",
  cancelled: "キャンセル",
  expired: "呼出期限切れ",
  skipped: "過号",
};

export type WaitlistNotifyEvent =
  | "waitlist.joined"
  | "waitlist.called"
  | "waitlist.almost_called"
  | "waitlist.seated"
  | "waitlist.skipped"
  | "waitlist.recalled";

/** Japanese LINE templates (AUT-42). */
export function waitlistLineMessage(
  event: WaitlistNotifyEvent,
  opts: { ticketNo: number; partySize?: number; position?: number; tableCode?: string }
): string {
  const no = opts.ticketNo;
  switch (event) {
    case "waitlist.joined":
      return `整理券 ${no} 番でお待ちください（${opts.partySize ?? "?"}名）。順番が近づくとお知らせします。`;
    case "waitlist.almost_called":
      return `まもなくお呼び出しです。整理券 ${no} 番（あと${opts.position ?? "?"}組）`;
    case "waitlist.called":
      return `${no} 番のお客様、お席へお越しください。`;
    case "waitlist.recalled":
      return `${no} 番のお客様、再度お呼び出しです。お席へお越しください。`;
    case "waitlist.seated":
      return `${no} 番 ご案内完了${opts.tableCode ? `（卓 ${opts.tableCode}）` : ""}。ごゆっくりどうぞ。`;
    case "waitlist.skipped":
      return `${no} 番は過号となりました。スタッフまでお声がけください。`;
    default:
      return `整理券 ${no} 番のお知らせです。`;
  }
}

/** Resolve Tokyo business-day Date (@db.Date midnight UTC) for ticket uniqueness. */
export function waitlistBusinessDate(now = new Date()): Date {
  return tokyoBusinessDate(now);
}

export function waitlistBusinessYmd(now = new Date()): string {
  return tokyoBusinessDateString(now);
}

/**
 * 1-indexed position among waiting tickets ordered by ticketNo ascending.
 * Returns null if ticket is not waiting.
 */
export function computeWaitingPosition(
  ticket: { id: string; status: string; ticketNo: number },
  waitingOrdered: { id: string; ticketNo: number }[]
): number | null {
  if (ticket.status !== "waiting") return null;
  const idx = waitingOrdered.findIndex((t) => t.id === ticket.id);
  return idx >= 0 ? idx + 1 : null;
}
