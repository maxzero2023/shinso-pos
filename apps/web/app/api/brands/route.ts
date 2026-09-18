import { prisma } from "@shinso/db";
import { brandCreateSchema, PERMISSION_MATRIX } from "@shinso/api";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";

export async function GET() {
  const session = await requireSession(["brand_admin", "owner", "manager"]);
  if (isResponse(session)) return session;

  if (session.role === "brand_admin" && session.brandId) {
    const brands = await prisma.brand.findMany({
      where: { id: session.brandId },
      include: {
        stores: { orderBy: { createdAt: "asc" }, select: { id: true, name: true, timezone: true, brandId: true } },
      },
    });
    return json({ brands, permissionMatrix: PERMISSION_MATRIX });
  }

  // Store elevated: only their brand tree (read-only brand name + own store)
  const store = await prisma.store.findUnique({
    where: { id: session.activeStoreId || session.storeId },
    include: { brand: true },
  });
  if (!store) return json({ brands: [], permissionMatrix: PERMISSION_MATRIX });
  return json({
    brands: [
      {
        id: store.brand.id,
        name: store.brand.name,
        stores: [{ id: store.id, name: store.name, timezone: store.timezone, brandId: store.brandId }],
      },
    ],
    permissionMatrix: PERMISSION_MATRIX,
  });
}

export async function POST(req: Request) {
  const session = await requireSession(["brand_admin"]);
  if (isResponse(session)) return session;
  // MVP: brand_admin manages only their own brand; creating additional brands out of scope
  // Allow create only if no brand yet (edge) — otherwise 403
  if (session.brandId) {
    return error("MVP ではブランド管理者は所属ブランドのみ操作できます（新規ブランド作成は対象外）", 403);
  }
  const body = await req.json().catch(() => null);
  const parsed = brandCreateSchema.safeParse(body);
  if (!parsed.success) return error("name が必要です", 400);
  const brand = await prisma.brand.create({ data: { name: parsed.data.name } });
  return json({ brand }, 201);
}
