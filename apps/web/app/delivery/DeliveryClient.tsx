"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type MenuItem = { id: string; name: string; priceYen: number; active: boolean };
type Line = {
  id: string;
  externalItemName: string;
  externalItemCode: string | null;
  qty: number;
  unitPriceYen: number;
  menuItemId: string | null;
  note: string | null;
  menuItem: MenuItem | null;
};
type Order = {
  id: string;
  channel: string;
  externalId: string;
  status: string;
  customerName: string | null;
  customerPhone: string | null;
  note: string | null;
  mappingError: string | null;
  createdAt: string;
  checkId: string | null;
  lines: Line[];
  check?: {
    id: string;
    status: string;
    channel: string;
    kitchenTickets: Array<{ id: string; status: string }>;
  } | null;
};

const CHANNEL_JA: Record<string, string> = {
  demaecan: "出前館（シミュ）",
  uber_eats_jp: "Uber Eats（シミュ）",
};

const STATUS_JA: Record<string, string> = {
  pending: "確認待ち",
  confirmed: "確認済・送厨済",
  cancelled: "キャンセル",
};

export function DeliveryClient({
  initialMenu,
}: {
  initialMenu: MenuItem[];
}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [lineMaps, setLineMaps] = useState<Record<string, string>>({});

  const selected = orders.find((o) => o.id === selectedId) ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setMsg("");
    const q = filter === "pending" ? "?status=pending" : "";
    const res = await fetch(`/api/delivery/orders${q}`);
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setMsg(data.error || "読込に失敗しました");
      return;
    }
    setOrders(data.orders ?? []);
    if (selectedId && !(data.orders ?? []).some((o: Order) => o.id === selectedId)) {
      setSelectedId(null);
    }
  }, [filter, selectedId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected) {
      setLineMaps({});
      return;
    }
    const maps: Record<string, string> = {};
    for (const line of selected.lines) {
      maps[line.id] = line.menuItemId ?? "";
    }
    setLineMaps(maps);
  }, [selected]);

  async function simulate(badMap = false) {
    setBusy(true);
    setMsg("");
    const lines = badMap
      ? [
          {
            externalItemName: "存在しない謎メニューXYZ",
            qty: 1,
            unitPriceYen: 999,
            menuItemId: null,
          },
          {
            externalItemName: "生ビール",
            qty: 1,
            unitPriceYen: 580,
          },
        ]
      : [
          { externalItemName: "唐揚げ定食", qty: 1, unitPriceYen: 980 },
          { externalItemName: "生ビール", qty: 2, unitPriceYen: 580 },
          { externalItemName: "枝豆", qty: 1, unitPriceYen: 480 },
        ];
    const res = await fetch("/api/delivery/simulate/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: "demaecan",
        customerName: badMap ? "テスト誤マップ客" : "配達デモ太郎",
        customerPhone: "090-0000-0043",
        note: badMap ? "マッピング失敗デモ" : "seed/シミュレータ",
        lines,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error || "シミュレータ失敗");
      return;
    }
    setMsg(data.message || "受付しました（確認待ち）");
    setFilter("pending");
    setSelectedId(data.order?.id ?? null);
    await load();
  }

  async function saveMappings() {
    if (!selected) return;
    setBusy(true);
    setMsg("");
    const res = await fetch(`/api/delivery/orders/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lines: selected.lines.map((l) => ({
          id: l.id,
          menuItemId: lineMaps[l.id] ? lineMaps[l.id] : null,
        })),
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error || "マッピング保存失敗");
      return;
    }
    setMsg("マッピングを保存しました");
    await load();
  }

  async function confirm() {
    if (!selected) return;
    setBusy(true);
    setMsg("");
    // Save mappings first so confirm sees latest
    const patchRes = await fetch(`/api/delivery/orders/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lines: selected.lines.map((l) => ({
          id: l.id,
          menuItemId: lineMaps[l.id] ? lineMaps[l.id] : null,
        })),
      }),
    });
    if (!patchRes.ok) {
      const d = await patchRes.json();
      setBusy(false);
      setMsg(d.error || "マッピング保存失敗");
      return;
    }

    const res = await fetch(`/api/delivery/orders/${selected.id}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.mappingError || data.error || "確認に失敗しました（伝票は作成されていません）");
      await load();
      return;
    }
    setMsg(
      `確認完了：Check ${data.check?.id?.slice(0, 8)}… / 厨房チケット ${data.ticket?.id?.slice(0, 8)}…`
    );
    await load();
  }

  return (
    <div className="stack">
      <div className="card stack">
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
          <div>
            <strong>外卖半自動進単（AUT-43）</strong>
            <div className="muted" style={{ fontSize: "0.85rem" }}>
              Webhook だけでは Check / KDS を作りません。店員がマッピング確認後に送厨します。
            </div>
          </div>
          <div className="row" style={{ gap: "0.5rem" }}>
            <button className="btn secondary" disabled={busy} onClick={() => simulate(false)} type="button">
              シミュレータ受信
            </button>
            <button className="btn secondary" disabled={busy} onClick={() => simulate(true)} type="button">
              誤マップ受信デモ
            </button>
            <Link className="btn ghost" href="/kitchen">
              キッチン →
            </Link>
          </div>
        </div>
        {msg ? (
          <div
            style={{
              padding: "0.6rem 0.75rem",
              borderRadius: 8,
              background: msg.includes("失敗") || msg.includes("未完了") || msg.includes("無効")
                ? "#ffe8e8"
                : "#e8fff2",
              color: msg.includes("失敗") || msg.includes("未完了") || msg.includes("無効")
                ? "#a11"
                : "#0a5",
            }}
          >
            {msg}
          </div>
        ) : null}
      </div>

      <div className="row" style={{ alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
        <div className="card stack" style={{ flex: "1 1 280px", minWidth: 260 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>注文一覧</strong>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as "pending" | "all")}
              style={{ fontSize: "0.85rem" }}
            >
              <option value="pending">確認待ち</option>
              <option value="all">すべて</option>
            </select>
          </div>
          {loading ? <div className="muted">読込中…</div> : null}
          {orders.length === 0 && !loading ? (
            <div className="muted">注文がありません。「シミュレータ受信」でデモできます。</div>
          ) : null}
          {orders.map((o) => (
            <button
              key={o.id}
              type="button"
              className="btn ghost"
              onClick={() => setSelectedId(o.id)}
              style={{
                textAlign: "left",
                border:
                  o.id === selectedId ? "2px solid #0E8F52" : "1px solid #ddd",
                background: o.id === selectedId ? "#f0faf4" : undefined,
              }}
            >
              <div>
                <strong>{CHANNEL_JA[o.channel] ?? o.channel}</strong>{" "}
                <span className="muted">{o.externalId}</span>
              </div>
              <div className="muted" style={{ fontSize: "0.8rem" }}>
                {STATUS_JA[o.status] ?? o.status}
                {o.customerName ? ` · ${o.customerName}` : ""}
                {` · ${o.lines.length}品`}
              </div>
              {o.mappingError ? (
                <div style={{ color: "#a11", fontSize: "0.75rem" }}>{o.mappingError}</div>
              ) : null}
            </button>
          ))}
          <button className="btn secondary" type="button" onClick={() => load()} disabled={loading}>
            再読込
          </button>
        </div>

        <div className="card stack" style={{ flex: "2 1 400px", minWidth: 300 }}>
          {!selected ? (
            <div className="muted">左の一覧から注文を選んでください</div>
          ) : (
            <>
              <div>
                <strong>
                  {CHANNEL_JA[selected.channel] ?? selected.channel} / {selected.externalId}
                </strong>
                <div className="muted">
                  {STATUS_JA[selected.status]} · 客: {selected.customerName ?? "—"} ·{" "}
                  {selected.customerPhone ?? "—"}
                </div>
                {selected.note ? <div className="muted">備考: {selected.note}</div> : null}
                {selected.mappingError ? (
                  <div style={{ color: "#a11", marginTop: "0.35rem" }}>
                    ⚠ {selected.mappingError}
                  </div>
                ) : null}
                {selected.checkId ? (
                  <div className="muted" style={{ marginTop: "0.35rem" }}>
                    Check: {selected.checkId.slice(0, 12)}… / KDS:{" "}
                    {selected.check?.kitchenTickets?.map((t) => t.status).join(", ") ?? "—"}
                  </div>
                ) : null}
              </div>

              <h3 style={{ margin: "0.5rem 0 0" }}>メニューマッピング</h3>
              {selected.lines.map((line) => (
                <div
                  key={line.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "0.5rem",
                    padding: "0.5rem 0",
                    borderBottom: "1px solid #eee",
                  }}
                >
                  <div>
                    <div>
                      <strong>{line.externalItemName}</strong> ×{line.qty}
                    </div>
                    <div className="muted" style={{ fontSize: "0.8rem" }}>
                      外部価格 ¥{line.unitPriceYen.toLocaleString("ja-JP")}
                      {line.externalItemCode ? ` · ${line.externalItemCode}` : ""}
                    </div>
                  </div>
                  <div>
                    <select
                      disabled={selected.status !== "pending" || busy}
                      value={lineMaps[line.id] ?? ""}
                      onChange={(e) =>
                        setLineMaps((prev) => ({ ...prev, [line.id]: e.target.value }))
                      }
                      style={{ width: "100%", padding: "0.35rem" }}
                    >
                      <option value="">— 未マッピング —</option>
                      {initialMenu.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} (¥{m.priceYen.toLocaleString("ja-JP")})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}

              {selected.status === "pending" ? (
                <div className="row" style={{ gap: "0.5rem", marginTop: "0.75rem" }}>
                  <button className="btn secondary" type="button" disabled={busy} onClick={saveMappings}>
                    マッピング保存
                  </button>
                  <button className="btn" type="button" disabled={busy} onClick={confirm}>
                    確認して厨房へ送る
                  </button>
                </div>
              ) : (
                <div className="muted">この注文は確認済みです。キッチンで状態を確認してください。</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
