import { redirect } from "next/navigation";
import { prisma } from "@shinso/db";
import { isStoreElevated } from "@shinso/api";
import { getSession } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { AdminClient } from "./AdminClient";

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isStoreElevated(session.role)) redirect("/pos");

  const storeId = session.activeStoreId || session.storeId;

  const [areas, categories, staff, store] = await Promise.all([
    prisma.area.findMany({
      where: { storeId },
      orderBy: { sortOrder: "asc" },
      include: { tables: { orderBy: { sortOrder: "asc" } } },
    }),
    prisma.menuCategory.findMany({
      where: { storeId },
      orderBy: { sortOrder: "asc" },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    }),
    prisma.staff.findMany({
      where: {
        OR: [{ storeId }, ...(session.brandId ? [{ brandId: session.brandId, role: "brand_admin" as const }] : [])],
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, name: true, role: true, active: true },
    }),
    prisma.store.findUnique({ where: { id: storeId }, include: { brand: true } }),
  ]);

  return (
    <AppShell session={session} title="店舗管理">
      <AdminClient
        storeName={store?.name ?? ""}
        brandName={store?.brand?.name ?? null}
        areas={areas}
        categories={categories}
        staff={staff}
      />
    </AppShell>
  );
}
