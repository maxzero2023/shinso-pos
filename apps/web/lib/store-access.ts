import { prisma } from "@shinso/db";
import {
  canSwitchToStore,
  getActiveStoreId,
  isBrandAdmin,
  type SessionPayload,
} from "@shinso/api";

export async function listAccessibleStores(session: SessionPayload) {
  if (isBrandAdmin(session.role) && session.brandId) {
    return prisma.store.findMany({
      where: { brandId: session.brandId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, brandId: true, timezone: true },
    });
  }
  const storeId = getActiveStoreId(session);
  return prisma.store.findMany({
    where: { id: storeId },
    select: { id: true, name: true, brandId: true, timezone: true },
  });
}

export async function assertCanAccessStore(
  session: SessionPayload,
  storeId: string
): Promise<{ ok: true; store: { id: string; brandId: string; name: string } } | { ok: false; status: 403 | 404; message: string }> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true, brandId: true, name: true },
  });
  if (!store) return { ok: false, status: 404, message: "店舗が見つかりません" };

  // Resolve home store from staff record for non-brand-admin
  const staff = await prisma.staff.findUnique({
    where: { id: session.staffId },
    select: { storeId: true, brandId: true, role: true },
  });
  if (!staff) return { ok: false, status: 403, message: "権限がありません" };

  const allowed = canSwitchToStore({
    role: session.role,
    brandId: session.brandId ?? staff.brandId,
    homeStoreId: staff.storeId,
    targetStore: store,
  });
  if (!allowed) {
    return { ok: false, status: 403, message: "他店舗への切り替えはできません" };
  }
  return { ok: true, store };
}

export async function resolveLoginStoreId(staff: {
  role: string;
  storeId: string | null;
  brandId: string | null;
}): Promise<string | null> {
  if (staff.storeId) return staff.storeId;
  if (staff.role === "brand_admin" && staff.brandId) {
    const first = await prisma.store.findFirst({
      where: { brandId: staff.brandId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    return first?.id ?? null;
  }
  return null;
}
