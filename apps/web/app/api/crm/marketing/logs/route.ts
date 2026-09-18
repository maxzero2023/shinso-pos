import { requireSession, isResponse } from "@/lib/auth-guard";
import { json } from "@/lib/http";
import { listMarketingSendLogs } from "@/lib/marketing";

/** GET /api/crm/marketing/logs?limit= */
export async function GET(req: Request) {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? "50");
  const logs = await listMarketingSendLogs(session.storeId, limit);
  return json({ logs });
}
