import { prisma } from "@shinso/db";
import { sumCheckItems } from "@shinso/api";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await requireSession(["owner", "floor", "kitchen"]);
  if (isResponse(session)) return session;
  const { id } = await ctx.params;

  const check = await prisma.check.findFirst({
    where: { id, table: { area: { storeId: session.storeId } } },
    include: {
      table: { include: { area: true } },
      items: { orderBy: { createdAt: "asc" } },
      payments: true,
      kitchenTickets: { include: { lines: true }, orderBy: { firedAt: "desc" } },
    },
  });
  if (!check) return error("伝票が見つかりません", 404);

  return json({
    check: {
      ...check,
      totalYen: sumCheckItems(check.items),
    },
  });
}
