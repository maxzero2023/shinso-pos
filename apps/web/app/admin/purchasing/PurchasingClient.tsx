"use client";

import { useCallback, useEffect, useState } from "react";

type Suggestion = {
  ingredientId: string;
  name: string;
  unit: string;
  onHand: number;
  lowStockThreshold: number;
  suggestedQty: number;
};

type OrderLine = {
  id: string;
  ingredientId: string;
  orderedQty: number;
  receivedQty: number | null;
  ingredient?: { id: string; name: string; unit: string };
};

type Audit = {
  id: string;
  action: string;
  summary: string;
  createdAt: string;
  staff?: { id: string; name: string } | null;
};

type Order = {
  id: string;
  status: string;
  note: string | null;
  createdAt: string;
  orderedAt: string | null;
  receivedAt: string | null;
  supplier?: { id: string; name: string } | null;
  lines: OrderLine[];
  audits?: Audit[];
  createdBy?: { name: string } | null;
};

type Supplier = { id: string; name: string };

type Tab = "suggestions" | "orders" | "receive";

const statusLabel: Record<string, string> = {
  draft: "下書き",
  ordered: "発注済",
  received: "入庫済",
  canceled: "キャンセル",
};

export function PurchasingClient({ canEdit }: { canEdit: boolean }) {
  const [tab, setTab] = useState<Tab>("suggestions");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [selected, setSelected] = useState<Order | null>(null);
  const [editQtys, setEditQtys] = useState<Record<string, number>>({});
  const [recvQtys, setRecvQtys] = useState<Record<string, number>>({});
  const [supplierId, setSupplierId] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [sug, ord, sup] = await Promise.all([
      fetch("/api/purchasing/suggestions").then((r) => r.json()),
      fetch("/api/purchasing/orders").then((r) => r.json()),
      fetch("/api/purchasing/suppliers").then((r) => r.json()),
    ]);
    if (sug.suggestions) setSuggestions(sug.suggestions);
    if (ord.orders) setOrders(ord.orders);
    if (sup.suppliers) {
      setSuppliers(sup.suppliers);
      if (!supplierId && sup.suppliers[0]) setSupplierId(sup.suppliers[0].id);
    }
  }, [supplierId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function loadOrder(id: string) {
    setSelectedId(id);
    const res = await fetch(`/api/purchasing/orders/${id}`);
    const data = await res.json();
    if (data.order) {
      setSelected(data.order);
      const eqs: Record<string, number> = {};
      const rqs: Record<string, number> = {};
      for (const l of data.order.lines as OrderLine[]) {
        eqs[l.ingredientId] = l.orderedQty;
        rqs[l.ingredientId] = l.receivedQty ?? l.orderedQty;
      }
      setEditQtys(eqs);
      setRecvQtys(rqs);
    }
  }

  async function createFromSuggestions() {
    if (!canEdit) return;
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/purchasing/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromSuggestions: true,
        supplierId: supplierId || null,
        status: "draft",
        lines: [],
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "作成に失敗しました");
      return;
    }
    setMsg(`下書き作成: ${data.order.id.slice(0, 8)}…（${data.order.lines.length}行）`);
    await refresh();
    setTab("orders");
    await loadOrder(data.order.id);
  }

  async function saveDraft() {
    if (!canEdit || !selected || selected.status !== "draft") return;
    setBusy(true);
    setMsg("");
    const lines = selected.lines.map((l) => ({
      ingredientId: l.ingredientId,
      orderedQty: editQtys[l.ingredientId] ?? l.orderedQty,
    }));
    const res = await fetch(`/api/purchasing/orders/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines, supplierId: supplierId || null }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "更新に失敗しました");
      return;
    }
    setMsg("下書きを保存しました");
    setSelected(data.order);
    await refresh();
  }

  async function confirmOrder() {
    if (!canEdit || !selected || selected.status !== "draft") return;
    setBusy(true);
    setMsg("");
    // save lines then order
    const lines = selected.lines.map((l) => ({
      ingredientId: l.ingredientId,
      orderedQty: editQtys[l.ingredientId] ?? l.orderedQty,
    }));
    await fetch(`/api/purchasing/orders/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines }),
    });
    const res = await fetch(`/api/purchasing/orders/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ordered" }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "発注確定に失敗しました");
      return;
    }
    setMsg("発注確定しました");
    setSelected(data.order);
    await refresh();
    setTab("receive");
  }

  async function cancelOrder() {
    if (!canEdit || !selected) return;
    if (selected.status !== "draft" && selected.status !== "ordered") return;
    setBusy(true);
    setMsg("");
    const res = await fetch(`/api/purchasing/orders/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "canceled" }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "キャンセルに失敗しました");
      return;
    }
    setMsg("キャンセルしました");
    setSelected(data.order);
    await refresh();
  }

  async function doReceive() {
    if (!canEdit || !selected) return;
    if (selected.status !== "draft" && selected.status !== "ordered") return;
    setBusy(true);
    setMsg("");
    const lines = selected.lines.map((l) => ({
      ingredientId: l.ingredientId,
      receivedQty: recvQtys[l.ingredientId] ?? l.orderedQty,
    }));
    const res = await fetch(`/api/purchasing/orders/${selected.id}/receive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "入庫に失敗しました");
      return;
    }
    setMsg(
      `入庫完了。在庫更新: ${(data.ledgerResults as Array<{ qtyDelta: number }>)
        .map((r) => `+${r.qtyDelta}`)
        .join(", ")}`
    );
    setSelected(data.order);
    await refresh();
  }

  const drafts = orders.filter((o) => o.status === "draft" || o.status === "ordered");
  const receivable = orders.filter((o) => o.status === "draft" || o.status === "ordered");

  return (
    <div className="stack">
      <div className="card row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
        {(
          [
            ["suggestions", "補貨提案"],
            ["orders", "発注書"],
            ["receive", "入庫確認"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={tab === k ? "btn" : "btn secondary"}
            onClick={() => setTab(k)}
          >
            {label}
          </button>
        ))}
        <button type="button" className="btn secondary" onClick={() => void refresh()} disabled={busy}>
          更新
        </button>
      </div>

      {msg ? (
        <div className="card" style={{ background: "#f0faf4" }}>
          {msg}
        </div>
      ) : null}

      {tab === "suggestions" ? (
        <div className="card stack">
          <h3 style={{ margin: 0 }}>低在庫 → 補貨提案</h3>
          <p className="muted" style={{ margin: 0 }}>
            提案数量 = max(0, 閾値 − 現在庫)。activeStoreId スコープ。
          </p>
          {canEdit ? (
            <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
              <label>
                仕入先{" "}
                <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn"
                disabled={busy || suggestions.length === 0}
                onClick={() => void createFromSuggestions()}
              >
                提案から下書き作成
              </button>
            </div>
          ) : null}
          {suggestions.length === 0 ? (
            <p className="muted">低在庫の原料はありません</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th align="left">原料</th>
                  <th align="right">現在庫</th>
                  <th align="right">閾値</th>
                  <th align="right">提案数量</th>
                  <th align="left">単位</th>
                </tr>
              </thead>
              <tbody>
                {suggestions.map((s) => (
                  <tr key={s.ingredientId}>
                    <td>{s.name}</td>
                    <td align="right">{s.onHand}</td>
                    <td align="right">{s.lowStockThreshold}</td>
                    <td align="right">
                      <strong>{s.suggestedQty}</strong>
                    </td>
                    <td>{s.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}

      {tab === "orders" ? (
        <div className="stack">
          <div className="card stack">
            <h3 style={{ margin: 0 }}>発注書一覧</h3>
            {orders.length === 0 ? (
              <p className="muted">発注書がありません</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
                {orders.map((o) => (
                  <li key={o.id} style={{ marginBottom: "0.35rem" }}>
                    <button
                      type="button"
                      className="btn secondary"
                      style={{ fontSize: "0.9rem" }}
                      onClick={() => void loadOrder(o.id)}
                    >
                      {o.id.slice(0, 8)}… [{statusLabel[o.status] ?? o.status}]{" "}
                      {o.supplier?.name ?? "仕入先なし"} · {o.lines.length}行
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {selected ? (
            <div className="card stack">
              <h3 style={{ margin: 0 }}>
                詳細 {selected.id.slice(0, 8)}… — {statusLabel[selected.status]}
              </h3>
              <div className="muted">
                作成: {selected.createdBy?.name ?? "—"} /{" "}
                {new Date(selected.createdAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
              </div>
              {canEdit && (selected.status === "draft" || selected.status === "ordered") ? (
                <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
                  {selected.status === "draft" ? (
                    <>
                      <button type="button" className="btn" disabled={busy} onClick={() => void saveDraft()}>
                        数量を保存
                      </button>
                      <button type="button" className="btn" disabled={busy} onClick={() => void confirmOrder()}>
                        発注確定
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={busy}
                    onClick={() => void cancelOrder()}
                  >
                    キャンセル
                  </button>
                </div>
              ) : null}

              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th align="left">原料</th>
                    <th align="right">発注数量</th>
                    <th align="right">入庫数量</th>
                    <th align="left">単位</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.lines.map((l) => (
                    <tr key={l.id}>
                      <td>{l.ingredient?.name ?? l.ingredientId}</td>
                      <td align="right">
                        {selected.status === "draft" && canEdit ? (
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={editQtys[l.ingredientId] ?? l.orderedQty}
                            onChange={(e) =>
                              setEditQtys((prev) => ({
                                ...prev,
                                [l.ingredientId]: Number(e.target.value),
                              }))
                            }
                            style={{ width: "6rem", textAlign: "right" }}
                          />
                        ) : (
                          l.orderedQty
                        )}
                      </td>
                      <td align="right">{l.receivedQty ?? "—"}</td>
                      <td>{l.ingredient?.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {selected.audits && selected.audits.length > 0 ? (
                <div>
                  <strong>操作履歴</strong>
                  <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.2rem" }}>
                    {selected.audits.map((a) => (
                      <li key={a.id} className="muted">
                        [{a.action}] {a.summary} — {a.staff?.name ?? "—"} /{" "}
                        {new Date(a.createdAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : drafts.length > 0 ? (
            <p className="muted">左の一覧から発注書を選択してください</p>
          ) : null}
        </div>
      ) : null}

      {tab === "receive" ? (
        <div className="stack">
          <div className="card stack">
            <h3 style={{ margin: 0 }}>入庫確認</h3>
            <p className="muted" style={{ margin: 0 }}>
              短収・超収いずれも可（数量 ≥ 0）。キャンセル済みは入庫不可。入庫後 StockLedger に inbound 記録。
            </p>
            {receivable.length === 0 ? (
              <p className="muted">入庫可能な発注書がありません</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
                {receivable.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => {
                        setTab("receive");
                        void loadOrder(o.id);
                      }}
                    >
                      {o.id.slice(0, 8)}… [{statusLabel[o.status]}] {o.lines.length}行
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {selected && (selected.status === "draft" || selected.status === "ordered") ? (
            <div className="card stack">
              <h3 style={{ margin: 0 }}>入庫数量入力 — {selected.id.slice(0, 8)}…</h3>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th align="left">原料</th>
                    <th align="right">発注</th>
                    <th align="right">入庫数量</th>
                    <th align="left">単位</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.lines.map((l) => (
                    <tr key={l.id}>
                      <td>{l.ingredient?.name}</td>
                      <td align="right">{l.orderedQty}</td>
                      <td align="right">
                        {canEdit ? (
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={recvQtys[l.ingredientId] ?? l.orderedQty}
                            onChange={(e) =>
                              setRecvQtys((prev) => ({
                                ...prev,
                                [l.ingredientId]: Number(e.target.value),
                              }))
                            }
                            style={{ width: "6rem", textAlign: "right" }}
                          />
                        ) : (
                          l.orderedQty
                        )}
                      </td>
                      <td>{l.ingredient?.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {canEdit ? (
                <button type="button" className="btn" disabled={busy} onClick={() => void doReceive()}>
                  入庫確定
                </button>
              ) : null}
            </div>
          ) : selected?.status === "canceled" ? (
            <div className="card">キャンセル済みのため入庫できません</div>
          ) : selected?.status === "received" ? (
            <div className="card">既に入庫済みです</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
