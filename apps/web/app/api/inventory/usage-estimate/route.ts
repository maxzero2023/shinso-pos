import { usageEstimateQuerySchema } from "@shinso/api";
import { requireSession, isResponse, activeStoreId } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import { estimateUsage } from "@/lib/inventory";

export async function GET(req: Request) {
  const session = await requireSession(["owner", "manager", "floor"]);
  if (isResponse(session)) return session;
  const url = new URL(req.url);
  const parsed = usageEstimateQuerySchema.safeParse({
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });
  if (!parsed.success) return error("入力が不正です", 400, { details: parsed.error.flatten() });

  const estimate = await estimateUsage(
    activeStoreId(session),
    parsed.data.from,
    parsed.data.to
  );
  return json({ estimate });
}
