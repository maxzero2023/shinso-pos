import { purchaseOrderCreateSchema } from "@shinso/api";
import { requireSession, isResponse, activeStoreId } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import { createOrder, listOrders } from "@/lib/purchasing";

export async function GET(req: Request) {
  const session = await requireSession(["owner", "manager", "floor"]);
  if (isResponse(session)) return session;
  const storeId = activeStoreId(session);
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;
  const orders = await listOrders(storeId, status);
  return json({ orders });
}

export async function POST(req: Request) {
  const session = await requireSession(["owner", "manager"]);
  if (isResponse(session)) return session;
  const storeId = activeStoreId(session);

  const body = await req.json().catch(() => null);
  const parsed = purchaseOrderCreateSchema.safeParse(body);
  if (!parsed.success) return error("入力が不正です", 400, { details: parsed.error.flatten() });

  const result = await createOrder(storeId, session.staffId, parsed.data);
  if (!result.ok) return error(result.message, result.status);
  return json({ order: result.order }, 201);
}
