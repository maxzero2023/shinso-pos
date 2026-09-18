import Link from "next/link";
import type { SessionPayload } from "@shinso/api";
import { listAccessibleStores } from "@/lib/store-access";
import { StoreSwitcher } from "./StoreSwitcher";

const links: Array<{ href: string; label: string; roles?: SessionPayload["role"][] }> = [
  { href: "/pos", label: "フロア POS", roles: ["brand_admin", "owner", "manager", "floor"] },
  { href: "/reservations", label: "予約・候位", roles: ["brand_admin", "owner", "manager", "floor"] },
  { href: "/staff", label: "手持ち", roles: ["brand_admin", "owner", "manager", "floor"] },
  { href: "/kitchen", label: "キッチン", roles: ["brand_admin", "owner", "manager", "kitchen", "floor"] },
  { href: "/devices", label: "デバイス", roles: ["brand_admin", "owner", "manager", "floor"] },
  { href: "/ops", label: "運営", roles: ["brand_admin", "owner", "manager", "floor"] },
  { href: "/admin/reports", label: "レポート", roles: ["brand_admin", "owner", "manager", "floor"] },
  { href: "/admin/crm", label: "CRM", roles: ["brand_admin", "owner", "manager", "floor"] },
  { href: "/admin", label: "管理", roles: ["brand_admin", "owner", "manager"] },
  { href: "/admin/multi-store", label: "多店", roles: ["brand_admin", "owner", "manager"] },
  { href: "/admin/inventory", label: "在庫", roles: ["brand_admin", "owner", "manager", "floor"] },
  { href: "/admin/purchasing", label: "調達", roles: ["brand_admin", "owner", "manager", "floor"] },
  { href: "/admin/finance", label: "財務", roles: ["brand_admin", "owner", "manager", "floor"] },
];

export async function AppShell({
  session,
  children,
  title,
}: {
  session: SessionPayload;
  children: React.ReactNode;
  title?: string;
}) {
  const stores = await listAccessibleStores(session);
  const activeStoreId = session.activeStoreId || session.storeId;
  const canSwitch = session.role === "brand_admin" && stores.length > 1;

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>SHINSO POS</h1>
        <nav>
          {links
            .filter((l) => !l.roles || l.roles.includes(session.role))
            .map((l) => (
              <Link key={l.href} href={l.href}>
                {l.label}
              </Link>
            ))}
        </nav>
        <div style={{ marginTop: "2rem", fontSize: "0.85rem", opacity: 0.85 }}>
          <div>{session.name}</div>
          <div className="muted" style={{ color: "#9fd9b8" }}>
            {session.role} / {session.email}
          </div>
          <StoreSwitcher
            stores={stores.map((s) => ({ id: s.id, name: s.name }))}
            activeStoreId={activeStoreId}
            canSwitch={canSwitch}
          />
          <form action="/api/auth/logout" method="post" style={{ marginTop: "0.75rem" }}>
            <button className="btn ghost" type="submit" style={{ color: "white", borderColor: "#3a6a52" }}>
              ログアウト
            </button>
          </form>
        </div>
      </aside>
      <main className="main">
        {title ? <h2 style={{ marginTop: 0 }}>{title}</h2> : null}
        {children}
      </main>
    </div>
  );
}
