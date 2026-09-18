import { error, json } from "@/lib/http";
import { isResponse, requireSession } from "@/lib/auth-guard";
import { getOwnerLineBinding } from "@/lib/owner-line";

/** GET /api/crm/owner-line — current binding (owner/floor). */
export async function GET() {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;
  const binding = await getOwnerLineBinding(session.storeId);
  return json({ binding });
}
