import { bomLineCreateSchema, toQtyNumber } from "@shinso/api";
import { requireSession, isResponse, activeStoreId } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import { listBomLines, createBomLine } from "@/lib/inventory";

export async function GET(req: Request) {
  const session = await requireSession(["owner", "manager", "floor"]);
  if (isResponse(session)) return session;
  const storeId = activeStoreId(session);
  const url = new URL(req.url);
  const menuItemId = url.searchParams.get("menuItemId") ?? undefined;
  const lines = await listBomLines(storeId, menuItemId);
  return json({
    lines: lines.map((l) => ({
      ...l,
      qtyPerItem: toQtyNumber(l.qtyPerItem),
    })),
  });
}

export async function POST(req: Request) {
  const session = await requireSession(["owner", "manager"]);
  if (isResponse(session)) return session;
  const storeId = activeStoreId(session);

  const body = await req.json().catch(() => null);
  const parsed = bomLineCreateSchema.safeParse(body);
  if (!parsed.success) return error("入力が不正です", 400, { details: parsed.error.flatten() });

  const result = await createBomLine(storeId, parsed.data);
  if (!result.ok) return error(result.message, result.status);
  return json(
    {
      line: {
        ...result.line,
        qtyPerItem: toQtyNumber(result.line.qtyPerItem),
      },
    },
    201
  );
}
