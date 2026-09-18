import { prisma } from "@shinso/db";
import { storeCreateSchema } from "@shinso/api";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { listAccessibleStores } from "@/lib/store-access";
import { error, json } from "@/lib/http";

export async function GET() {
  const session = await requireSession(["brand_admin", "owner", "manager", "floor", "kitchen"]);
  if (isResponse(session)) return session;
  const stores = await listAccessibleStores(session);
  return json({ stores });
}

export async function POST(req: Request) {
  const session = await requireSession(["brand_admin"]);
  if (isResponse(session)) return session;
  if (!session.brandId) return error("ブランド未所属です", 403);

  const body = await req.json().catch(() => null);
  const parsed = storeCreateSchema.safeParse(body);
  if (!parsed.success) return error("brandId と name が必要です", 400);
  if (parsed.data.brandId !== session.brandId) {
    return error("他ブランドの店舗は作成できません", 403);
  }

  const store = await prisma.store.create({
    data: {
      brandId: parsed.data.brandId,
      name: parsed.data.name,
      timezone: parsed.data.timezone || "Asia/Tokyo",
    },
  });
  return json({ store }, 201);
}
