import { couponIssueSchema } from "@shinso/api";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import { doIssueCoupon } from "@/lib/crm";

/** POST /api/crm/coupons/issue — Admin 发放 */
export async function POST(req: Request) {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;

  const body = await req.json().catch(() => null);
  const parsed = couponIssueSchema.safeParse(body);
  if (!parsed.success) return error("入力が不正です", 400, { details: parsed.error.flatten() });

  const result = await doIssueCoupon(session.storeId, parsed.data);
  if (!result.ok) return error(result.error, result.status);
  return json(result.data, result.status);
}
