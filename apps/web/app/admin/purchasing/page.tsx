import { redirect } from "next/navigation";
import { isStoreElevated } from "@shinso/api";
import { getSession } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { PurchasingClient } from "./PurchasingClient";

export default async function AdminPurchasingPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isStoreElevated(session.role) && session.role !== "floor") redirect("/pos");

  return (
    <AppShell session={session} title="調達・発注">
      <PurchasingClient canEdit={isStoreElevated(session.role)} />
    </AppShell>
  );
}
