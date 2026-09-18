import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { KitchenClient } from "./KitchenClient";

export default async function KitchenPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return (
    <AppShell session={session} title="キッチンボード">
      <KitchenClient />
    </AppShell>
  );
}
