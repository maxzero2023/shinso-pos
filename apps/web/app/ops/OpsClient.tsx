"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";

type Shift = {
  id: string;
  status: string;
  openedAt: string;
  closedAt: string | null;
  note: string | null;
  businessDay: { id: string; businessDate: string; status: string };
};

type ExceptionCheck = {
  id: string;
  status: string;
  exceptionStatus: string;
  exceptionNote: string | null;
  exceptionFlaggedAt: string | null;
  exceptionResolveNote: string | null;
  totalYen: number;
  table: { code: string; area: { name: string } };
};

type Audit = {
  id: string;
  action: string;
  summary: string;
  createdAt: string;
  staff: { name: string; role: string };
  check: { id: string; status: string; table: { code: string } };
};

const ACTION_LABEL: Record<string, string> = {
  void_item: "明細取消",
  edit_item: "明細変更",
  flag_exception: "異常フラグ",
  resolve_exception: "異常解消",
};

function badgeStyle(status: string): CSSProperties {
  if (status === "open" || status === "flagged")
    return { background: "#fff3e0", color: "#ef6c00" };
  if (status === "closed" || status === "resolved")
    return { background: "#e8f5e9", color: "#2e7d32" };
  return { background: "#eceff1", color: "#546e7a" };
}

export function OpsClient({ role }: { role: string }) {
  const isOwner = role === "owner";
  const [today, setToday] = useState("");
  const [openCheckCount, setOpenCheckCount] = useState(0);
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  const [recentShifts, setRecentShifts] = useState<Shift[]>([]);
  const [exceptions, setExceptions] = useState<ExceptionCheck[]>([]);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [resolveNotes, setResolveNotes] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    const [sRes, eRes, aRes] = await Promise.all([
      fetch("/api/shifts"),
      fetch("/api/ops/exceptions?status=flagged"),
      fetch("/api/ops/audits?limit=40"),
    ]);
    const sData = await sRes.json();
    const eData = await eRes.json();
    const aData = await aRes.json();
    if (sRes.ok) {
      setToday(sData.todayBusinessDate);
      setOpenCheckCount(sData.openCheckCount);
      setCurrentShift(sData.currentShift);
      setRecentShifts(sData.recentShifts ?? []);
    }
    if (eRes.ok) setExceptions(eData.checks ?? []);
    if (aRes.ok) setAudits(aData.audits ?? []);
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  async function openShift() {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/shifts/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "開班失敗");
      return;
    }
    setMsg(data.alreadyOpen ? "すでに開班中です" : "開班しました");
    await refresh();
  }

  async function closeShift() {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/shifts/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(
        data.openCheckCount
          ? `未結伝票が ${data.openCheckCount} 件あるため閉店できません`
          : (data.error ?? "閉店失敗")
      );
      return;
    }
    setMsg("閉店しました");
    await refresh();
  }

  async function resolveException(checkId: string) {
    if (!isOwner) {
      setMsg("異常解消は店長/オーナーのみ可能です");
      return;
    }
    setBusy(true);
    setMsg("");
    const res = await fetch(`/api/checks/${checkId}/resolve-exception`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: resolveNotes[checkId] || "対応完了" }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "解消失敗");
      return;
    }
    setMsg("異常を解消しました");
    await refresh();
  }

  return (
    <div className="stack" style={{ gap: "1.25rem" }}>
      {msg ? (
        <div className="card" style={{ background: "var(--brand-soft)" }}>
          {msg}
        </div>
      ) : null}

      <div className="card stack">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <strong>シフト / 営業日</strong>
            <div className="muted" style={{ fontSize: "0.85rem" }}>
              タイムゾーン Asia/Tokyo · 本日 {today || "—"}
            </div>
          </div>
          <div className="row">
            <button className="btn" disabled={busy || !!currentShift} onClick={openShift}>
              開班
            </button>
            <button
              className="btn secondary"
              disabled={busy || !currentShift}
              onClick={closeShift}
            >
              閉店
            </button>
          </div>
        </div>
        <div className="row" style={{ gap: "1rem", flexWrap: "wrap" }}>
          <div>
            現在シフト:{" "}
            {currentShift ? (
              <span className="badge" style={badgeStyle("open")}>
                オープン中
              </span>
            ) : (
              <span className="badge" style={badgeStyle("closed")}>
                未開班
              </span>
            )}
          </div>
          <div>
            未結伝票: <strong>{openCheckCount}</strong>
            {openCheckCount > 0 ? (
              <span className="muted"> （閉店にはすべて精算が必要）</span>
            ) : null}
          </div>
          {currentShift ? (
            <div className="muted" style={{ fontSize: "0.85rem" }}>
              開始 {new Date(currentShift.openedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
            </div>
          ) : null}
        </div>
        {recentShifts.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>営業日</th>
                <th>状態</th>
                <th>開始</th>
                <th>終了</th>
              </tr>
            </thead>
            <tbody>
              {recentShifts.map((s) => (
                <tr key={s.id}>
                  <td>{String(s.businessDay.businessDate).slice(0, 10)}</td>
                  <td>
                    <span className="badge" style={badgeStyle(s.status)}>
                      {s.status === "open" ? "開" : "閉"}
                    </span>
                  </td>
                  <td>
                    {new Date(s.openedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
                  </td>
                  <td>
                    {s.closedAt
                      ? new Date(s.closedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="muted">シフト履歴なし</div>
        )}
      </div>

      <div className="card stack">
        <strong>異常伝票</strong>
        <div className="muted" style={{ fontSize: "0.85rem" }}>
          フロアでフラグ → 店長が解消。操作は監査ログに残ります。
        </div>
        {exceptions.length === 0 ? (
          <div className="muted">フラグ中の異常はありません</div>
        ) : (
          exceptions.map((c) => (
            <div
              key={c.id}
              className="card"
              style={{ background: "#fffaf5", borderColor: "#ffcc80" }}
            >
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div>
                  <strong>
                    {c.table.area.name} / {c.table.code}
                  </strong>{" "}
                  · ¥{c.totalYen.toLocaleString()} · {c.status}
                  <div className="muted" style={{ fontSize: "0.85rem" }}>
                    {c.exceptionNote}
                  </div>
                </div>
                <span className="badge" style={badgeStyle("flagged")}>
                  異常
                </span>
              </div>
              {isOwner ? (
                <div className="row" style={{ marginTop: "0.5rem" }}>
                  <input
                    className="input"
                    placeholder="対応メモ"
                    value={resolveNotes[c.id] ?? ""}
                    onChange={(e) =>
                      setResolveNotes((prev) => ({ ...prev, [c.id]: e.target.value }))
                    }
                  />
                  <button
                    className="btn"
                    disabled={busy}
                    onClick={() => resolveException(c.id)}
                  >
                    解消
                  </button>
                </div>
              ) : (
                <div className="muted" style={{ fontSize: "0.85rem", marginTop: "0.5rem" }}>
                  解消はオーナーでログインしてください
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="card stack">
        <strong>最近の監査ログ</strong>
        {audits.length === 0 ? (
          <div className="muted">まだ監査ログはありません</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>時刻</th>
                <th>卓</th>
                <th>操作</th>
                <th>誰が</th>
                <th>内容</th>
              </tr>
            </thead>
            <tbody>
              {audits.map((a) => (
                <tr key={a.id}>
                  <td style={{ whiteSpace: "nowrap", fontSize: "0.8rem" }}>
                    {new Date(a.createdAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
                  </td>
                  <td>{a.check.table.code}</td>
                  <td>{ACTION_LABEL[a.action] ?? a.action}</td>
                  <td>
                    {a.staff.name}
                    <div className="muted" style={{ fontSize: "0.75rem" }}>
                      {a.staff.role}
                    </div>
                  </td>
                  <td style={{ fontSize: "0.85rem" }}>{a.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
