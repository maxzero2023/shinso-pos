import { prisma } from "@shinso/db";
import { updateReservationSchema } from "@shinso/api";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;
  const { id } = await ctx.params;

  const reservation = await prisma.reservation.findFirst({
    where: { id, storeId: session.storeId },
    include: {
      table: { select: { id: true, code: true, seats: true, status: true } },
      check: { select: { id: true, status: true } },
    },
  });
  if (!reservation) return error("予約が見つかりません", 404);
  return json({ reservation });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;
  const { id } = await ctx.params;

  const existing = await prisma.reservation.findFirst({
    where: { id, storeId: session.storeId },
  });
  if (!existing) return error("予約が見つかりません", 404);
  if (existing.status === "cancelled" || existing.status === "seated" || existing.status === "noshow") {
    return error(`ステータス ${existing.status} の予約は変更できません`, 409);
  }

  const body = await req.json().catch(() => null);
  const parsed = updateReservationSchema.safeParse(body);
  if (!parsed.success) return error("入力が不正です", 400, { details: parsed.error.flatten() });

  const data = parsed.data;
  if (data.tableId) {
    const table = await prisma.table.findFirst({
      where: { id: data.tableId, area: { storeId: session.storeId } },
    });
    if (!table) return error("テーブルが見つかりません", 404);
  }

  const startAt = data.startAt ? new Date(data.startAt) : undefined;
  const endAt = data.endAt ? new Date(data.endAt) : undefined;
  if (startAt && Number.isNaN(startAt.getTime())) return error("startAt が不正です", 400);
  if (endAt && Number.isNaN(endAt.getTime())) return error("endAt が不正です", 400);

  const nextStart = startAt ?? existing.startAt;
  const nextEnd = endAt ?? existing.endAt;
  if (nextEnd <= nextStart) return error("endAt は startAt より後である必要があります", 400);

  const reservation = await prisma.reservation.update({
    where: { id },
    data: {
      ...(data.tableId !== undefined ? { tableId: data.tableId } : {}),
      ...(data.partySize !== undefined ? { partySize: data.partySize } : {}),
      ...(startAt ? { startAt } : {}),
      ...(endAt ? { endAt } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.guestName !== undefined ? { guestName: data.guestName } : {}),
      ...(data.guestPhone !== undefined ? { guestPhone: data.guestPhone } : {}),
      ...(data.guestLineId !== undefined ? { guestLineId: data.guestLineId } : {}),
      ...(data.note !== undefined ? { note: data.note } : {}),
    },
    include: {
      table: { select: { id: true, code: true, seats: true, status: true } },
    },
  });

  return json({ reservation });
}
