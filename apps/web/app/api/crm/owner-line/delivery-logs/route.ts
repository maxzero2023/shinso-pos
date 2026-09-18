import { error, json } from "@/lib/http";
import { isResponse, requireSession } from "@/lib/auth-guard";
import { listOwnerLineDeliveryLogs } from "@/lib/owner-line";

/** GET /api/crm/owner-line/delivery-logs — owner/floor. */
export async function GET(req: Request) {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;

  const url = new URL(req.url);
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : 50;
  if (!Number.isFinite(limit)) return error("limit が不正です", 400);

  const logs = await listOwnerLineDeliveryLogs(session.storeId, limit);
  return json({ logs });
}
