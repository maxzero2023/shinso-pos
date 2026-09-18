import { paySchema } from "@shinso/api";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import { startCheckPayment } from "@/lib/payments";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = paySchema.safeParse(body);
  if (!parsed.success) return error("入力が不正です", 400);

  const result = await startCheckPayment({
    checkId: id,
    storeId: session.storeId,
    input: parsed.data,
  });

  if (!result.ok) {
    return error(result.error, result.status, "extra" in result ? result.extra : undefined);
  }
  return json(result.data, result.status);
}
