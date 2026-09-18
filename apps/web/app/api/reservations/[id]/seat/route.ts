import { prisma } from "@shinso/db";
import { seatReservationSchema } from "@shinso/api";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import { openCheckOnTable } from "@/lib/seat-check";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;
  const { id } = await ctx.params;

  const existing = await prisma.reservation.findFirst({
    where: { id, storeId: session.storeId },
  });
  if (!existing) return error("予約が見つかりません", 404);
  if (existing.status === "cancelled" || existing.status === "noshow") {
    return error("キャンセル / ノーショーの予約は開台できません", 409);
  }
  if (existing.status === "seated" && existing.checkId) {
    return error("すでに開台済みです", 409, { checkId: existing.checkId });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = seatReservationSchema.safeParse(body);
  if (!parsed.success) return error("入力が不正です", 400, { details: parsed.error.flatten() });

  const tableId = parsed.data.tableId ?? existing.tableId;
  if (!tableId) return error("テーブルを指定してください", 400);

  const guestCount = parsed.data.guestCount ?? existing.partySize;
  const opened = await openCheckOnTable({
    tableId,
    storeId: session.storeId,
    guestCount,
  });
  if ("error" in opened) {
    return error(opened.error, opened.status, opened.checkId ? { checkId: opened.checkId } : undefined);
  }

  const reservation = await prisma.reservation.update({
    where: { id },
    data: {
      status: "seated",
      tableId,
      checkId: opened.check.id,
    },
    include: {
      table: { select: { id: true, code: true, seats: true, status: true } },
      check: { select: { id: true, status: true, guestCount: true } },
    },
  });

  return json({ reservation, check: opened.check }, 201);
}
