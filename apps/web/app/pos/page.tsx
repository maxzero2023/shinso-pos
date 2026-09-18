import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { PosClient } from "./PosClient";

export default async function PosPage({
  searchParams,
}: {
  searchParams: Promise<{ device?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "kitchen") redirect("/kitchen");

  const sp = await searchParams;
  const t1 = sp.device === "t1" || sp.device === "T1";

  if (t1) {
    return (
      <div className="t1-shell">
        <header className="t1-header">
          <div>
            <strong>SHINSO T1</strong>
            <span style={{ opacity: 0.8 }}> タッチ POS</span>
          </div>
          <a className="btn ghost" href="/devices" style={{ color: "white", borderColor: "#3a6a52" }}>
            デバイス
          </a>
        </header>
        <main className="t1-main">
          <PosClient deviceMode="t1" />
        </main>
      </div>
    );
  }

  return (
    <AppShell session={session} title="フロア POS">
      <PosClient />
    </AppShell>
  );
}
