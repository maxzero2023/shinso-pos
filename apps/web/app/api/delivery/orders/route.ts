import { requireSession, isResponse, activeStoreId } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import { listExternalOrders } from "@/lib/delivery";
import { externalOrderStatuses } from "@shinso/api";

export async function GET(req: Request) {
  const session = await requireSession(["owner", "floor", "manager", "brand_admin", "kitchen"]);
  if (isResponse(session)) return session;
  const storeId = activeStoreId(session);

  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get("status");
  const status =
    statusParam && (externalOrderStatuses as readonly string[]).includes(statusParam)
      ? (statusParam as (typeof externalOrderStatuses)[number])
      : undefined;
  if (statusParam && !status) {
    return error("status は pending / confirmed / cancelled", 400);
  }

  const orders = await listExternalOrders({ storeId, status });
  return json({ orders, storeId });
}
