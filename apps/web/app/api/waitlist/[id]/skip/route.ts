import { prisma } from "@shinso/db";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import {
  maybeNotifyAlmostCalled,
  pushWaitlistLine,
  writeWaitlistAudit,
} from "@/lib/waitlist-notify";

type Ctx = { params: Promise<{ id: string }> };

/** 过号: waiting|called → skipped. Optional LINE notice when bound. */
export async function POST(_req: Request, ctx: Ctx) {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;
  const { id } = await ctx.params;

  const existing = await prisma.waitlistTicket.findFirst({
    where: { id, storeId: session.storeId },
    include: { member: { select: { id: true, lineUserId: true, displayName: true } } },
  });
  if (!existing) return error("候位チケットが見つかりません", 404);
  if (existing.status !== "waiting" && existing.status !== "called") {
    return error(`ステータス ${existing.status} は過号にできません`, 409);
  }

  const fromStatus = existing.status;
  const now = new Date();
  const ticket = await prisma.waitlistTicket.update({
    where: { id },
    data: { status: "skipped", skippedAt: now, expiresAt: null },
    include: { member: { select: { id: true, lineUserId: true, displayName: true } } },
  });

  const push = await pushWaitlistLine(ticket, "waitlist.skipped");

  await writeWaitlistAudit({
    storeId: session.storeId,
    ticketId: ticket.id,
    staffId: session.staffId,
    action: "skip",
    fromStatus,
    toStatus: "skipped",
    summary: `過号 #${ticket.ticketNo}`,
    detail: { pushed: push.pushed, to: push.to ?? null },
  });

  await maybeNotifyAlmostCalled(session.storeId);

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
