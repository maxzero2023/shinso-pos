import { prisma } from "@shinso/db";
import { verifyQrToken, addItemSchema } from "@shinso/api";
import { error, json } from "@/lib/http";
import { getQrSecret } from "@/lib/env";

type Ctx = { params: Promise<{ token: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const payload = verifyQrToken(token, getQrSecret());
  if (!payload) return error("QRトークンが無効です", 401);

  const body = await req.json().catch(() => null);
  const parsed = addItemSchema.safeParse(body);
  if (!parsed.success) return error("入力が不正です", 400);

  const check = await prisma.check.findFirst({
    where: { tableId: payload.tableId, status: "open" },
  });
  if (!check) {
    return error("オープン中の伝票がありません。店員にお声がけください。", 409);
  }

  const menuItem = await prisma.menuItem.findFirst({
    where: {
      id: parsed.data.menuItemId,
      active: true,
      category: { storeId: payload.storeId },
    },
    include: { modifierGroups: { include: { modifiers: true } } },
  });
  if (!menuItem) return error("メニューが見つかりません", 404);

  const allMods = menuItem.modifierGroups.flatMap((g) => g.modifiers);
  const selected = allMods.filter((m) => parsed.data.modifierIds.includes(m.id));

  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.checkItem.create({
      data: {
        checkId: check.id,
        menuItemId: menuItem.id,
        name: menuItem.name,
        unitPriceYen: menuItem.priceYen,
        qty: parsed.data.qty,
        modifiers: selected.map((m) => ({ id: m.id, name: m.name, priceYen: m.priceYen })),
        seat: parsed.data.seat,
        note: parsed.data.note,
        status: "draft",
      },
    });
    await tx.table.update({
      where: { id: check.tableId },
      data: { status: "ordering" },
    });
    return created;
  });

  return json({ item, checkId: check.id }, 201);
}
