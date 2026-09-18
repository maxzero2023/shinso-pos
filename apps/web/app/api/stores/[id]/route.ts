import { prisma } from "@shinso/db";
import { storeUpdateSchema } from "@shinso/api";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { assertCanAccessStore } from "@/lib/store-access";
import { error, json } from "@/lib/http";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await requireSession(["brand_admin", "owner", "manager", "floor", "kitchen"]);
  if (isResponse(session)) return session;
  const { id } = await ctx.params;
  const access = await assertCanAccessStore(session, id);
  if (!access.ok) return error(access.message, access.status);
  const store = await prisma.store.findUnique({ where: { id } });
  return json({ store });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await requireSession(["brand_admin"]);
  if (isResponse(session)) return session;
  const { id } = await ctx.params;
  const access = await assertCanAccessStore(session, id);
  if (!access.ok) return error(access.message, access.status);

  const body = await req.json().catch(() => null);
  const parsed = storeUpdateSchema.safeParse(body);
  if (!parsed.success) return error("入力が不正です", 400);

  const store = await prisma.store.update({
    where: { id },
    data: {
      ...(parsed.data.name != null ? { name: parsed.data.name } : {}),
      ...(parsed.data.timezone != null ? { timezone: parsed.data.timezone } : {}),
    },
  });
  return json({ store });
}
