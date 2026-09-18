import { couponTemplateCreateSchema } from "@shinso/api";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import { listCouponTemplates, createCouponTemplate, lineConfig } from "@/lib/crm";

export async function GET() {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;
  const templates = await listCouponTemplates(session.storeId);
  return json({ templates, ...lineConfig() });
}

export async function POST(req: Request) {
  const session = await requireSession(["owner"]);
  if (isResponse(session)) return session;

  const body = await req.json().catch(() => null);
  const parsed = couponTemplateCreateSchema.safeParse(body);
  if (!parsed.success) return error("入力が不正です", 400, { details: parsed.error.flatten() });

  const template = await createCouponTemplate(session.storeId, parsed.data);
  return json({ template }, 201);
}
