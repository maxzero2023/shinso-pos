import { prisma } from "@shinso/db";
import { seatWaitlistSchema } from "@shinso/api";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import { openCheckOnTable } from "@/lib/seat-check";
import {
  maybeNotifyAlmostCalled,
  pushWaitlistLine,
  writeWaitlistAudit,
} from "@/lib/waitlist-notify";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;
  const { id } = await ctx.params;

  const existing = await prisma.waitlistTicket.findFirst({
    where: { id, storeId: session.storeId },
    include: { member: { select: { id: true, lineUserId: true, displayName: true } } },
  });
  if (!existing) return error("候位チケットが見つかりません", 404);
  if (existing.status === "cancelled" || existing.status === "expired") {
    return error("キャンセル / 期限切れチケットは開台できません", 409);
  }
  if (existing.status === "seated" && existing.checkId) {
    return error("すでに開台済みです", 409, { checkId: existing.checkId });
  }

  const body = await req.json().catch(() => null);
  const parsed = seatWaitlistSchema.safeParse(body);
  if (!parsed.success) {
    return error("入力が不正です（tableId 必須）", 400, { details: parsed.error.flatten() });
  }

  const guestCount = parsed.data.guestCount ?? existing.partySize;
  const opened = await openCheckOnTable({
    tableId: parsed.data.tableId,
    storeId: session.storeId,
    guestCount,
  });
  if ("error" in opened) {
    return error(opened.error ?? "開台失敗", opened.status, opened.checkId ? { checkId: opened.checkId } : undefined);
  }

  const fromStatus = existing.status;
  const now = new Date();
  const ticket = await prisma.waitlistTicket.update({
    where: { id },
    data: {
      status: "seated",
      tableId: parsed.data.tableId,
      checkId: opened.check.id,
      seatedAt: now,
    },
    include: {
      table: { select: { id: true, code: true, seats: true, status: true } },
      check: { select: { id: true, status: true, guestCount: true } },
      member: { select: { id: true, lineUserId: true, displayName: true } },
    },
  });

  // Optionally attach member to opened check for CRM continuity
  if (ticket.memberId) {
    await prisma.check.update({
      where: { id: opened.check.id },
      data: { memberId: ticket.memberId },
    });
  }

  const push = await pushWaitlistLine(ticket, "waitlist.seated", {
    tableCode: ticket.table?.code,
    meta: { checkId: opened.check.id },
  });

  await writeWaitlistAudit({
    storeId: session.storeId,
    ticketId: ticket.id,
    staffId: session.staffId,
    action: "seat",
    fromStatus,
    toStatus: "seated",
    summary: `着席開台 #${ticket.ticketNo} → ${ticket.table?.code ?? ""}`,
    detail: { checkId: opened.check.id, pushed: push.pushed },
  });

  await maybeNotifyAlmostCalled(session.storeId);

  return json(
    {
      ticket: {
        ...ticket,
        lineBound: Boolean(ticket.guestLineId || ticket.member?.lineUserId),
      },
      check: opened.check,
      notify: {
        pushed: push.pushed,
        reason: push.reason,
        staffHint: push.staffHint ?? null,
        to: push.to ?? null,
      },
    },
    201
  );
}
