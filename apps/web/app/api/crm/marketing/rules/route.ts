import { requireSession, isResponse } from "@/lib/auth-guard";
import { json } from "@/lib/http";
import { listMarketingRules, RULE_TYPE_LABEL_JA } from "@/lib/marketing";

/** GET /api/crm/marketing/rules — list preset rules (ensures defaults). */
export async function GET() {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;
  const rules = await listMarketingRules(session.storeId);
  return json({
    rules,
    labels: RULE_TYPE_LABEL_JA,
    note: "プリセット 2–3 ルールのみ（完全 CDP / 無限ルールビルダーではありません）",
  });
}
