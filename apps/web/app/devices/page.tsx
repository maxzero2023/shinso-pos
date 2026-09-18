import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { DevicesClient } from "./DevicesClient";

export default async function DevicesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "kitchen") redirect("/kitchen");

  return (
    <AppShell session={session} title="標準ハードウェアスイミュレータ">
      <DevicesClient />
    </AppShell>
  );
}
