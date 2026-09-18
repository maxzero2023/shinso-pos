import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { MarketingClient } from "./MarketingClient";

export default async function AdminMarketingPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "kitchen") redirect("/kitchen");
  if (!["brand_admin", "owner", "manager", "floor"].includes(session.role)) {
    redirect("/pos");
  }

  return (
    <AppShell session={session} title="マーケティング自動化">
      <MarketingClient />
    </AppShell>
  );
}
