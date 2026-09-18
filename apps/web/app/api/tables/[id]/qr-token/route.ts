import { prisma } from "@shinso/db";
import { signQrToken } from "@shinso/api";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import { getAppUrl, getQrSecret } from "@/lib/env";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;
  const { id } = await ctx.params;

  const table = await prisma.table.findFirst({
    where: { id, area: { storeId: session.storeId } },
  });
  if (!table) return error("テーブルが見つかりません", 404);

  const token = signQrToken(
    {
      tableId: table.id,
      storeId: session.storeId,
      exp: Date.now() + 1000 * 60 * 60 * 12,
    },
    getQrSecret()
  );
  const url = `${getAppUrl()}/qr/${token}`;
  return json({ token, url, tableId: table.id, code: table.code });
}
