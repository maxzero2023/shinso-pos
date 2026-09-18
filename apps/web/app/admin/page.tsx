import { redirect } from "next/navigation";
import { prisma } from "@shinso/db";
import { getSession } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { AdminClient } from "./AdminClient";

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "owner") redirect("/pos");

  const [areas, categories, staff, store] = await Promise.all([
    prisma.area.findMany({
      where: { storeId: session.storeId },
      orderBy: { sortOrder: "asc" },
      include: { tables: { orderBy: { sortOrder: "asc" } } },
    }),
    prisma.menuCategory.findMany({
      where: { storeId: session.storeId },
      orderBy: { sortOrder: "asc" },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    }),
    prisma.staff.findMany({
      where: { storeId: session.storeId },
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, name: true, role: true, active: true },
    }),
    prisma.store.findUnique({ where: { id: session.storeId } }),
  ]);

  return (
    <AppShell session={session} title="店舗管理">
      <AdminClient
        storeName={store?.name ?? ""}
        areas={areas}
        categories={categories}
        staff={staff}
      />
    </AppShell>
  );
}
