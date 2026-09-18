import { requireSession, isResponse } from "@/lib/auth-guard";
import { listAccessibleStores } from "@/lib/store-access";
import { getActiveStoreId } from "@shinso/api";
import { json } from "@/lib/http";

export async function GET() {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const stores = await listAccessibleStores(session);
  return json({
    activeStoreId: getActiveStoreId(session),
    brandId: session.brandId,
    stores,
  });
}
