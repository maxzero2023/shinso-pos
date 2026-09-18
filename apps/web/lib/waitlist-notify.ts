import type { Prisma } from "@prisma/client";
import { prisma } from "@shinso/db";
import {
  sendLineMessage,
  waitlistLineMessage,
  WAITLIST_ALMOST_CALL_POSITION,
  type LineMessageResult,
  type WaitlistNotifyEvent,
} from "@shinso/api";

export type WaitlistLineTarget = {
  lineUserId: string | null;
  memberId: string | null;
  source: "guestLineId" | "member" | "none";
};

export type WaitlistPushResult = {
  pushed: boolean;
  reason?: "unbound" | "sent" | "error";
  staffHint?: string;
  to?: string | null;
  line?: LineMessageResult | null;
};

type TicketLike = {
  id: string;
  storeId: string;
  ticketNo: number;
  partySize: number;
  guestLineId: string | null;
  memberId: string | null;
  member?: { id: string; lineUserId: string; displayName: string | null } | null;
};

/** Resolve LINE destination: ticket.guestLineId or linked Member.lineUserId. Never invent a recipient. */
export function resolveWaitlistLineTarget(ticket: TicketLike): WaitlistLineTarget {
  const fromGuest = ticket.guestLineId?.trim() || null;
  if (fromGuest) {
    return {
      lineUserId: fromGuest,
      memberId: ticket.memberId ?? ticket.member?.id ?? null,
      source: "guestLineId",
    };
  }
  const fromMember = ticket.member?.lineUserId?.trim() || null;
  if (fromMember) {
    return {
      lineUserId: fromMember,
      memberId: ticket.member?.id ?? ticket.memberId ?? null,
      source: "member",
    };
  }
  return { lineUserId: null, memberId: ticket.memberId ?? null, source: "none" };
}

export async function loadTicketForNotify(id: string, storeId: string) {
  return prisma.waitlistTicket.findFirst({
    where: { id, storeId },
    include: {
      member: { select: { id: true, lineUserId: true, displayName: true } },
      table: { select: { id: true, code: true } },
    },
  });
}

/**
 * Push LINE only when a real lineUserId is bound.
 * Unbound → no push (staffHint for board); do not fake success to wrong user.
 */
export async function pushWaitlistLine(
  ticket: TicketLike,
  event: WaitlistNotifyEvent,
  opts?: { position?: number; tableCode?: string; meta?: Record<string, unknown> }
): Promise<WaitlistPushResult> {
  const target = resolveWaitlistLineTarget(ticket);
  if (!target.lineUserId) {
    return {
      pushed: false,
      reason: "unbound",
      to: null,
      staffHint: `整理券 ${ticket.ticketNo} 番は LINE 未連携のためプッシュしません（店内アナウンスのみ）`,
      line: null,
    };
  }

  const message = waitlistLineMessage(event, {
    ticketNo: ticket.ticketNo,
    partySize: ticket.partySize,
    position: opts?.position,
    tableCode: opts?.tableCode,
  });

  const line = await sendLineMessage({
    to: target.lineUserId,
    event,
    message,
    meta: {
      waitlistId: ticket.id,
      ticketNo: ticket.ticketNo,
      memberId: target.memberId,
      source: target.source,
      ...opts?.meta,
    },
  });

  return {
    pushed: true,
    reason: "sent",
    to: target.lineUserId,
    line,
  };
}

export async function writeWaitlistAudit(opts: {
  storeId: string;
  ticketId: string;
  staffId?: string | null;
  action: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  summary: string;
  detail?: Prisma.InputJsonValue;
}) {
  return prisma.waitlistAuditLog.create({
    data: {
      storeId: opts.storeId,
      ticketId: opts.ticketId,
      staffId: opts.staffId ?? null,
      action: opts.action,
      fromStatus: opts.fromStatus ?? null,
      toStatus: opts.toStatus ?? null,
      summary: opts.summary,
      detail: opts.detail === undefined ? undefined : opts.detail,
    },
  });
}

/**
 * Once-only almost-call when waiting position <= N.
 * Call after queue mutations (join/call/skip/seat/cancel).
 */
export async function maybeNotifyAlmostCalled(storeId: string): Promise<WaitlistPushResult[]> {
  const waiting = await prisma.waitlistTicket.findMany({
    where: { storeId, status: "waiting" },
    include: { member: { select: { id: true, lineUserId: true, displayName: true } } },
    orderBy: [{ ticketNo: "asc" }],
  });

  const results: WaitlistPushResult[] = [];
  for (let i = 0; i < waiting.length; i++) {
    const position = i + 1;
    if (position > WAITLIST_ALMOST_CALL_POSITION) break;
    const ticket = waiting[i]!;
    if (ticket.almostCalledAt) continue;

    const push = await pushWaitlistLine(ticket, "waitlist.almost_called", {
      position,
      meta: { almostCall: true },
    });
    results.push(push);

    await prisma.waitlistTicket.update({
      where: { id: ticket.id },
      data: { almostCalledAt: new Date() },
    });

    await writeWaitlistAudit({
      storeId,
      ticketId: ticket.id,
      action: "almost_call",
      fromStatus: "waiting",
      toStatus: "waiting",
      summary: push.pushed
        ? `もうすぐ呼出 LINE → ${push.to}`
        : `もうすぐ呼出（未連携・プッシュなし） #${ticket.ticketNo}`,
      detail: { position, pushed: push.pushed, to: push.to ?? null },
    });
  }
  return results;
}
