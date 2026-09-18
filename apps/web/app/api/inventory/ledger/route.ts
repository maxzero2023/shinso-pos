import { stockLedgerCreateSchema, toQtyNumber } from "@shinso/api";
import { requireSession, isResponse, activeStoreId } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import { listLedger, postLedger } from "@/lib/inventory";

export async function GET(req: Request) {
  const session = await requireSession(["owner", "manager", "floor"]);
  if (isResponse(session)) return session;
  const storeId = activeStoreId(session);
  const url = new URL(req.url);
  const ingredientId = url.searchParams.get("ingredientId") ?? undefined;
  const limit = Number(url.searchParams.get("limit") ?? "100") || 100;
  const entries = await listLedger(storeId, ingredientId, limit);
  return json({
    entries: entries.map((e) => ({
      ...e,
      qtyDelta: toQtyNumber(e.qtyDelta),
    })),
  });
}

export async function POST(req: Request) {
  const session = await requireSession(["owner", "manager", "floor"]);
  if (isResponse(session)) return session;
  const storeId = activeStoreId(session);

  const body = await req.json().catch(() => null);
  const parsed = stockLedgerCreateSchema.safeParse(body);
  if (!parsed.success) return error("入力が不正です", 400, { details: parsed.error.flatten() });

  const result = await postLedger(storeId, session.staffId, parsed.data);
  if (!result.ok) {
    return error(result.message, result.status, { onHand: result.onHand });
  }
  return json(
    {
      entry: {
        ...result.entry,
        qtyDelta: toQtyNumber(result.entry.qtyDelta),
      },
      onHand: result.onHand,
    },
    201
  );
}
