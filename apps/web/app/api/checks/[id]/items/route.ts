import { prisma } from "@shinso/db";
import { addItemSchema } from "@shinso/api";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = addItemSchema.safeParse(body);
  if (!parsed.success) return error("入力が不正です", 400);

  const check = await prisma.check.findFirst({
    where: { id, table: { area: { storeId: session.storeId } } },
  });
  if (!check) return error("伝票が見つかりません", 404);
  if (check.status !== "open") return error("締めた伝票には追加できません", 409);

  const menuItem = await prisma.menuItem.findFirst({
    where: {
      id: parsed.data.menuItemId,
      active: true,
      category: { storeId: session.storeId },
    },
    include: { modifierGroups: { include: { modifiers: true } } },
  });
  if (!menuItem) return error("メニューが見つかりません", 404);

  const allMods = menuItem.modifierGroups.flatMap((g) => g.modifiers);
  const selected = allMods.filter((m) => parsed.data.modifierIds.includes(m.id));
  const modifiers = selected.map((m) => ({
    id: m.id,
    name: m.name,
    priceYen: m.priceYen,
  }));

  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.checkItem.create({
      data: {
        checkId: check.id,
        menuItemId: menuItem.id,
        name: menuItem.name,
        unitPriceYen: menuItem.priceYen,
        qty: parsed.data.qty,
        modifiers,
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

  return json({ item }, 201);
}
