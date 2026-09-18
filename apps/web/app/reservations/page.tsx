import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { ReservationsClient } from "./ReservationsClient";

export default async function ReservationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "kitchen") redirect("/kitchen");

  return (
    <AppShell session={session} title="予約・候位">
      <ReservationsClient />
    </AppShell>
  );
}
