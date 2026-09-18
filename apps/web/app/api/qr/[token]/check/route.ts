import { prisma } from "@shinso/db";
import { verifyQrToken, sumCheckItems } from "@shinso/api";
import { error, json } from "@/lib/http";
import { getQrSecret } from "@/lib/env";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const payload = verifyQrToken(token, getQrSecret());
  if (!payload) return error("QRトークンが無効です", 401);

  const check = await prisma.check.findFirst({
    where: { tableId: payload.tableId, status: "open" },
    include: { items: { orderBy: { createdAt: "asc" } }, table: true },
  });
  if (!check) return error("オープン中の伝票がありません。店員にお声がけください。", 409);

  return json({
    check: {
      id: check.id,
      status: check.status,
      tableCode: check.table.code,
      items: check.items.filter((i) => i.status !== "void"),
      totalYen: sumCheckItems(check.items),
    },
  });
}
