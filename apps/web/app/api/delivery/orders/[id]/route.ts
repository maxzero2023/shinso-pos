import { patchExternalOrderMappingsSchema } from "@shinso/api";
import { prisma } from "@shinso/db";
import { requireSession, isResponse, activeStoreId } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import { patchExternalOrderMappings } from "@/lib/delivery";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await requireSession(["owner", "floor", "manager", "brand_admin", "kitchen"]);
  if (isResponse(session)) return session;
  const storeId = activeStoreId(session);
  const { id } = await ctx.params;

  const order = await prisma.externalOrder.findFirst({
    where: { id, storeId },
    include: {
      lines: {
        orderBy: { sortOrder: "asc" },
        include: { menuItem: { select: { id: true, name: true, priceYen: true, active: true } } },
      },
      check: {
        select: {
          id: true,
          status: true,
          channel: true,
          kitchenTickets: { select: { id: true, status: true, firedAt: true } },
        },
      },
    },
  });
  if (!order) return error("外部注文が見つかりません", 404);
  return json({ order });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await requireSession(["owner", "floor", "manager", "brand_admin"]);
  if (isResponse(session)) return session;
  const storeId = activeStoreId(session);
  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = patchExternalOrderMappingsSchema.safeParse(body);
  if (!parsed.success) {
    return error("入力が不正です", 400, { details: parsed.error.flatten() });
  }

  const result = await patchExternalOrderMappings({
    storeId,
    orderId: id,
    lines: parsed.data.lines,
    note: parsed.data.note,
    customerName: parsed.data.customerName,
    customerPhone: parsed.data.customerPhone,
  });
  if ("error" in result && result.error) {
    return error(result.error, result.status);
  }
  if (!("order" in result) || !result.order) {
    return error("更新に失敗しました", 500);
  }
  return json({ order: result.order });
}
