import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { PosClient } from "./PosClient";

export default async function PosPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "kitchen") redirect("/kitchen");

  return (
    <AppShell session={session} title="フロア POS">
      <PosClient />
    </AppShell>
  );
}
