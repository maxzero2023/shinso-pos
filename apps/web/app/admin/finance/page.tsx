import { redirect } from "next/navigation";
import { isStoreElevated, tokyoYmd } from "@shinso/api";
import { getSession } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { FinanceClient } from "./FinanceClient";

export default async function AdminFinancePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isStoreElevated(session.role) && session.role !== "floor") redirect("/pos");

  return (
    <AppShell session={session} title="財務分析（概算）">
      <FinanceClient
        initialDate={tokyoYmd(new Date())}
        canEdit={isStoreElevated(session.role)}
        role={session.role}
      />
    </AppShell>
  );
}
