import { prisma } from "@shinso/db";
import { seatWaitlistSchema } from "@shinso/api";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import { openCheckOnTable } from "@/lib/seat-check";
import { sendNotify } from "@/lib/notify";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;
  const { id } = await ctx.params;

  const existing = await prisma.waitlistTicket.findFirst({
    where: { id, storeId: session.storeId },
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
    },
  });

  await sendNotify({
    channel: "line",
    event: "waitlist.seated",
    to: ticket.guestLineId ?? ticket.guestPhone ?? ticket.guestName,
    message: `${ticket.ticketNo} 番 ご案内完了（卓 ${ticket.table?.code ?? ""}）`,
    meta: { waitlistId: ticket.id, checkId: opened.check.id },
  });

  return json({ ticket, check: opened.check }, 201);
}
