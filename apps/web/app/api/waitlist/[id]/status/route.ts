import { prisma } from "@shinso/db";
import { WAITLIST_STATUS_JA } from "@shinso/api";
import { error, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

/** Public guest status — number, position, Japanese status. No auth. */
export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  const ticket = await prisma.waitlistTicket.findFirst({
    where: token ? { id, publicToken: token } : { id },
    select: {
      id: true,
      storeId: true,
      ticketNo: true,
      partySize: true,
      status: true,
      guestName: true,
      publicToken: true,
      calledAt: true,
      expiresAt: true,
      businessDate: true,
      createdAt: true,
    },
  });
  if (!ticket) return error("整理券が見つかりません", 404);

  let position: number | null = null;
  if (ticket.status === "waiting") {
    const ahead = await prisma.waitlistTicket.count({
      where: {
        storeId: ticket.storeId,
        status: "waiting",
        businessDate: ticket.businessDate,
        ticketNo: { lt: ticket.ticketNo },
      },
    });
    position = ahead + 1;
  }

  const statusJa =
    WAITLIST_STATUS_JA[ticket.status as keyof typeof WAITLIST_STATUS_JA] ?? ticket.status;

  return json({
    timezone: "Asia/Tokyo",
    ticket: {
      id: ticket.id,
      ticketNo: ticket.ticketNo,
      partySize: ticket.partySize,
      status: ticket.status,
      statusJa,
      position,
      guestName: ticket.guestName,
      calledAt: ticket.calledAt,
      expiresAt: ticket.expiresAt,
      publicToken: ticket.publicToken,
    },
  });
}
