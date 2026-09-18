import Link from "next/link";
import type { SessionPayload } from "@shinso/api";

const links: Array<{ href: string; label: string; roles?: SessionPayload["role"][] }> = [
  { href: "/pos", label: "フロア POS", roles: ["owner", "floor"] },
  { href: "/reservations", label: "予約・候位", roles: ["owner", "floor"] },
  { href: "/staff", label: "手持ち", roles: ["owner", "floor"] },
  { href: "/kitchen", label: "キッチン", roles: ["owner", "kitchen", "floor"] },
  { href: "/devices", label: "デバイス", roles: ["owner", "floor"] },
  { href: "/ops", label: "運営", roles: ["owner", "floor"] },
  { href: "/admin/reports", label: "レポート", roles: ["owner", "floor"] },
  { href: "/admin/crm", label: "CRM", roles: ["owner", "floor"] },
  { href: "/admin", label: "管理", roles: ["owner"] },
];

export function AppShell({
  session,
  children,
  title,
}: {
  session: SessionPayload;
  children: React.ReactNode;
  title?: string;
}) {
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
