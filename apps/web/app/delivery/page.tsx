import { redirect } from "next/navigation";
import { prisma } from "@shinso/db";
import { getSession } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { DeliveryClient } from "./DeliveryClient";

export default async function DeliveryPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "kitchen") redirect("/kitchen");

  const storeId = session.activeStoreId || session.storeId;
  const menu = await prisma.menuItem.findMany({
    where: { category: { storeId }, active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, priceYen: true, active: true },
  });

  return (
    <AppShell session={session} title="配達・外卖（半自動）">
      <DeliveryClient initialMenu={menu} />
    </AppShell>
  );
}
