import { prisma } from "@shinso/db";
import {
  joinWaitlistSchema,
  WAITLIST_CALL_TIMEOUT_MINUTES,
  waitlistBusinessDate,
  waitlistLineMessage,
} from "@shinso/api";
import { getSession } from "@/lib/session";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import {
  maybeNotifyAlmostCalled,
  pushWaitlistLine,
  writeWaitlistAudit,
} from "@/lib/waitlist-notify";

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
  const includeSkipped = url.searchParams.get("skipped") === "1";

  const statuses = includeSkipped
    ? (["waiting", "called", "skipped"] as ("waiting" | "called" | "skipped")[])
    : (["waiting", "called"] as ("waiting" | "called")[]);

  const waitlist = await prisma.waitlistTicket.findMany({
    where: {
      storeId: session.storeId,
      ...(activeOnly ? { status: { in: statuses } } : {}),
    },
    include: {
      table: { select: { id: true, code: true, seats: true, status: true } },
      member: { select: { id: true, lineUserId: true, displayName: true, points: true } },
    },
    orderBy: [{ ticketNo: "asc" }],
  });

  const waitingOrdered = waitlist.filter((t) => t.status === "waiting");
  const withPosition = waitlist.map((t) => {
    const position =
      t.status === "waiting" ? waitingOrdered.findIndex((w) => w.id === t.id) + 1 : null;
    const lineBound = Boolean(t.guestLineId || t.member?.lineUserId);
    return { ...t, position: position || null, lineBound };
  });

  return json({
    timezone: "Asia/Tokyo",
    callTimeoutMinutes: WAITLIST_CALL_TIMEOUT_MINUTES,
    waitlist: withPosition,
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

  let memberId = parsed.data.memberId ?? null;
  let guestLineId = parsed.data.guestLineId ?? null;

  if (memberId) {
    const member = await prisma.member.findFirst({ where: { id: memberId, storeId } });
    if (!member) return error("会員が見つかりません", 404);
    guestLineId = guestLineId ?? member.lineUserId;
  } else if (guestLineId) {
    const member = await prisma.member.findUnique({
      where: { storeId_lineUserId: { storeId, lineUserId: guestLineId } },
    });
    if (member) memberId = member.id;
  }

  const businessDate = waitlistBusinessDate();
  const last = await prisma.waitlistTicket.findFirst({
    where: { storeId, businessDate },
    orderBy: { ticketNo: "desc" },
    select: { ticketNo: true },
  });
  const ticketNo = (last?.ticketNo ?? 0) + 1;

  const ticket = await prisma.waitlistTicket.create({
    data: {
      storeId,
      partySize: parsed.data.partySize,
      ticketNo,
      businessDate,
      guestName: parsed.data.guestName ?? null,
      guestPhone: parsed.data.guestPhone ?? null,
      guestLineId,
      memberId,
      note: parsed.data.note ?? null,
      status: "waiting",
    },
    include: {
      member: { select: { id: true, lineUserId: true, displayName: true } },
    },
  });

  await writeWaitlistAudit({
    storeId,
    ticketId: ticket.id,
    staffId: session?.staffId ?? null,
    action: "join",
    fromStatus: null,
    toStatus: "waiting",
    summary: `取号 #${ticket.ticketNo}`,
    detail: { memberId, guestLineId },
  });

  const push = await pushWaitlistLine(ticket, "waitlist.joined");
  await maybeNotifyAlmostCalled(storeId);

  const waitingAhead = await prisma.waitlistTicket.count({
    where: {
      storeId,
      status: "waiting",
      ticketNo: { lt: ticket.ticketNo },
      businessDate,
    },
  });

  return json(
    {
      ticket: {
        ...ticket,
        position: waitingAhead + 1,
        lineBound: Boolean(ticket.guestLineId || ticket.member?.lineUserId),
        statusUrl: `/waitlist/${ticket.id}`,
      },
      notify: {
        pushed: push.pushed,
        reason: push.reason,
        staffHint: push.staffHint ?? null,
        message: waitlistLineMessage("waitlist.joined", {
          ticketNo: ticket.ticketNo,
          partySize: ticket.partySize,
        }),
      },
    },
    201
  );
}
