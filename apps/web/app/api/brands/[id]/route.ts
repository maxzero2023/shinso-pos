import { prisma } from "@shinso/db";
import { brandUpdateSchema } from "@shinso/api";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await requireSession(["brand_admin", "owner", "manager"]);
  if (isResponse(session)) return session;
  const { id } = await ctx.params;
  if (session.brandId && session.brandId !== id && session.role === "brand_admin") {
    return error("権限がありません", 403);
  }
  const brand = await prisma.brand.findUnique({
    where: { id },
    include: {
      stores: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!brand) return error("ブランドが見つかりません", 404);
  if (session.role !== "brand_admin") {
    const storeId = session.activeStoreId || session.storeId;
    brand.stores = brand.stores.filter((s) => s.id === storeId);
  }
  return json({ brand });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await requireSession(["brand_admin"]);
  if (isResponse(session)) return session;
  const { id } = await ctx.params;
  if (session.brandId !== id) return error("権限がありません", 403);
  const body = await req.json().catch(() => null);
  const parsed = brandUpdateSchema.safeParse(body);
  if (!parsed.success) return error("入力が不正です", 400);
  const brand = await prisma.brand.update({
    where: { id },
    data: { name: parsed.data.name },
  });
  return json({ brand });
}
