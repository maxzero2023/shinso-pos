import { prisma } from "@shinso/db";
import { WAITLIST_CALL_TIMEOUT_MINUTES } from "@shinso/api";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import {
  pushWaitlistLine,
  writeWaitlistAudit,
} from "@/lib/waitlist-notify";

type Ctx = { params: Promise<{ id: string }> };

/** 重叫: skipped → called with audit + LINE if bound. */
export async function POST(_req: Request, ctx: Ctx) {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;
  const { id } = await ctx.params;

  const existing = await prisma.waitlistTicket.findFirst({
    where: { id, storeId: session.storeId },
    include: { member: { select: { id: true, lineUserId: true, displayName: true } } },
  });
  if (!existing) return error("候位チケットが見つかりません", 404);
  if (existing.status !== "skipped") {
    return error("過号チケットのみ再呼出できます", 409);
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + WAITLIST_CALL_TIMEOUT_MINUTES * 60_000);

  const ticket = await prisma.waitlistTicket.update({
    where: { id },
    data: {
      status: "called",
      calledAt: now,
      expiresAt,
      skippedAt: null,
    },
    include: { member: { select: { id: true, lineUserId: true, displayName: true } } },
  });

  const push = await pushWaitlistLine(ticket, "waitlist.recalled", {
    meta: { expiresAt: expiresAt.toISOString(), recall: true },
  });

  await writeWaitlistAudit({
    storeId: session.storeId,
    ticketId: ticket.id,
    staffId: session.staffId,
    action: "recall",
    fromStatus: "skipped",
    toStatus: "called",
    summary: push.pushed
      ? `再呼出 #${ticket.ticketNo} LINE → ${push.to}`
      : `再呼出 #${ticket.ticketNo}（LINE 未連携・プッシュなし）`,
    detail: { pushed: push.pushed, to: push.to ?? null, reason: push.reason },
  });

  return json({
    ticket: {
      ...ticket,
      lineBound: Boolean(ticket.guestLineId || ticket.member?.lineUserId),
    },
    notify: {
      pushed: push.pushed,
      reason: push.reason,
      staffHint: push.staffHint ?? null,
      to: push.to ?? null,
    },
  });
}
