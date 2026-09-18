import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { OpsClient } from "./OpsClient";

export default async function OpsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "kitchen") redirect("/kitchen");

  return (
    <AppShell session={session} title="運営（シフト・異常・監査）">
      <OpsClient role={session.role} />
    </AppShell>
  );
}
