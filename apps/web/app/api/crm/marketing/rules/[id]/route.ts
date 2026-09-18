import { marketingRuleUpdateSchema } from "@shinso/api";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import { patchMarketingRule } from "@/lib/marketing";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/crm/marketing/rules/:id — enabled / params / frequencyDays */
export async function PATCH(req: Request, ctx: Ctx) {
  const session = await requireSession(["owner", "manager"]);
  if (isResponse(session)) return session;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = marketingRuleUpdateSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return error("入力が不正です", 400, { details: parsed.error.flatten() });
  }

  const rule = await patchMarketingRule(session.storeId, id, parsed.data);
  if (!rule) return error("ルールが見つかりません", 404);
  return json({ rule });
}
