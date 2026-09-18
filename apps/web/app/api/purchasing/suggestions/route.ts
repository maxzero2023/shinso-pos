import { requireSession, isResponse, activeStoreId } from "@/lib/auth-guard";
import { json } from "@/lib/http";
import { listSuggestions } from "@/lib/purchasing";

export async function GET() {
  const session = await requireSession(["owner", "manager", "floor"]);
  if (isResponse(session)) return session;
  const storeId = activeStoreId(session);
  const suggestions = await listSuggestions(storeId);
  return json({ suggestions });
}
