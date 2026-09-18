import { prisma } from "@shinso/db";
import { paySchema, sumCheckItems } from "@shinso/api";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = paySchema.safeParse(body);
  if (!parsed.success) return error("入力が不正です", 400);

  const check = await prisma.check.findFirst({
    where: { id, table: { area: { storeId: session.storeId } } },
    include: { items: true },
  });
  if (!check) return error("伝票が見つかりません", 404);
  if (check.status !== "open") return error("すでに精算済みです", 409);

  const total = sumCheckItems(check.items);
  if (parsed.data.amountYen !== total) {
    return error(`金額が一致しません（合計 ${total} 円）`, 400, { totalYen: total });
  }

  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        checkId: check.id,
        method: parsed.data.method,
        amountYen: parsed.data.amountYen,
        mock: true,
      },
    });
    const paid = await tx.check.update({
      where: { id: check.id },
      data: { status: "paid", closedAt: new Date() },
    });
    await tx.table.update({
      where: { id: check.tableId },
      data: { status: "free" },
    });
    return { payment, check: paid };
  });

  return json(result);
}
