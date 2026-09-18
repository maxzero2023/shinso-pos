"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { LocaleProvider, useLocale } from "@/lib/i18n/LocaleProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

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
  displayName?: string;
  items: Array<{ id: string; name: string; displayName?: string; priceYen: number }>;
};

function StaffClientInner({ name }: { name: string }) {
  const { locale, t, ready } = useLocale();
  const [tables, setTables] = useState<TableRow[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [tableId, setTableId] = useState("");
  const [checkId, setCheckId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [tablesData, menuData] = await Promise.all([
        fetch("/api/tables").then((r) => r.json()),
        fetch(`/api/menu/categories?locale=${locale}`).then((r) => r.json()),
      ]);
      setTables(tablesData.tables ?? []);
      setCategories(menuData.categories ?? []);
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    if (!ready) return;
    void refresh();
  }, [ready, refresh]);

  useEffect(() => {
    const tbl = tables.find((x) => x.id === tableId);
    setCheckId(tbl?.openCheck?.id ?? null);
  }, [tableId, tables]);

  async function add(menuItemId: string) {
    if (!checkId) {
      setMsg(t("openCheckRequired"));
      return;
    }
    const res = await fetch(`/api/checks/${checkId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ menuItemId, qty: 1, modifierIds: [] }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error ?? t("failed"));
      return;
    }
    setMsg(t("added"));
    const refreshed = await fetch("/api/tables").then((r) => r.json());
    setTables(refreshed.tables ?? []);
  }

  return (
    <div className="mobile-shell stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 800, color: "var(--brand)" }}>{t("staffOrder")}</div>
          <div className="muted">{name}</div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <LanguageSwitcher />
          <Link className="btn ghost touch-target" href="/pos">
            {t("toPos")}
          </Link>
        </div>
      </div>
      {msg ? <div className="card">{msg}</div> : null}
      {loading ? <div className="card muted">{t("loading")}</div> : null}
      <select
        className="input touch-target"
        value={tableId}
        onChange={(e) => setTableId(e.target.value)}
        aria-label={t("selectTable")}
      >
        <option value="">{t("selectTable")}</option>
        {tables.map((tbl) => (
          <option key={tbl.id} value={tbl.id}>
            {tbl.areaName} {tbl.code} ({tbl.status}
            {tbl.openCheck ? ` / ¥${tbl.openCheck.totalYen}` : ""})
          </option>
        ))}
      </select>
      {!loading && !categories.length ? (
        <div className="card muted">{t("emptyMenu")}</div>
      ) : (
        categories.map((c) => (
          <div key={c.id} className="card stack">
            <strong>{c.displayName ?? c.name}</strong>
            {c.items.map((item) => (
              <button
                key={item.id}
                className="btn touch-target"
                type="button"
                onClick={() => void add(item.id)}
              >
                {item.displayName ?? item.name} · ¥{item.priceYen.toLocaleString()}
              </button>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

export function StaffClient({ name }: { name: string }) {
  return (
    <LocaleProvider>
      <StaffClientInner name={name} />
    </LocaleProvider>
  );
}
