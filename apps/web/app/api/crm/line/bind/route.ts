import { lineBindSchema, getLineMode } from "@shinso/api";
import { error, json } from "@/lib/http";
import { doLineBind, getDefaultStoreId } from "@/lib/crm";
import { getSession } from "@/lib/session";

/**
 * POST /api/crm/line/bind
 * Simulator: omit lineUserId → auto sim_* id. No real LINE credentials required.
 * Guest bind allowed (demo); staff uses session.storeId.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = lineBindSchema.safeParse(body);
  if (!parsed.success) return error("入力が不正です", 400, { details: parsed.error.flatten() });

  const session = await getSession();
  let storeId = parsed.data.storeId ?? session?.storeId ?? null;
  if (!storeId) storeId = await getDefaultStoreId();
  if (!storeId) return error("店舗が見つかりません", 404);

  const mode = getLineMode();
  if (mode === "live" && !parsed.data.lineUserId) {
    return error("live モードでは lineUserId が必須です", 400);
  }

  const result = await doLineBind(storeId, parsed.data);
  if (!result.ok) return error(result.error, result.status);
  return json(result.data, result.status);
}
