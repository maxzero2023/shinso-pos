import { prisma } from "@shinso/db";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;
  const { id } = await ctx.params;

  const existing = await prisma.waitlistTicket.findFirst({
    where: { id, storeId: session.storeId },
  });
  if (!existing) return error("候位チケットが見つかりません", 404);
  if (existing.status === "seated") return error("着席済みはキャンセルできません", 409);
  if (existing.status === "cancelled") return json({ ticket: existing });

  const ticket = await prisma.waitlistTicket.update({
    where: { id },
    data: { status: "cancelled" },
  });
  return json({ ticket });
}
