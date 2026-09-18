import { bomLineUpdateSchema, toQtyNumber } from "@shinso/api";
import { requireSession, isResponse, activeStoreId } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import { updateBomLine, deleteBomLine } from "@/lib/inventory";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await requireSession(["owner", "manager"]);
  if (isResponse(session)) return session;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = bomLineUpdateSchema.safeParse(body);
  if (!parsed.success) return error("入力が不正です", 400, { details: parsed.error.flatten() });

  const line = await updateBomLine(activeStoreId(session), id, parsed.data);
  if (!line) return error("BOM 行が見つかりません", 404);
  return json({ line: { ...line, qtyPerItem: toQtyNumber(line.qtyPerItem) } });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await requireSession(["owner", "manager"]);
  if (isResponse(session)) return session;
  const { id } = await ctx.params;
  const deleted = await deleteBomLine(activeStoreId(session), id);
  if (!deleted) return error("BOM 行が見つかりません", 404);
  return json({ ok: true });
}
