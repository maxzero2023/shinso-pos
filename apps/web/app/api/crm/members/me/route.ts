import { error, json } from "@/lib/http";
import { getMemberMe, getDefaultStoreId, lineConfig } from "@/lib/crm";
import { getSession } from "@/lib/session";

/** GET /api/crm/members/me?lineUserId=...&storeId=... */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const lineUserId = url.searchParams.get("lineUserId")?.trim();
  if (!lineUserId) return error("lineUserId が必要です", 400);

  const session = await getSession();
  let storeId = url.searchParams.get("storeId") ?? session?.storeId ?? null;
  if (!storeId) storeId = await getDefaultStoreId();
  if (!storeId) return error("店舗が見つかりません", 404);

  const member = await getMemberMe(storeId, lineUserId);
  if (!member) return error("会員が見つかりません", 404);
  return json({ member, ...lineConfig() });
}
