import { marketingRunSchema } from "@shinso/api";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import { doMarketingRun } from "@/lib/marketing";

/**
 * POST /api/crm/marketing/run — manual run (actually sends via LINE stub + logs).
 * Body: { ruleId?: string }
 */
export async function POST(req: Request) {
  const session = await requireSession(["owner", "manager"]);
  if (isResponse(session)) return session;

  const body = await req.json().catch(() => null);
  const parsed = marketingRunSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return error("入力が不正です", 400, { details: parsed.error.flatten() });
  }

  const summary = await doMarketingRun(session.storeId, parsed.data);
  return json({ summary });
}
