import { redirect } from "next/navigation";
import { isStoreElevated } from "@shinso/api";
import { getSession } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { InventoryClient } from "./InventoryClient";

export default async function AdminInventoryPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isStoreElevated(session.role) && session.role !== "floor") redirect("/pos");

  return (
    <AppShell session={session} title="在庫管理">
      <InventoryClient canEdit={isStoreElevated(session.role)} />
    </AppShell>
  );
}
