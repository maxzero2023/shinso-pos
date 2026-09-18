import { prisma } from "@shinso/db";
import { splitSchema, sumCheckItems } from "@shinso/api";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

/** MVP: returns payment intention groups; does not create child checks */
export async function POST(req: Request, ctx: Ctx) {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = splitSchema.safeParse(body);
  if (!parsed.success) return error("入力が不正です", 400);

  const check = await prisma.check.findFirst({
    where: { id, table: { area: { storeId: session.storeId } } },
    include: { items: true },
  });
  if (!check) return error("伝票が見つかりません", 404);
  if (check.status !== "open") return error("オープン伝票のみ分割できます", 409);

  const live = check.items.filter((i) => i.status !== "void");
  const total = sumCheckItems(live);

  if (parsed.data.strategy === "by_seat") {
    const seats = [...new Set(live.map((i) => i.seat ?? 0))].sort();
    const groups = seats.map((seat) => {
      const items = live.filter((i) => (i.seat ?? 0) === seat);
      return {
        seat: seat === 0 ? null : seat,
        itemIds: items.map((i) => i.id),
        totalYen: sumCheckItems(items),
      };
    });
    return json({ strategy: "by_seat", totalYen: total, groups });
  }

  const amount = parsed.data.amountYen ?? Math.ceil(total / 2);
  return json({
    strategy: "by_amount",
    totalYen: total,
    groups: [
      { label: "A", totalYen: amount },
      { label: "B", totalYen: Math.max(0, total - amount) },
    ],
  });
}
