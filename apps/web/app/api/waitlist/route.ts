import { prisma } from "@shinso/db";
import { joinWaitlistSchema, WAITLIST_CALL_TIMEOUT_MINUTES } from "@shinso/api";
import { getSession } from "@/lib/session";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import { sendNotify } from "@/lib/notify";

async function expireStaleCalled(storeId: string) {
  const cutoff = new Date(Date.now() - WAITLIST_CALL_TIMEOUT_MINUTES * 60_000);
  await prisma.waitlistTicket.updateMany({
    where: {
      storeId,
      status: "called",
      OR: [
        { expiresAt: { lt: new Date() } },
        { calledAt: { lt: cutoff }, expiresAt: null },
      ],
    },
    data: { status: "expired" },
  });
}

export async function GET(req: Request) {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;

  await expireStaleCalled(session.storeId);

  const url = new URL(req.url);
  const activeOnly = url.searchParams.get("active") !== "0";

  const waitlist = await prisma.waitlistTicket.findMany({
    where: {
      storeId: session.storeId,
      ...(activeOnly ? { status: { in: ["waiting", "called"] } } : {}),
    },
    include: {
      table: { select: { id: true, code: true, seats: true, status: true } },
    },
    orderBy: [{ ticketNo: "asc" }],
  });

  return json({
    timezone: "Asia/Tokyo",
    callTimeoutMinutes: WAITLIST_CALL_TIMEOUT_MINUTES,
    waitlist,
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  const body = await req.json().catch(() => null);
  const parsed = joinWaitlistSchema.safeParse(body);
  if (!parsed.success) return error("入力が不正です", 400, { details: parsed.error.flatten() });

  let storeId = session?.storeId;
  if (!storeId) {
    const store = await prisma.store.findFirst({ orderBy: { createdAt: "asc" } });
    if (!store) return error("店舗がありません", 404);
    storeId = store.id;
  }

  const last = await prisma.waitlistTicket.findFirst({
    where: { storeId },
    orderBy: { ticketNo: "desc" },
    select: { ticketNo: true },
  });
  const ticketNo = (last?.ticketNo ?? 0) + 1;

  const ticket = await prisma.waitlistTicket.create({
    data: {
      storeId,
      partySize: parsed.data.partySize,
      ticketNo,
      guestName: parsed.data.guestName ?? null,
      guestPhone: parsed.data.guestPhone ?? null,
      guestLineId: parsed.data.guestLineId ?? null,
      note: parsed.data.note ?? null,
      status: "waiting",
    },
  });

  await sendNotify({
    channel: "line",
    event: "waitlist.joined",
    to: ticket.guestLineId ?? ticket.guestPhone ?? ticket.guestName,
    message: `整理券 ${ticket.ticketNo} 番でお待ちください（${ticket.partySize}名）`,
    meta: { waitlistId: ticket.id, ticketNo: ticket.ticketNo },
  });

  return json({ ticket }, 201);
}
