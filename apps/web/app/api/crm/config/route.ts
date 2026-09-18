import { requireSession, isResponse } from "@/lib/auth-guard";
import { json } from "@/lib/http";
import { lineConfig } from "@/lib/crm";

export async function GET() {
  const session = await requireSession(["owner", "floor", "kitchen"]);
  if (isResponse(session)) return session;
  return json(lineConfig());
}
