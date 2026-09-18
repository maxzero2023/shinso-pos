import { requireSession, isResponse } from "@/lib/auth-guard";
import { json, error } from "@/lib/http";
import { canReadReports, reportDateSchema, tokyoYmd } from "@shinso/api";
import { getDailyReport } from "@/lib/reports";

export async function GET(req: Request) {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;
  if (!canReadReports(session.role)) return error("権限がありません", 403);

  const url = new URL(req.url);
  const raw = url.searchParams.get("date") ?? tokyoYmd(new Date());
  const parsed = reportDateSchema.safeParse(raw);
  if (!parsed.success) {
    return error(parsed.error.errors[0]?.message ?? "無効な日付です", 400);
  }

  const report = await getDailyReport(session.storeId, parsed.data);
  return json(report);
}
