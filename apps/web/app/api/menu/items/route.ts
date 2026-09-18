import { prisma } from "@shinso/db";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";

export async function POST(req: Request) {
  const session = await requireSession(["owner"]);
  if (isResponse(session)) return session;
  const body = await req.json().catch(() => null);
  if (!body?.categoryId || !body?.name || body?.priceYen == null) {
    return error("categoryId, name, priceYen が必要です");
  }
  const category = await prisma.menuCategory.findFirst({
    where: { id: body.categoryId, storeId: session.storeId },
  });
  if (!category) return error("カテゴリが見つかりません", 404);

  const item = await prisma.menuItem.create({
    data: {
      categoryId: category.id,
      name: String(body.name),
      description: body.description ? String(body.description) : null,
      priceYen: Number(body.priceYen),
      active: body.active !== false,
      sortOrder: Number(body.sortOrder ?? 0),
    },
  });
  return json({ item }, 201);
}
