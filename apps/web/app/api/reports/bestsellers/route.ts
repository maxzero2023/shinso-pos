import { requireSession, isResponse } from "@/lib/auth-guard";
import { json, error } from "@/lib/http";
import {
  bestsellersQuerySchema,
  canReadReports,
  tokyoYmd,
} from "@shinso/api";
import { getBestsellersReport } from "@/lib/reports";

export async function GET(req: Request) {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;
  if (!canReadReports(session.role)) return error("権限がありません", 403);

  const url = new URL(req.url);
  const today = tokyoYmd(new Date());
  const from = url.searchParams.get("from") ?? today;
  const to = url.searchParams.get("to") ?? today;
  const parsed = bestsellersQuerySchema.safeParse({ from, to });
  if (!parsed.success) {
    return error(parsed.error.errors[0]?.message ?? "無効な期間です", 400);
  }
  if (parsed.data.from > parsed.data.to) {
    return error("from は to 以前である必要があります", 400);
  }

  const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 50);
  const report = await getBestsellersReport(
    session.storeId,
    parsed.data.from,
    parsed.data.to,
    Number.isFinite(limit) ? limit : 20
  );
  return json(report);
}
