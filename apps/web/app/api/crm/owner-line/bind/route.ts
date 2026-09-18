import { ownerLineBindSchema, getLineMode } from "@shinso/api";
import { error, json } from "@/lib/http";
import { isResponse, requireSession } from "@/lib/auth-guard";
import { doOwnerLineBind } from "@/lib/owner-line";

/** POST /api/crm/owner-line/bind — owner only. */
export async function POST(req: Request) {
  const session = await requireSession(["owner"]);
  if (isResponse(session)) return session;

  const body = await req.json().catch(() => null);
  const parsed = ownerLineBindSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return error("入力が不正です", 400, { details: parsed.error.flatten() });
  }

  const mode = getLineMode();
  if (mode === "live" && !parsed.data.lineUserId) {
    return error("live モードでは lineUserId が必須です", 400);
  }

  const result = await doOwnerLineBind(session.storeId, parsed.data);
  if (!result.ok) return error(result.error, result.status);
  return json(result.data, result.status);
}
