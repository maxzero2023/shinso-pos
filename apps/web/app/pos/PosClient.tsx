"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type TableRow = {
  id: string;
  code: string;
  seats: number;
  status: string;
  areaName: string;
  openCheck: null | {
    id: string;
    guestCount: number;
    itemCount: number;
    totalYen: number;
    openedAt: string;
  };
};

type MenuCategory = {
  id: string;
  name: string;
  items: Array<{
    id: string;
    name: string;
    priceYen: number;
    modifierGroups: Array<{
      id: string;
      name: string;
      modifiers: Array<{ id: string; name: string; priceYen: number }>;
    }>;
  }>;
};

type CheckDetail = {
  id: string;
  status: string;
  totalYen: number;
  table: { id: string; code: string };
  items: Array<{
    id: string;
    name: string;
    qty: number;
    unitPriceYen: number;
    status: string;
    modifiers: Array<{ name: string; priceYen: number }>;
  }>;
};

export function PosClient() {
  const [tables, setTables] = useState<TableRow[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [check, setCheck] = useState<CheckDetail | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [payMethod, setPayMethod] = useState("paypay");
  const [busy, setBusy] = useState(false);

  const selectedTable = useMemo(
    () => tables.find((t) => t.id === selectedTableId) ?? null,
    [tables, selectedTableId]
  );

  const refreshTables = useCallback(async () => {
    const res = await fetch("/api/tables");
    const data = await res.json();
    if (res.ok) setTables(data.tables);
  }, []);

  const loadCheck = useCallback(async (checkId: string) => {
    const res = await fetch(`/api/checks/${checkId}`);
    const data = await res.json();
    if (res.ok) setCheck(data.check);
  }, []);

  useEffect(() => {
    refreshTables();
    fetch("/api/menu/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []));
    const t = setInterval(refreshTables, 4000);
    return () => clearInterval(t);
  }, [refreshTables]);

  useEffect(() => {
    if (selectedTable?.openCheck?.id) {
      loadCheck(selectedTable.openCheck.id);
    } else {
      setCheck(null);
    }
    setQrUrl(null);
  }, [selectedTable, loadCheck]);

  async function openTable() {
    if (!selectedTableId) return;
    setBusy(true);
    setMsg("");
    const res = await fetch(`/api/tables/${selectedTableId}/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guestCount: 2 }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "開台失敗");
      return;
    }
    await refreshTables();
    await loadCheck(data.check.id);
  }

  async function addItem(menuItemId: string, modifierIds: string[] = []) {
    if (!check) return;
    setBusy(true);
    const res = await fetch(`/api/checks/${check.id}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ menuItemId, qty: 1, modifierIds }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "追加失敗");
      return;
    }
    await loadCheck(check.id);
    await refreshTables();
  }

  async function fire() {
    if (!check) return;
    setBusy(true);
    const res = await fetch(`/api/checks/${check.id}/fire`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "送厨失敗");
      return;
    }
    setMsg("キッチンに送信しました");
    await loadCheck(check.id);
  }

  async function pay() {
    if (!check) return;
    setBusy(true);
    const res = await fetch(`/api/checks/${check.id}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: payMethod, amountYen: check.totalYen }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "精算失敗");
      return;
    }
    setMsg("精算完了。テーブルが空席になりました。");
    setCheck(null);
    await refreshTables();
  }

  async function makeQr() {
    if (!selectedTableId) return;
    const res = await fetch(`/api/tables/${selectedTableId}/qr-token`);
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error ?? "QR生成失敗");
      return;
    }
    setQrUrl(data.url);
  }

  const areas = [...new Set(tables.map((t) => t.areaName))];

  return (
    <div className="stack">
      {msg ? <div className="card" style={{ borderColor: "var(--brand)" }}>{msg}</div> : null}

      <div className="row" style={{ alignItems: "stretch" }}>
        <div className="card stack" style={{ flex: 1.2, minWidth: 280 }}>
          <strong>テーブル</strong>
          {areas.map((area) => (
            <div key={area} className="stack">
              <div className="muted">{area}</div>
              <div className="grid tables">
                {tables
                  .filter((t) => t.areaName === area)
                  .map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="card table-tile"
                      style={{
                        borderColor: selectedTableId === t.id ? "var(--brand)" : undefined,
                        outline: selectedTableId === t.id ? "2px solid var(--brand)" : undefined,
                      }}
                      onClick={() => setSelectedTableId(t.id)}
                    >
                      <div>
                        <div style={{ fontWeight: 800, fontSize: "1.2rem" }}>{t.code}</div>
                        <span className={`badge ${t.status}`}>{t.status}</span>
                      </div>
                      <div className="muted" style={{ fontSize: "0.8rem" }}>
                        {t.openCheck
                          ? `¥${t.openCheck.totalYen.toLocaleString()} / ${t.openCheck.itemCount}点`
                          : `${t.seats}席`}
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>

        <div className="card stack" style={{ flex: 1, minWidth: 300 }}>
          <strong>伝票</strong>
          {!selectedTable ? (
            <div className="muted">テーブルを選択してください</div>
          ) : !check ? (
            <div className="stack">
              <div>
                {selectedTable.code}（{selectedTable.status}）
              </div>
              <button className="btn" disabled={busy} onClick={openTable}>
                開台する
              </button>
            </div>
          ) : (
            <div className="stack">
              <div className="row">
                <span>
                  {check.table.code} / <span className="badge open">{check.status}</span>
                </span>
                <strong>¥{check.totalYen.toLocaleString()}</strong>
              </div>
              <table className="table">
                <tbody>
                  {check.items
                    .filter((i) => i.status !== "void")
                    .map((i) => (
                      <tr key={i.id}>
                        <td>
                          {i.name} x{i.qty}
                          <div className="muted" style={{ fontSize: "0.75rem" }}>
                            {i.status}
                            {Array.isArray(i.modifiers) && i.modifiers.length
                              ? " / " + i.modifiers.map((m) => m.name).join(", ")
                              : ""}
                          </div>
                        </td>
                        <td>¥{(i.unitPriceYen * i.qty).toLocaleString()}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <div className="row">
                <button className="btn" disabled={busy} onClick={fire}>
                  送厨
                </button>
                <select
                  className="input"
                  style={{ width: "auto" }}
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                >
                  <option value="paypay">PayPay</option>
                  <option value="cash">現金</option>
                  <option value="card">カード</option>
                  <option value="wechat">WeChat</option>
                  <option value="alipay">Alipay</option>
                </select>
                <button className="btn secondary" disabled={busy || check.totalYen <= 0} onClick={pay}>
                  精算（mock）
                </button>
                <button className="btn ghost" onClick={makeQr}>
                  QR発行
                </button>
              </div>
              {qrUrl ? (
                <div className="card" style={{ background: "var(--brand-soft)" }}>
                  <div className="muted">ゲストQR</div>
                  <a href={qrUrl} target="_blank" rel="noreferrer">
                    {qrUrl}
                  </a>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {check ? (
        <div className="card stack">
          <strong>メニュー追加</strong>
          {categories.map((c) => (
            <div key={c.id} className="stack">
              <div style={{ fontWeight: 700 }}>{c.name}</div>
              <div className="row">
                {c.items.map((item) => {
                  const firstMod = item.modifierGroups[0]?.modifiers[0];
                  return (
                    <button
                      key={item.id}
                      className="btn ghost"
                      disabled={busy}
                      onClick={() => addItem(item.id, firstMod ? [] : [])}
                      type="button"
                    >
                      {item.name}
                      <span className="muted">¥{item.priceYen.toLocaleString()}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
