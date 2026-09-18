import { ownerLineSettingsSchema } from "@shinso/api";
import { error, json } from "@/lib/http";
import { isResponse, requireSession } from "@/lib/auth-guard";
import { doOwnerLineSettings } from "@/lib/owner-line";

/** PATCH /api/crm/owner-line/settings — owner only. */
export async function PATCH(req: Request) {
  const session = await requireSession(["owner"]);
  if (isResponse(session)) return session;

  const body = await req.json().catch(() => null);
  const parsed = ownerLineSettingsSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return error("入力が不正です", 400, { details: parsed.error.flatten() });
  }

  const result = await doOwnerLineSettings(session.storeId, parsed.data);
  if (!result.ok) return error(result.error, result.status);
  return json(result.data, result.status);
}
