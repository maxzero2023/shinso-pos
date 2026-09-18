import { prisma } from "@shinso/db";
import {
  createReservationSchema,
  defaultEndAt,
  parseTokyoDayBounds,
  tokyoTodayYmd,
} from "@shinso/api";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import { sendNotify } from "@/lib/notify";

export async function GET(req: Request) {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;

  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? tokyoTodayYmd();
  const status = url.searchParams.get("status");

  let start: Date;
  let end: Date;
  try {
    ({ start, end } = parseTokyoDayBounds(date));
  } catch {
    return error("date は YYYY-MM-DD（Asia/Tokyo）で指定してください", 400);
  }

  const reservations = await prisma.reservation.findMany({
    where: {
      storeId: session.storeId,
      startAt: { gte: start, lte: end },
      ...(status ? { status: status as never } : {}),
    },
    include: {
      table: { select: { id: true, code: true, seats: true, status: true } },
    },
    orderBy: { startAt: "asc" },
  });

  return json({ date, timezone: "Asia/Tokyo", reservations });
}

export async function POST(req: Request) {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;

  const body = await req.json().catch(() => null);
  const parsed = createReservationSchema.safeParse(body);
  if (!parsed.success) return error("入力が不正です", 400, { details: parsed.error.flatten() });

  const data = parsed.data;
  const startAt = new Date(data.startAt);
  if (Number.isNaN(startAt.getTime())) return error("startAt が不正です", 400);
  const endAt = data.endAt ? new Date(data.endAt) : defaultEndAt(startAt);
  if (Number.isNaN(endAt.getTime()) || endAt <= startAt) {
    return error("endAt は startAt より後である必要があります", 400);
  }

  if (data.tableId) {
    const table = await prisma.table.findFirst({
      where: { id: data.tableId, area: { storeId: session.storeId } },
    });
    if (!table) return error("テーブルが見つかりません", 404);
  }

  const reservation = await prisma.reservation.create({
    data: {
      storeId: session.storeId,
      tableId: data.tableId ?? null,
      partySize: data.partySize,
      startAt,
      endAt,
      status: data.status,
      guestName: data.guestName ?? null,
      guestPhone: data.guestPhone ?? null,
      guestLineId: data.guestLineId ?? null,
      note: data.note ?? null,
    },
    include: {
      table: { select: { id: true, code: true, seats: true, status: true } },
    },
  });

  await sendNotify({
    channel: "line",
    event: "reservation.confirmed",
    to: reservation.guestLineId ?? reservation.guestPhone ?? reservation.guestName,
    message: `ご予約を承りました（${reservation.partySize}名 / ${startAt.toISOString()}）`,
    meta: { reservationId: reservation.id, status: reservation.status },
  });

  return json({ reservation }, 201);
}
