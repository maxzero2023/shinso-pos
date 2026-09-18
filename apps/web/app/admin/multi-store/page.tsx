import { redirect } from "next/navigation";
import { prisma } from "@shinso/db";
import { isStoreElevated, PERMISSION_MATRIX } from "@shinso/api";
import { getSession } from "@/lib/session";
import { listAccessibleStores } from "@/lib/store-access";
import { AppShell } from "@/components/AppShell";
import { MultiStoreClient } from "./MultiStoreClient";

export default async function MultiStoreAdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isStoreElevated(session.role)) redirect("/pos");

  const stores = await listAccessibleStores(session);
  const brandId = session.brandId ?? stores[0]?.brandId ?? null;
  const brand = brandId
    ? await prisma.brand.findUnique({
        where: { id: brandId },
        include: {
          stores: {
            orderBy: { createdAt: "asc" },
            select: { id: true, name: true, timezone: true },
          },
        },
      })
    : null;

  // Non-brand-admin only see their store in the tree
  const treeStores =
    session.role === "brand_admin"
      ? brand?.stores ?? stores.map((s) => ({ id: s.id, name: s.name, timezone: s.timezone }))
      : stores.map((s) => ({ id: s.id, name: s.name, timezone: s.timezone ?? "Asia/Tokyo" }));

  return (
    <AppShell session={session} title="多店アーキ（ブランド / 店舗）">
      <MultiStoreClient
        role={session.role}
        brand={brand ? { id: brand.id, name: brand.name } : null}
        stores={treeStores}
        activeStoreId={session.activeStoreId || session.storeId}
        canManage={session.role === "brand_admin"}
        permissionMatrix={PERMISSION_MATRIX}
      />
    </AppShell>
  );
}
