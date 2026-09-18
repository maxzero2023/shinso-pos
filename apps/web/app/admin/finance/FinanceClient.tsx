"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type MenuRow = {
  menuItemId: string;
  name: string;
  soldQty: number;
  revenueYen: number;
  cogsYen: number;
  hasBom: boolean;
};

type Margins = {
  date: string;
  timezone: string;
  disclaimer: string;
  statutoryAccounting: false;
  revenueYen: number;
  paidCheckCount: number;
  cogsYen: number;
  expensesYen: number;
  grossMarginYen: number;
  byMenuItem: MenuRow[];
  missingBomNotes: string[];
};

type Expense = {
  id: string;
  date: string;
  amountYen: number;
  category: string;
  label: string | null;
  note: string | null;
  createdBy?: { name: string } | null;
  createdAt: string;
};

function yen(n: number) {
  return `¥${n.toLocaleString("ja-JP")}`;
}

export function FinanceClient({
  initialDate,
  canEdit,
  role,
}: {
  initialDate: string;
  canEdit: boolean;
  role: string;
}) {
  const [date, setDate] = useState(initialDate);
  const [margins, setMargins] = useState<Margins | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [amountYen, setAmountYen] = useState(5000);
  const [category, setCategory] = useState("光熱費");
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async (d: string) => {
    setLoading(true);
    setMsg("");
    const q = encodeURIComponent(d);
    const [mRes, eRes] = await Promise.all([
      fetch(`/api/finance/margins?date=${q}`),
      fetch(`/api/finance/expenses?date=${q}`),
    ]);
    const [mData, eData] = await Promise.all([mRes.json(), eRes.json()]);
    setLoading(false);
    if (!mRes.ok) {
      setMsg(mData.error || "毛利の読込に失敗しました");
      return;
    }
    if (!eRes.ok) {
      setMsg(eData.error || "費用の読込に失敗しました");
      return;
    }
    setMargins(mData);
    setExpenses(eData.expenses ?? []);
  }, []);

  useEffect(() => {
    load(date);
  }, [date, load]);

  async function submitExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/finance/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        amountYen: Number(amountYen),
        category,
        label: label.trim() || null,
        note: note.trim() || null,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error || "費用の登録に失敗しました");
      return;
    }
    setLabel("");
    setNote("");
    setMsg(`費用を登録しました: ${data.expense.category} ${yen(data.expense.amountYen)}`);
    await load(date);
  }

  const marginPct =
    margins && margins.revenueYen > 0
      ? Math.round((margins.grossMarginYen / margins.revenueYen) * 1000) / 10
      : null;

  return (
    <div className="stack">
      <div
        className="card"
        style={{
          background: "#fff8e6",
          borderColor: "#e6c35c",
        }}
      >
        <strong>⚠️ 経営分析用の概算 / 非法定帳務</strong>
        <p className="muted" style={{ margin: "0.35rem 0 0" }}>
          本画面の数値は店舗運営の目安です。会計帳簿・税務申告・監査資料の代替にはなりません。
          売上は当日の支払済 Check、原価は BOM×原料単価の粗算、費用は手入力の簡易経費です。
        </p>
      </div>

      <div
        className="card"
        style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}
      >
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
        <Link href="/admin/reports" className="btn ghost" style={{ minHeight: 40 }}>
          基礎レポート →
        </Link>
        {role === "owner" || role === "brand_admin" || role === "manager" ? (
          <Link href="/admin" className="btn ghost" style={{ minHeight: 40 }}>
            ← 店舗管理
          </Link>
        ) : null}
      </div>

      {msg ? (
        <div className="card" style={{ borderColor: "#0E8F52" }}>
          {msg}
        </div>
      ) : null}

      <div className="card stack">
        <h3 style={{ margin: 0 }}>毛利ボード</h3>
        {!margins ? (
          <p className="muted">読込中…</p>
        ) : (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: "0.75rem",
              }}
            >
              <Stat label="売上（支払済）" value={yen(margins.revenueYen)} sub={`${margins.paidCheckCount} 件`} />
              <Stat label="原価粗算 (COGS)" value={yen(margins.cogsYen)} sub="BOM × 単価" />
              <Stat label="費用合計" value={yen(margins.expensesYen)} sub="手入力経費" />
              <Stat
                label="粗利概算"
                value={yen(margins.grossMarginYen)}
                sub={marginPct != null ? `売上比 ${marginPct}%` : "—"}
                emphasis
              />
            </div>
            <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
              粗利 = 売上 − 原価 − 費用（費用は売上に加算しません）
            </p>
            {margins.missingBomNotes.length > 0 ? (
              <div style={{ background: "#fff3f0", padding: "0.75rem", borderRadius: 8 }}>
                <strong>BOM 未設定（原価 0 円扱い）</strong>
                <ul style={{ margin: "0.35rem 0 0", paddingLeft: "1.2rem" }}>
                  {margins.missingBomNotes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <table className="table">
              <thead>
                <tr>
                  <th>メニュー</th>
                  <th>販売数</th>
                  <th>売上</th>
                  <th>原価粗算</th>
                  <th>BOM</th>
                </tr>
              </thead>
              <tbody>
                {margins.byMenuItem.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      当日の販売明細はありません
                    </td>
                  </tr>
                ) : (
                  margins.byMenuItem.map((r) => (
                    <tr key={r.menuItemId}>
                      <td>{r.name}</td>
                      <td>{r.soldQty}</td>
                      <td>{yen(r.revenueYen)}</td>
                      <td>{yen(r.cogsYen)}</td>
                      <td>{r.hasBom ? "あり" : "なし"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </>
        )}
      </div>

      <div className="card stack">
        <h3 style={{ margin: 0 }}>費用入力</h3>
        {!canEdit ? (
          <p className="muted">費用の登録は owner / manager のみです（閲覧は可能）。</p>
        ) : (
          <form onSubmit={submitExpense} className="stack" style={{ maxWidth: 520 }}>
            <label className="stack" style={{ gap: 4 }}>
              <span className="muted">金額（円・整数）</span>
              <input
                type="number"
                min={1}
                step={1}
                value={amountYen}
                onChange={(e) => setAmountYen(Number(e.target.value))}
                required
                style={{ padding: "0.5rem", borderRadius: 8, border: "1px solid var(--border)" }}
              />
            </label>
            <label className="stack" style={{ gap: 4 }}>
              <span className="muted">カテゴリ</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{ padding: "0.5rem", borderRadius: 8, border: "1px solid var(--border)" }}
              >
                <option value="光熱費">光熱費</option>
                <option value="消耗品">消耗品</option>
                <option value="人件費概算">人件費概算</option>
                <option value="配送費">配送費</option>
                <option value="その他">その他</option>
              </select>
            </label>
            <label className="stack" style={{ gap: 4 }}>
              <span className="muted">ラベル（任意）</span>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="例: 電気代 9月分概算"
                style={{ padding: "0.5rem", borderRadius: 8, border: "1px solid var(--border)" }}
              />
            </label>
            <label className="stack" style={{ gap: 4 }}>
              <span className="muted">メモ（任意）</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                style={{ padding: "0.5rem", borderRadius: 8, border: "1px solid var(--border)" }}
              />
            </label>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? "登録中…" : "費用を登録（選択中の営業日）"}
            </button>
          </form>
        )}

        <h4 style={{ margin: "0.5rem 0 0" }}>当日の費用一覧</h4>
        <table className="table">
          <thead>
            <tr>
              <th>カテゴリ</th>
              <th>ラベル</th>
              <th>金額</th>
              <th>登録者</th>
            </tr>
          </thead>
          <tbody>
            {expenses.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted">
                  費用なし
                </td>
              </tr>
            ) : (
              expenses.map((ex) => (
                <tr key={ex.id}>
                  <td>{ex.category}</td>
                  <td>{ex.label || ex.note || "—"}</td>
                  <td>{yen(ex.amountYen)}</td>
                  <td>{ex.createdBy?.name ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  emphasis,
}: {
  label: string;
  value: string;
  sub?: string;
  emphasis?: boolean;
}) {
  return (
    <div
      style={{
        padding: "0.75rem",
        borderRadius: 10,
        border: `1px solid ${emphasis ? "#0E8F52" : "var(--border)"}`,
        background: emphasis ? "#f0faf4" : "var(--card, #fff)",
      }}
    >
      <div className="muted" style={{ fontSize: "0.8rem" }}>
        {label}
      </div>
      <div style={{ fontSize: "1.25rem", fontWeight: 700, marginTop: 4 }}>{value}</div>
      {sub ? (
        <div className="muted" style={{ fontSize: "0.75rem", marginTop: 2 }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}
