import { requireSession, isResponse } from "@/lib/auth-guard";
import { json } from "@/lib/http";
import { listMembers, lineConfig } from "@/lib/crm";

/** GET /api/crm/members — staff list */
export async function GET() {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;
  const members = await listMembers(session.storeId);
  return json({ members, ...lineConfig() });
}
