import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { canReadReports, tokyoYmd } from "@shinso/api";
import { AppShell } from "@/components/AppShell";
import { ReportsClient } from "./ReportsClient";

export default async function ReportsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canReadReports(session.role)) {
    if (session.role === "kitchen") redirect("/kitchen");
    redirect("/pos");
  }

  return (
    <AppShell session={session} title="経営レポート">
      <ReportsClient initialDate={tokyoYmd(new Date())} role={session.role} />
    </AppShell>
  );
}
