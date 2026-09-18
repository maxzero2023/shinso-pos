import { prisma } from "@shinso/db";
import { verifyQrToken, resolveLocaleFromRequest, withDisplayName } from "@shinso/api";
import { error, json } from "@/lib/http";
import { getQrSecret } from "@/lib/env";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const payload = verifyQrToken(token, getQrSecret());
  if (!payload) return error("QRトークンが無効です", 401);

  const locale = resolveLocaleFromRequest(req);

  const table = await prisma.table.findFirst({
    where: { id: payload.tableId, area: { storeId: payload.storeId } },
    include: { area: true },
  });
  if (!table) return error("テーブルが見つかりません", 404);

  const categories = await prisma.menuCategory.findMany({
    where: { storeId: payload.storeId, active: true },
    orderBy: { sortOrder: "asc" },
    include: {
      items: {
        where: { active: true },
        orderBy: { sortOrder: "asc" },
        include: {
          modifierGroups: {
            orderBy: { sortOrder: "asc" },
            include: { modifiers: { where: { active: true }, orderBy: { sortOrder: "asc" } } },
          },
        },
      },
    },
  });

  return json({
    locale,
    table: { id: table.id, code: table.code, areaName: table.area.name },
    categories: categories.map((c) => ({
      ...withDisplayName(c, locale),
      items: c.items.map((item) => withDisplayName(item, locale)),
    })),
  });
}
