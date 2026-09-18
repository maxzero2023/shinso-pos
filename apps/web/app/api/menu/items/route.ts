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
      nameZh: body.nameZh != null ? String(body.nameZh) : null,
      nameEn: body.nameEn != null ? String(body.nameEn) : null,
      description: body.description ? String(body.description) : null,
      priceYen: Number(body.priceYen),
      active: body.active !== false,
      sortOrder: Number(body.sortOrder ?? 0),
    },
  });
  return json({ item }, 201);
}

/** Minimal PATCH for trilingual names (AUT-36 / AUT-93). Body: { id, name?, nameZh?, nameEn? } */
export async function PATCH(req: Request) {
  const session = await requireSession(["owner"]);
  if (isResponse(session)) return session;
  const body = await req.json().catch(() => null);
  if (!body?.id) return error("id が必要です");

  const existing = await prisma.menuItem.findFirst({
    where: { id: String(body.id), category: { storeId: session.storeId } },
  });
  if (!existing) return error("メニューが見つかりません", 404);

  const item = await prisma.menuItem.update({
    where: { id: existing.id },
    data: {
      ...(body.name != null ? { name: String(body.name) } : {}),
      ...(body.nameZh !== undefined
        ? { nameZh: body.nameZh == null ? null : String(body.nameZh) }
        : {}),
      ...(body.nameEn !== undefined
        ? { nameEn: body.nameEn == null ? null : String(body.nameEn) }
        : {}),
    },
  });
  return json({ item });
}
