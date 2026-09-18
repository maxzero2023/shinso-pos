"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type TableOpt = { id: string; code: string; seats: number; status: string; areaName?: string };

type Reservation = {
  id: string;
  partySize: number;
  startAt: string;
  endAt: string;
  status: string;
  guestName: string | null;
  guestPhone: string | null;
  note: string | null;
  tableId: string | null;
  checkId: string | null;
  table: null | { id: string; code: string; seats: number; status: string };
};

type WaitTicket = {
  id: string;
  ticketNo: number;
  partySize: number;
  status: string;
  guestName: string | null;
  guestPhone: string | null;
  calledAt: string | null;
  expiresAt: string | null;
  table: null | { id: string; code: string };
};

function tokyoToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function fmtTime(iso: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

const STATUS_LABEL: Record<string, string> = {
  hold: "仮予約",
  confirmed: "確定",
  seated: "着席",
  noshow: "ノーショー",
  cancelled: "キャンセル",
  waiting: "待ち",
  called: "呼出中",
  expired: "期限切れ",
};

export function ReservationsClient() {
  const [date, setDate] = useState(tokyoToday);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [waitlist, setWaitlist] = useState<WaitTicket[]>([]);
  const [tables, setTables] = useState<TableOpt[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"calendar" | "waitlist">("calendar");

  const [partySize, setPartySize] = useState(4);
  const [startTime, setStartTime] = useState("19:00");
  const [tableId, setTableId] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"confirmed" | "hold">("confirmed");

  const [wlParty, setWlParty] = useState(2);
  const [wlName, setWlName] = useState("");
  const [seatTableByTicket, setSeatTableByTicket] = useState<Record<string, string>>({});

  const freeTables = useMemo(() => tables.filter((t) => t.status === "free"), [tables]);

  const refresh = useCallback(async () => {
    const [rRes, wRes, tRes] = await Promise.all([
      fetch(`/api/reservations?date=${date}`),
      fetch(`/api/waitlist`),
      fetch(`/api/tables`),
    ]);
    const rData = await rRes.json();
    const wData = await wRes.json();
    const tData = await tRes.json();
    if (rRes.ok) setReservations(rData.reservations ?? []);
    if (wRes.ok) setWaitlist(wData.waitlist ?? []);
    if (tRes.ok) {
      setTables(
        ((tData.tables ?? []) as TableOpt[]).map((t) => ({
          id: t.id,
          code: t.code,
          seats: t.seats,
          status: t.status,
          areaName: t.areaName,
        }))
      );
    }
  }, [date]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function createReservation() {
    setBusy(true);
    setMsg("");
    try {
      const startAt = new Date(`${date}T${startTime}:00+09:00`).toISOString();
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partySize,
          startAt,
          tableId: tableId || null,
          guestName: guestName || null,
          guestPhone: guestPhone || null,
          note: note || null,
          status,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error ?? "作成失敗");
        return;
      }
      setMsg("予約を作成しました（LINE stub 通知）");
      setGuestName("");
      setGuestPhone("");
      setNote("");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function cancelReservation(id: string) {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/reservations/${id}/cancel`, { method: "POST" });
      const data = await res.json();
      setMsg(res.ok ? "予約をキャンセルしました" : (data.error ?? "失敗"));
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function seatReservation(id: string, fallbackTableId?: string | null) {
    setBusy(true);
    setMsg("");
    try {
      const body: { tableId?: string } = {};
      if (fallbackTableId) body.tableId = fallbackTableId;
      const res = await fetch(`/api/reservations/${id}/seat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error ?? "開台失敗");
        return;
      }
      setMsg(`開台完了 → Check ${String(data.check.id).slice(0, 8)}…（/pos で点餐可）`);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function joinWaitlist() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partySize: wlParty, guestName: wlName || null }),
      });
      const data = await res.json();
      setMsg(res.ok ? `整理券 ${data.ticket.ticketNo} 番を発行` : (data.error ?? "失敗"));
      setWlName("");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function callTicket(id: string) {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/waitlist/${id}/call`, { method: "POST" });
      const data = await res.json();
      setMsg(res.ok ? `${data.ticket.ticketNo} 番を呼出（LINE stub）` : (data.error ?? "失敗"));
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function seatTicket(id: string) {
    const tid = seatTableByTicket[id];
    if (!tid) {
      setMsg("着席する卓を選んでください");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/waitlist/${id}/seat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableId: tid }),
      });
      const data = await res.json();
      setMsg(res.ok ? `候位着席 → Check ${String(data.check.id).slice(0, 8)}…` : (data.error ?? "失敗"));
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function cancelTicket(id: string) {
    setBusy(true);
    await fetch(`/api/waitlist/${id}/cancel`, { method: "POST" });
    await refresh();
    setBusy(false);
  }

  const activeCount = reservations.filter((r) => !["cancelled", "noshow"].includes(r.status)).length;
  const waiting = waitlist.filter((w) => w.status === "waiting");
  const called = waitlist.filter((w) => w.status === "called");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn" type="button" onClick={() => setTab("calendar")} style={tab !== "calendar" ? { background: "white", color: "var(--brand)", border: "1px solid var(--brand)" } : undefined}>
          予約カレンダー
        </button>
        <button className="btn" type="button" onClick={() => setTab("waitlist")} style={tab !== "waitlist" ? { background: "white", color: "var(--brand)", border: "1px solid var(--brand)" } : undefined}>
          候位ボード
        </button>
        <span className="muted" style={{ marginLeft: "auto", fontSize: "0.85rem" }}>
          Asia/Tokyo · hold ≠ open Check（着席ボタンでのみ開台）
        </span>
      </div>

      {msg ? <div className="card" style={{ background: "#e8f7ef" }}>{msg}</div> : null}

      {tab === "calendar" ? (
        <>
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
              <label>
                日付（東京）
                <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: "auto", marginLeft: 8 }} />
              </label>
              <button className="btn ghost" type="button" onClick={refresh} disabled={busy}>更新</button>
            </div>

            <h3 style={{ margin: 0 }}>新規予約</h3>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
              <label>
                人数
                <input className="input" type="number" min={1} max={99} value={partySize} onChange={(e) => setPartySize(Number(e.target.value))} style={{ width: 80, marginLeft: 8 }} />
              </label>
              <label>
                時刻
                <input className="input" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={{ width: 120, marginLeft: 8 }} />
              </label>
              <label>
                卓
                <select className="input" value={tableId} onChange={(e) => setTableId(e.target.value)} style={{ width: 150, marginLeft: 8 }}>
                  <option value="">未指定</option>
                  {tables.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code}（{t.seats}）[{t.status}]
                    </option>
                  ))}
                </select>
              </label>
              <label>
                状態
                <select className="input" value={status} onChange={(e) => setStatus(e.target.value as "confirmed" | "hold")} style={{ width: 120, marginLeft: 8 }}>
                  <option value="confirmed">確定</option>
                  <option value="hold">仮予約(hold)</option>
                </select>
              </label>
            </div>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <input className="input" placeholder="お名前" value={guestName} onChange={(e) => setGuestName(e.target.value)} style={{ maxWidth: 180 }} />
              <input className="input" placeholder="電話" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} style={{ maxWidth: 160 }} />
              <input className="input" placeholder="メモ" value={note} onChange={(e) => setNote(e.target.value)} style={{ flex: 1 }} />
              <button className="btn" type="button" disabled={busy} onClick={createReservation}>予約作成</button>
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>{date} の予約（{activeCount}）</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>時刻</th>
                  <th>人数</th>
                  <th>卓</th>
                  <th>お客様</th>
                  <th>状態</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {reservations.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {fmtTime(r.startAt)}–{fmtTime(r.endAt)}
                    </td>
                    <td>{r.partySize}</td>
                    <td>
                      {r.table?.code ?? "—"}
                      {r.status === "hold" || r.status === "confirmed" ? (
                        <span style={{ marginLeft: 6, fontSize: "0.75rem", background: "#fff8e1", color: "#f57f17", padding: "0.1rem 0.45rem", borderRadius: 999 }}>
                          预占
                        </span>
                      ) : null}
                    </td>
                    <td>
                      {r.guestName ?? "—"}
                      <div className="muted" style={{ fontSize: "0.8rem" }}>
                        {r.guestPhone}
                      </div>
                    </td>
                    <td>{STATUS_LABEL[r.status] ?? r.status}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {r.status === "hold" || r.status === "confirmed" ? (
                          <>
                            <button
                              className="btn"
                              type="button"
                              disabled={busy || (!r.tableId && !tableId)}
                              onClick={() => seatReservation(r.id, r.tableId ?? (tableId || null))}
                            >
                              到店开台
                            </button>
                            <button className="btn ghost" type="button" disabled={busy} onClick={() => cancelReservation(r.id)}>
                              取消
                            </button>
                          </>
                        ) : r.status === "seated" ? (
                          <a href="/pos">POS へ</a>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {reservations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="muted">
                      この日の予約はありません
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <h3 style={{ margin: 0 }}>取号（客向け QR → /waitlist）</h3>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
              <label>
                人数
                <input className="input" type="number" min={1} value={wlParty} onChange={(e) => setWlParty(Number(e.target.value))} style={{ width: 80, marginLeft: 8 }} />
              </label>
              <input className="input" placeholder="お名前（任意）" value={wlName} onChange={(e) => setWlName(e.target.value)} style={{ maxWidth: 200 }} />
              <button className="btn" type="button" disabled={busy} onClick={joinWaitlist}>
                取号
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>待ち ({waiting.length})</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {waiting.map((w) => (
                  <div key={w.id} className="card" style={{ background: "#f4f6f5" }}>
                    <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                      <strong style={{ fontSize: "1.4rem" }}>#{w.ticketNo}</strong>
                      <span>{w.partySize}名</span>
                      <span className="muted">{w.guestName}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <button className="btn" type="button" disabled={busy} onClick={() => callTicket(w.id)}>
                        呼出
                      </button>
                      <button className="btn ghost" type="button" disabled={busy} onClick={() => cancelTicket(w.id)}>
                        取消
                      </button>
                    </div>
                  </div>
                ))}
                {waiting.length === 0 ? <div className="muted">待ちなし</div> : null}
              </div>
            </div>

            <div className="card">
              <h3 style={{ marginTop: 0 }}>呼出中 ({called.length})</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {called.map((w) => (
                  <div key={w.id} className="card" style={{ background: "#e3f2fd" }}>
                    <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                      <strong style={{ fontSize: "1.4rem" }}>#{w.ticketNo}</strong>
                      <span>{w.partySize}名</span>
                      <span className="muted">呼出中</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                      <select
                        className="input"
                        value={seatTableByTicket[w.id] ?? ""}
                        onChange={(e) => setSeatTableByTicket((s) => ({ ...s, [w.id]: e.target.value }))}
                        style={{ width: 140 }}
                      >
                        <option value="">卓を選択</option>
                        {freeTables.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.code}（{t.seats}）
                          </option>
                        ))}
                      </select>
                      <button className="btn" type="button" disabled={busy} onClick={() => seatTicket(w.id)}>
                        着席开台
                      </button>
                      <button className="btn ghost" type="button" disabled={busy} onClick={() => cancelTicket(w.id)}>
                        过号/取消
                      </button>
                    </div>
                  </div>
                ))}
                {called.length === 0 ? <div className="muted">呼出中なし</div> : null}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
