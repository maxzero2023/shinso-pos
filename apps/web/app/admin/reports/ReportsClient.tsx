"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Daily = {
  date: string;
  timezone: string;
  revenueYen: number;
  paidCheckCount: number;
};
type TableAvg = Daily & { tableAvgYen: number };
type Hourly = {
  date: string;
  hours: Array<{ hour: number; label: string; revenueYen: number; paidCheckCount: number }>;
};
type Bestsellers = {
  from: string;
  to: string;
  items: Array<{ menuItemId: string; name: string; qty: number; revenueYen: number }>;
};

function yen(n: number) {
  return `¥${n.toLocaleString("ja-JP")}`;
}

export function ReportsClient({
  initialDate,
  role,
}: {
  initialDate: string;
  role: string;
}) {
  const [date, setDate] = useState(initialDate);
  const [daily, setDaily] = useState<Daily | null>(null);
  const [tableAvg, setTableAvg] = useState<TableAvg | null>(null);
  const [hourly, setHourly] = useState<Hourly | null>(null);
  const [bestsellers, setBestsellers] = useState<Bestsellers | null>(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    setMsg("");
    const q = encodeURIComponent(d);
    const [dRes, tRes, hRes, bRes] = await Promise.all([
      fetch(`/api/reports/daily?date=${q}`),
      fetch(`/api/reports/table-avg?date=${q}`),
      fetch(`/api/reports/hourly?date=${q}`),
      fetch(`/api/reports/bestsellers?from=${q}&to=${q}`),
    ]);
    const [dData, tData, hData, bData] = await Promise.all([
      dRes.json(),
      tRes.json(),
      hRes.json(),
      bRes.json(),
    ]);
    setLoading(false);
    if (!dRes.ok || !tRes.ok || !hRes.ok || !bRes.ok) {
      setMsg(
        dData.error ||
          tData.error ||
          hData.error ||
          bData.error ||
          "読み込みに失敗しました"
      );
      return;
    }
    setDaily(dData);
    setTableAvg(tData);
    setHourly(hData);
    setBestsellers(bData);
  }, []);

  useEffect(() => {
    load(date);
  }, [date, load]);

  const maxHourYen = Math.max(1, ...(hourly?.hours.map((h) => h.revenueYen) ?? [1]));
  const activeHours = hourly?.hours.filter((h) => h.paidCheckCount > 0) ?? [];

  return (
    <div className="stack">
      <div className="card" style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
        <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <span className="muted">営業日（Asia/Tokyo）</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ padding: "0.5rem", borderRadius: 8, border: "1px solid var(--border)" }}
          />
        </label>
        <button className="btn secondary" type="button" disabled={loading} onClick={() => load(date)}>
          {loading ? "読込中…" : "再読込"}
        </button>
        {role === "owner" ? (
          <Link href="/admin" className="btn ghost" style={{ minHeight: 40 }}>
            ← 店舗管理
          </Link>
        ) : null}
        <span className="muted" style={{ fontSize: "0.85rem" }}>
          権限: {role}（owner / floor 閲覧可 · kitchen 不可）
        </span>
      </div>

      {msg ? (
        <div className="card" style={{ color: "var(--danger)" }}>
          {msg}
        </div>
      ) : null}

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
        <div className="card stack">
          <div className="muted">日営収</div>
          <strong style={{ fontSize: "1.6rem" }}>{yen(daily?.revenueYen ?? 0)}</strong>
          <div className="muted">paid Check 合計 · void 除外</div>
        </div>
        <div className="card stack">
          <div className="muted">精算件数</div>
          <strong style={{ fontSize: "1.6rem" }}>{daily?.paidCheckCount ?? 0}</strong>
          <div className="muted">status=paid のみ</div>
        </div>
        <div className="card stack">
          <div className="muted">卓均</div>
          <strong style={{ fontSize: "1.6rem" }}>{yen(tableAvg?.tableAvgYen ?? 0)}</strong>
          <div className="muted">营収 ÷ 精算件数（四捨五入）</div>
        </div>
      </div>

      <div className="card stack">
        <h3 style={{ margin: 0 }}>時間帯分布（paidAt · Asia/Tokyo）</h3>
        {activeHours.length === 0 ? (
          <div className="muted">この日の精算はありません（0 表示）</div>
        ) : (
          <div className="stack" style={{ gap: "0.4rem" }}>
            {(hourly?.hours ?? [])
              .filter((h) => h.hour >= 10 && h.hour <= 23)
              .map((h) => (
                <div key={h.hour} style={{ display: "grid", gridTemplateColumns: "56px 1fr 100px 48px", gap: "0.5rem", alignItems: "center" }}>
                  <span className="muted">{h.label}</span>
                  <div style={{ background: "var(--brand-soft)", borderRadius: 6, height: 22, overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${(h.revenueYen / maxHourYen) * 100}%`,
                        height: "100%",
                        background: "var(--brand)",
                        minWidth: h.revenueYen > 0 ? 4 : 0,
                      }}
                    />
                  </div>
                  <span style={{ textAlign: "right" }}>{yen(h.revenueYen)}</span>
                  <span className="muted" style={{ textAlign: "right" }}>
                    {h.paidCheckCount}件
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>

      <div className="card stack">
        <h3 style={{ margin: 0 }}>熱銷（同日）</h3>
        {(bestsellers?.items.length ?? 0) === 0 ? (
          <div className="muted">データなし</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>品名</th>
                <th>数量</th>
                <th>売上</th>
              </tr>
            </thead>
            <tbody>
              {bestsellers!.items.map((row, i) => (
                <tr key={row.menuItemId}>
                  <td>{i + 1}</td>
                  <td>{row.name}</td>
                  <td>{row.qty}</td>
                  <td>{yen(row.revenueYen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card muted" style={{ fontSize: "0.85rem" }}>
        <strong>口径（AUT-32）</strong>
        <ul style={{ margin: "0.4rem 0 0", paddingLeft: "1.2rem" }}>
          <li>対象: Check.status = paid のみ（void 伝票は除外）</li>
          <li>明細: CheckItem.status ≠ void；金額は円整数</li>
          <li>日・時間帯の帰属: Payment.paidAt（無ければ Check.closedAt）の Asia/Tokyo 暦日/時</li>
          <li>卓均 = 日営収 ÷ 精算件数</li>
          <li>空日は 0（エラーにしない）</li>
        </ul>
      </div>
    </div>
  );
}
