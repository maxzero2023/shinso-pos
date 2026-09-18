import { purchaseOrderUpdateSchema } from "@shinso/api";
import { requireSession, isResponse, activeStoreId } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import { getOrder, updateOrder } from "@/lib/purchasing";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await requireSession(["owner", "manager", "floor"]);
  if (isResponse(session)) return session;
  const storeId = activeStoreId(session);
  const { id } = await ctx.params;
  const order = await getOrder(storeId, id);
  if (!order) return error("発注書が見つかりません", 404);
  return json({ order });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await requireSession(["owner", "manager"]);
  if (isResponse(session)) return session;
  const storeId = activeStoreId(session);
  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = purchaseOrderUpdateSchema.safeParse(body);
  if (!parsed.success) return error("入力が不正です", 400, { details: parsed.error.flatten() });

  const result = await updateOrder(storeId, id, session.staffId, parsed.data);
  if (!result.ok) return error(result.message, result.status);
  return json({ order: result.order });
}
