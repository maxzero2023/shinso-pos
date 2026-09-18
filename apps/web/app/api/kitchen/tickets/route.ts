import { prisma } from "@shinso/db";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { json } from "@/lib/http";
import type { KitchenTicketStatus } from "@shinso/db";

export async function GET(req: Request) {
  const session = await requireSession(["owner", "floor", "kitchen"]);
  if (isResponse(session)) return session;
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") as KitchenTicketStatus | null;

  const tickets = await prisma.kitchenTicket.findMany({
    where: {
      check: { table: { area: { storeId: session.storeId } } },
      ...(status ? { status } : { status: { not: "served" } }),
    },
    orderBy: { firedAt: "asc" },
    include: {
      lines: true,
      check: { include: { table: { include: { area: true } } } },
    },
  });

  return json({ tickets });
}
