import { couponRedeemSchema } from "@shinso/api";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import { doRedeemCoupon } from "@/lib/crm";

/** POST /api/crm/coupons/redeem — POS / staff 核销 */
export async function POST(req: Request) {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;

  const body = await req.json().catch(() => null);
  const parsed = couponRedeemSchema.safeParse(body);
  if (!parsed.success) return error("入力が不正です", 400, { details: parsed.error.flatten() });

  const result = await doRedeemCoupon(session.storeId, parsed.data, session.staffId);
  if (!result.ok) {
    return error(result.error, result.status, "extra" in result ? result.extra : undefined);
  }
  return json(result.data, result.status);
}
