import { prisma } from "@shinso/db";
import { kitchenStatusSchema } from "@shinso/api";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await requireSession(["owner", "kitchen", "floor"]);
  if (isResponse(session)) return session;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = kitchenStatusSchema.safeParse(body);
  if (!parsed.success) return error("入力が不正です", 400);

  const existing = await prisma.kitchenTicket.findFirst({
    where: { id, check: { table: { area: { storeId: session.storeId } } } },
  });
  if (!existing) return error("チケットが見つかりません", 404);

  const ticket = await prisma.kitchenTicket.update({
    where: { id },
    data: { status: parsed.data.status },
    include: { lines: true },
  });
  return json({ ticket });
}
