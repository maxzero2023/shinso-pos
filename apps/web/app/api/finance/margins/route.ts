import { canReadReports, marginsQuerySchema, tokyoYmd } from "@shinso/api";
import { requireSession, isResponse, activeStoreId } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import { getMargins } from "@/lib/finance";

export async function GET(req: Request) {
  const session = await requireSession(["owner", "manager", "floor"]);
  if (isResponse(session)) return session;
  if (!canReadReports(session.role)) return error("権限がありません", 403);

  const storeId = activeStoreId(session);
  const url = new URL(req.url);
  const raw = url.searchParams.get("date") ?? tokyoYmd(new Date());
  const parsed = marginsQuerySchema.safeParse({ date: raw });
  if (!parsed.success) {
    return error(parsed.error.errors[0]?.message ?? "無効な日付です", 400);
  }

  const margins = await getMargins(storeId, parsed.data.date);
  return json(margins);
}
