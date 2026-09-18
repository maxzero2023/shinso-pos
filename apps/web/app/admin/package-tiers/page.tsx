import { redirect } from "next/navigation";
import { isStoreElevated } from "@shinso/api";
import { getSession } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { PackageTiersClient } from "./PackageTiersClient";

export default async function AdminPackageTiersPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isStoreElevated(session.role) && session.role !== "floor") redirect("/pos");

  return (
    <AppShell session={session} title="套餐能力マトリクス（読取専用）">
      <PackageTiersClient />
    </AppShell>
  );
}
