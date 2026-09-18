import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { KitchenClient } from "./KitchenClient";

export default async function KitchenPage({
  searchParams,
}: {
  searchParams: Promise<{ device?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const sp = await searchParams;
  const display = sp.device === "display" || sp.device === "kds";

  if (display) {
    return (
      <div className="kds-fullscreen">
        <KitchenClient deviceMode="display" />
      </div>
    );
  }

  return (
    <AppShell session={session} title="キッチンボード">
      <KitchenClient />
    </AppShell>
  );
}
