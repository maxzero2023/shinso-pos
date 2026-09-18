import { prisma } from "@shinso/db";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import { sendNotify } from "@/lib/notify";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;
  const { id } = await ctx.params;

  const existing = await prisma.reservation.findFirst({
    where: { id, storeId: session.storeId },
  });
  if (!existing) return error("予約が見つかりません", 404);
  if (existing.status === "cancelled") return json({ reservation: existing });
  if (existing.status === "seated") return error("着席済みの予約はキャンセルできません", 409);

  const reservation = await prisma.reservation.update({
    where: { id },
    data: { status: "cancelled" },
    include: {
      table: { select: { id: true, code: true, seats: true, status: true } },
    },
  });

  await sendNotify({
    channel: "line",
    event: "reservation.cancelled",
    to: reservation.guestLineId ?? reservation.guestPhone ?? reservation.guestName,
    message: `ご予約をキャンセルしました（${reservation.partySize}名）`,
    meta: { reservationId: reservation.id },
  });

  return json({ reservation });
}
