"use client";

import Link from "next/link";

type Area = {
  id: string;
  name: string;
  tables: Array<{ id: string; code: string; seats: number; status: string }>;
};
type Category = {
  id: string;
  name: string;
  nameZh?: string | null;
  nameEn?: string | null;
  items: Array<{
    id: string;
    name: string;
    nameZh?: string | null;
    nameEn?: string | null;
    priceYen: number;
    active: boolean;
  }>;
};
type Staff = { id: string; email: string; name: string; role: string; active: boolean };

export function AdminClient({
  storeName,
  brandName,
  areas,
  categories,
  staff,
}: {
  storeName: string;
  brandName?: string | null;
  areas: Area[];
  categories: Category[];
  staff: Staff[];
}) {
  return (
    <div className="stack">
      <div className="card">
        <strong>店舗</strong>
        <div>{storeName}</div>
        {brandName ? <div className="muted">ブランド: {brandName}</div> : null}
        <div style={{ marginTop: "0.75rem" }} className="row">
          <Link className="btn secondary" href="/admin/reports">
            経営レポート →
          </Link>
          <Link className="btn secondary" href="/admin/crm">
            CRM / LINE →
          </Link>
          <Link className="btn secondary" href="/admin/multi-store">
            多店アーキ →
          </Link>
          <Link className="btn secondary" href="/admin/inventory">
            在庫管理 →
          </Link>
        </div>
      </div>

      <div className="card stack">
        <h3 style={{ margin: 0 }}>エリア / テーブル</h3>
        {areas.map((a) => (
          <div key={a.id}>
            <strong>{a.name}</strong>
            <div className="muted">
              {a.tables.map((t) => `${t.code}(${t.seats}席/${t.status})`).join(" · ")}
            </div>
          </div>
        ))}
      </div>

      <div className="card stack">
        <h3 style={{ margin: 0 }}>メニュー（日/中/英）</h3>
        <p className="muted" style={{ margin: 0 }}>
          zh/en は seed または PATCH /api/menu/items で更新（Admin 編集 UI は最小表示のみ）
        </p>
        {categories.map((c) => (
          <div key={c.id}>
            <strong>
              {c.name}
              {c.nameZh ? ` / ${c.nameZh}` : ""}
              {c.nameEn ? ` / ${c.nameEn}` : ""}
            </strong>
            <ul>
              {c.items.map((i) => (
                <li key={i.id}>
                  {i.name}
                  {i.nameZh ? ` / ${i.nameZh}` : ""}
                  {i.nameEn ? ` / ${i.nameEn}` : ""} — ¥{i.priceYen.toLocaleString()}{" "}
                  {i.active ? "" : "(停止)"}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="card stack">
        <h3 style={{ margin: 0 }}>スタッフ</h3>
        <table className="table">
          <thead>
            <tr>
              <th>名前</th>
              <th>メール</th>
              <th>役割</th>
              <th>状態</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.email}</td>
                <td>{s.role}</td>
                <td>{s.active ? "有効" : "停止"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
