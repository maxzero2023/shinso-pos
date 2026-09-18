import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { CrmClient } from "./CrmClient";

export default async function AdminCrmPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "kitchen") redirect("/kitchen");
  if (!["brand_admin", "owner", "manager", "floor"].includes(session.role)) redirect("/pos");

  return (
    <AppShell session={session} title="CRM / LINE 会員">
      <CrmClient />
    </AppShell>
  );
}
