import { ownerLineTriggerSchema } from "@shinso/api";
import { error, json } from "@/lib/http";
import { isResponse, requireSession } from "@/lib/auth-guard";
import { doOwnerLineTrigger } from "@/lib/owner-line";

/**
 * POST /api/crm/owner-line/trigger — manual daily/weekly job (demo).
 * Body: { kind: "daily"|"weekly", date?: "YYYY-MM-DD", asOf?: ISO }
 */
export async function POST(req: Request) {
  const session = await requireSession(["owner"]);
  if (isResponse(session)) return session;

  const body = await req.json().catch(() => null);
  const parsed = ownerLineTriggerSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return error("入力が不正です", 400, { details: parsed.error.flatten() });
  }

  const result = await doOwnerLineTrigger(session.storeId, parsed.data.kind, {
    asOf: parsed.data.asOf ? new Date(parsed.data.asOf) : undefined,
    date: parsed.data.date,
  });

  return json({ result }, result.status === "failed" ? 502 : 200);
}
