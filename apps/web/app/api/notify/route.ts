import { notifySchema } from "@shinso/api";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import { sendNotify } from "@/lib/notify";

/** LINE / notify stub. POST: { channel?, event, to?, message, meta? } */
export async function POST(req: Request) {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;

  const body = await req.json().catch(() => null);
  const parsed = notifySchema.safeParse(body);
  if (!parsed.success) return error("入力が不正です", 400, { details: parsed.error.flatten() });

  const result = await sendNotify(parsed.data);
  return json({ notify: result });
}
