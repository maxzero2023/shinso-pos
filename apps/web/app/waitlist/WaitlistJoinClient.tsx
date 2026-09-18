"use client";

import { useState } from "react";
import Link from "next/link";

export function WaitlistJoinClient() {
  const [partySize, setPartySize] = useState(2);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestLineId, setGuestLineId] = useState("");
  const [ticket, setTicket] = useState<{
    ticketNo: number;
    id: string;
    position?: number;
    lineBound?: boolean;
  } | null>(null);
  const [notifyHint, setNotifyHint] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function join() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partySize,
          guestName: guestName || null,
          guestPhone: guestPhone || null,
          guestLineId: guestLineId.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "失敗しました");
        return;
      }
      setTicket({
        ticketNo: data.ticket.ticketNo,
        id: data.ticket.id,
        position: data.ticket.position,
        lineBound: data.ticket.lineBound,
      });
      if (data.notify?.pushed) {
        setNotifyHint("LINE で受付通知を送りました（simulator stub）");
      } else {
        setNotifyHint("LINE 未連携のためプッシュなし。ステータスページで順番を確認できます。");
      }
    } finally {
      setBusy(false);
    }
  }

  if (ticket) {
    return (
      <div className="card" style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <div className="muted">整理券番号</div>
        <div style={{ fontSize: "4rem", fontWeight: 800, color: "#0e8f52" }}>{ticket.ticketNo}</div>
        {ticket.position != null ? (
          <div>
            現在 <strong>{ticket.position}</strong> 番目です
          </div>
        ) : null}
        <p style={{ margin: 0 }}>{notifyHint}</p>
        <Link className="btn" href={`/waitlist/${ticket.id}`}>
          ステータスを見る
        </Link>
      </div>
    );
  }

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <label>
        人数
        <input
          className="input"
          type="number"
          min={1}
          max={20}
          value={partySize}
          onChange={(e) => setPartySize(Number(e.target.value))}
        />
      </label>
      <label>
        お名前（任意）
        <input className="input" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
      </label>
      <label>
        電話（任意）
        <input className="input" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} />
      </label>
      <label>
        LINE ID（会員連携・任意 / sim_*）
        <input
          className="input"
          value={guestLineId}
          onChange={(e) => setGuestLineId(e.target.value)}
          placeholder="sim_demo_taro"
        />
      </label>
      {error ? <div style={{ color: "#c62828" }}>{error}</div> : null}
      <button className="btn" type="button" disabled={busy} onClick={join}>
        取号する
      </button>
    </div>
  );
}
