import { prisma } from "@shinso/db";
import { canEditCheckItem, editItemSchema } from "@shinso/api";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import { writeCheckAudit } from "@/lib/ops";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = editItemSchema.safeParse(body);
  if (!parsed.success) return error("入力が不正です", 400);

  const check = await prisma.check.findFirst({
    where: { id, table: { area: { storeId: session.storeId } } },
    include: { items: { where: { id: parsed.data.checkItemId } } },
  });
  if (!check) return error("伝票が見つかりません", 404);
  const item = check.items[0];
  if (!item) return error("明細が見つかりません", 404);

  const perm = canEditCheckItem({
    role: session.role,
    itemStatus: item.status,
    checkStatus: check.status,
  });
  if (!perm.ok) return error(perm.reason, 403);

  const data: { qty?: number; note?: string | null } = {};
  if (parsed.data.qty !== undefined) data.qty = parsed.data.qty;
  if (parsed.data.note !== undefined) data.note = parsed.data.note;

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.checkItem.update({
      where: { id: item.id },
      data,
    });
    const audit = await writeCheckAudit({
      tx,
      storeId: session.storeId,
      checkId: check.id,
      staffId: session.staffId,
      action: "edit_item",
      summary: `明細変更: ${item.name}（qty ${item.qty}→${updated.qty}）`,
      detail: {
        checkItemId: item.id,
        name: item.name,
        before: { qty: item.qty, note: item.note, status: item.status },
        after: { qty: updated.qty, note: updated.note, status: updated.status },
        checkStatus: check.status,
        reason: parsed.data.reason ?? null,
        role: session.role,
      },
    });
    return { item: updated, audit };
  });

  return json(result);
}
