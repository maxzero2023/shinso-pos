import { couponTemplateUpdateSchema } from "@shinso/api";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import { updateCouponTemplate } from "@/lib/crm";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await requireSession(["owner"]);
  if (isResponse(session)) return session;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = couponTemplateUpdateSchema.safeParse(body);
  if (!parsed.success) return error("入力が不正です", 400);

  const template = await updateCouponTemplate(session.storeId, id, parsed.data);
  if (!template) return error("テンプレートが見つかりません", 404);
  return json({ template });
}
