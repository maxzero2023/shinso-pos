import { switchStoreSchema } from "@shinso/api";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { createSessionToken, setSessionCookie } from "@/lib/session";
import { assertCanAccessStore } from "@/lib/store-access";
import { error, json } from "@/lib/http";

export async function POST(req: Request) {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const body = await req.json().catch(() => null);
  const parsed = switchStoreSchema.safeParse(body);
  if (!parsed.success) return error("storeId が必要です", 400);

  const access = await assertCanAccessStore(session, parsed.data.storeId);
  if (!access.ok) return error(access.message, access.status);

  const token = await createSessionToken({
    ...session,
    storeId: access.store.id,
    activeStoreId: access.store.id,
  });
  await setSessionCookie(token);

  return json({
    activeStoreId: access.store.id,
    store: { id: access.store.id, name: access.store.name, brandId: access.store.brandId },
  });
}
