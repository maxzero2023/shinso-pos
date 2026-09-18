"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type TableRow = {
  id: string;
  code: string;
  status: string;
  areaName: string;
  openCheck: null | { id: string; totalYen: number };
};

type MenuCategory = {
  id: string;
  name: string;
  items: Array<{ id: string; name: string; priceYen: number }>;
};

export function StaffClient({ name }: { name: string }) {
  const [tables, setTables] = useState<TableRow[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [tableId, setTableId] = useState<string>("");
  const [checkId, setCheckId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/tables")
      .then((r) => r.json())
      .then((d) => setTables(d.tables ?? []));
    fetch("/api/menu/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []));
  }, []);

  useEffect(() => {
    const t = tables.find((x) => x.id === tableId);
    setCheckId(t?.openCheck?.id ?? null);
  }, [tableId, tables]);

  async function add(menuItemId: string) {
    if (!checkId) {
      setMsg("オープン伝票がありません。POSで開台してください。");
      return;
    }
    const res = await fetch(`/api/checks/${checkId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ menuItemId, qty: 1, modifierIds: [] }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error ?? "失敗");
      return;
    }
    setMsg("追加しました");
    const refreshed = await fetch("/api/tables").then((r) => r.json());
    setTables(refreshed.tables ?? []);
  }

  return (
    <div className="mobile-shell stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 800, color: "var(--brand)" }}>手持ち注文</div>
          <div className="muted">{name}</div>
        </div>
        <Link className="btn ghost" href="/pos">
          POSへ
        </Link>
      </div>
      {msg ? <div className="card">{msg}</div> : null}
      <select className="input" value={tableId} onChange={(e) => setTableId(e.target.value)}>
        <option value="">テーブル選択</option>
        {tables.map((t) => (
          <option key={t.id} value={t.id}>
            {t.areaName} {t.code} ({t.status}
            {t.openCheck ? ` / ¥${t.openCheck.totalYen}` : ""})
          </option>
        ))}
      </select>
      {categories.map((c) => (
        <div key={c.id} className="card stack">
          <strong>{c.name}</strong>
          {c.items.map((item) => (
            <button key={item.id} className="btn" type="button" onClick={() => add(item.id)}>
              {item.name} · ¥{item.priceYen.toLocaleString()}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
