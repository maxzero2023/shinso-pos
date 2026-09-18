import { requireSession, isResponse, activeStoreId } from "@/lib/auth-guard";
import { json } from "@/lib/http";
import { listLowStock } from "@/lib/inventory";

export async function GET() {
  const session = await requireSession(["owner", "manager", "floor"]);
  if (isResponse(session)) return session;
  const alerts = await listLowStock(activeStoreId(session));
  return json({ alerts, count: alerts.length });
}
