import { purchaseOrderReceiveSchema } from "@shinso/api";
import { requireSession, isResponse, activeStoreId } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import { receiveOrder } from "@/lib/purchasing";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const session = await requireSession(["owner", "manager"]);
  if (isResponse(session)) return session;
  const storeId = activeStoreId(session);
  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = purchaseOrderReceiveSchema.safeParse(body);
  if (!parsed.success) return error("入力が不正です", 400, { details: parsed.error.flatten() });

  const result = await receiveOrder(storeId, id, session.staffId, parsed.data);
  if (!result.ok) return error(result.message, result.status);
  return json({ order: result.order, ledgerResults: result.ledgerResults });
}
