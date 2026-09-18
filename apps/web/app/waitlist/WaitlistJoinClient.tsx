"use client";

import { useState } from "react";

export function WaitlistJoinClient() {
  const [partySize, setPartySize] = useState(2);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [ticket, setTicket] = useState<{ ticketNo: number; id: string } | null>(null);
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
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "失敗しました");
        return;
      }
      setTicket({ ticketNo: data.ticket.ticketNo, id: data.ticket.id });
    } finally {
      setBusy(false);
    }
  }

  if (ticket) {
    return (
      <div className="card" style={{ textAlign: "center" }}>
        <div className="muted">整理券番号</div>
        <div style={{ fontSize: "4rem", fontWeight: 800, color: "#0e8f52" }}>{ticket.ticketNo}</div>
        <p>呼び出しまでお待ちください。LINE 通知（stub）が届きます。</p>
      </div>
    );
  }

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <label>
        人数
        <input className="input" type="number" min={1} max={20} value={partySize} onChange={(e) => setPartySize(Number(e.target.value))} />
      </label>
      <label>
        お名前（任意）
        <input className="input" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
      </label>
      <label>
        電話（任意）
        <input className="input" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} />
      </label>
      {error ? <div style={{ color: "#c62828" }}>{error}</div> : null}
      <button className="btn" type="button" disabled={busy} onClick={join}>
        取号する
      </button>
    </div>
  );
}
