import { prisma } from "@shinso/db";
import { WAITLIST_CALL_TIMEOUT_MINUTES } from "@shinso/api";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import { sendNotify } from "@/lib/notify";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;
  const { id } = await ctx.params;

  const existing = await prisma.waitlistTicket.findFirst({
    where: { id, storeId: session.storeId },
  });
  if (!existing) return error("候位チケットが見つかりません", 404);
  if (existing.status !== "waiting" && existing.status !== "called") {
    return error(`ステータス ${existing.status} は呼べません`, 409);
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + WAITLIST_CALL_TIMEOUT_MINUTES * 60_000);

  const ticket = await prisma.waitlistTicket.update({
    where: { id },
    data: { status: "called", calledAt: now, expiresAt },
  });

  await sendNotify({
    channel: "line",
    event: "waitlist.called",
    to: ticket.guestLineId ?? ticket.guestPhone ?? ticket.guestName,
    message: `${ticket.ticketNo} 番のお客様、お席へお越しください`,
    meta: { waitlistId: ticket.id, ticketNo: ticket.ticketNo, expiresAt: expiresAt.toISOString() },
  });

  return json({ ticket });
}
