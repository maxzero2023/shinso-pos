"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  const [tableCodeInput, setTableCodeInput] = useState("");
  const [checkId, setCheckId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [firing, setFiring] = useState(false);

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

  const selectedTable = useMemo(
    () => tables.find((x) => x.id === tableId) ?? null,
    [tables, tableId]
  );

  function pickTableByCode() {
    const code = tableCodeInput.trim().toUpperCase();
    if (!code) {
      setMsg(t("enterTableCode"));
      return;
    }
    const match = tables.find(
      (tbl) => tbl.code.toUpperCase() === code || tbl.code.toUpperCase() === code.replace(/^#/, "")
    );
    if (!match) {
      setMsg(t("tableNotFound"));
      return;
    }
    setTableId(match.id);
    setTableCodeInput(match.code);
    setMsg(`${t("table")}: ${match.areaName} ${match.code}`);
  }

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

  async function fireToKitchen() {
    if (!checkId) {
      setMsg(t("openCheckRequired"));
      return;
    }
    setFiring(true);
    setMsg("");
    try {
      const res = await fetch(`/api/checks/${checkId}/fire`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error ?? t("fireFailed"));
        return;
      }
      setMsg(t("firedToKitchen"));
      await refresh();
    } finally {
      setFiring(false);
    }
  }

  return (
    <div className="mobile-shell handheld-shell stack">
      <div className="handheld-header row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 800, color: "var(--brand)", fontSize: "1.15rem" }}>
            {t("staffOrder")}
          </div>
          <div className="muted">{name} · handheld</div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <LanguageSwitcher />
          <Link className="btn ghost touch-target" href="/pos">
            {t("toPos")}
          </Link>
        </div>
      </div>

      {msg ? <div className="card handheld-msg">{msg}</div> : null}
      {loading ? <div className="card muted">{t("loading")}</div> : null}

      <div className="card stack handheld-table-pick">
        <strong>{t("selectTable")}</strong>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <input
            className="input touch-target handheld-code-input"
            value={tableCodeInput}
            onChange={(e) => setTableCodeInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") pickTableByCode();
            }}
            placeholder={t("tableCodePlaceholder")}
            aria-label={t("tableCodePlaceholder")}
            autoCapitalize="characters"
            inputMode="text"
          />
          <button className="btn touch-target" type="button" onClick={pickTableByCode}>
            {t("pickByCode")}
          </button>
        </div>
        <select
          className="input touch-target handheld-select"
          value={tableId}
          onChange={(e) => {
            setTableId(e.target.value);
            const tbl = tables.find((x) => x.id === e.target.value);
            if (tbl) setTableCodeInput(tbl.code);
          }}
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
        {selectedTable ? (
          <div className="muted" style={{ fontSize: "0.9rem" }}>
            {t("table")}: <strong>{selectedTable.areaName} {selectedTable.code}</strong>
            {selectedTable.openCheck
              ? ` · ${t("currentTotal")} ¥${selectedTable.openCheck.totalYen.toLocaleString()}`
              : ` · ${t("noOpenCheckShort")}`}
          </div>
        ) : null}
      </div>

      <div className="handheld-sticky-actions">
        <button
          className="btn touch-target handheld-fire"
          type="button"
          disabled={!checkId || firing}
          onClick={() => void fireToKitchen()}
        >
          {firing ? t("loading") : t("fireToKitchen")}
        </button>
      </div>

      {!loading && !categories.length ? (
        <div className="card muted">{t("emptyMenu")}</div>
      ) : (
        categories.map((c) => (
          <div key={c.id} className="card stack handheld-menu-card">
            <strong>{c.displayName ?? c.name}</strong>
            <div className="handheld-item-grid">
              {c.items.map((item) => (
                <button
                  key={item.id}
                  className="btn touch-target handheld-item"
                  type="button"
                  onClick={() => void add(item.id)}
                >
                  <span>{item.displayName ?? item.name}</span>
                  <span className="muted">¥{item.priceYen.toLocaleString()}</span>
                </button>
              ))}
            </div>
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
