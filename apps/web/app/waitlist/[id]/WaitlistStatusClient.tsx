"use client";

import { useCallback, useEffect, useState } from "react";

type TicketStatus = {
  id: string;
  ticketNo: number;
  partySize: number;
  status: string;
  statusJa: string;
  position: number | null;
  guestName: string | null;
  calledAt: string | null;
  expiresAt: string | null;
};

const ACCENT: Record<string, string> = {
  waiting: "#0e8f52",
  called: "#1565c0",
  seated: "#455a64",
  skipped: "#ef6c00",
  cancelled: "#9e9e9e",
  expired: "#c62828",
};

export function WaitlistStatusClient({ id }: { id: string }) {
  const [ticket, setTicket] = useState<TicketStatus | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/waitlist/${id}/status`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "読み込みに失敗しました");
        setTicket(null);
        return;
      }
      setTicket(data.ticket);
      setError("");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  if (loading) {
    return <div className="card muted">読み込み中…</div>;
  }
  if (error || !ticket) {
    return (
      <div className="card" style={{ color: "#c62828" }}>
        {error || "整理券が見つかりません"}
      </div>
    );
  }

  const color = ACCENT[ticket.status] ?? "#0e8f52";

  return (
    <div className="card" style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <div className="muted">整理券番号</div>
      <div style={{ fontSize: "4.5rem", fontWeight: 800, color, lineHeight: 1 }}>{ticket.ticketNo}</div>
      <div
        style={{
          display: "inline-block",
          margin: "0 auto",
          padding: "0.35rem 0.9rem",
          borderRadius: 999,
          background: `${color}18`,
          color,
          fontWeight: 700,
        }}
      >
        {ticket.statusJa}
      </div>
      {ticket.status === "waiting" && ticket.position != null ? (
        <div>
          <div className="muted">現在の待ち順番</div>
          <div style={{ fontSize: "2rem", fontWeight: 700 }}>{ticket.position} 番目</div>
          <p className="muted" style={{ margin: 0 }}>
            {ticket.partySize}名様
            {ticket.position <= 2 ? " · まもなくお呼び出しです" : " · 順番が近づくまでお待ちください"}
          </p>
        </div>
      ) : null}
      {ticket.status === "called" ? (
        <p style={{ margin: 0, fontWeight: 600 }}>お席へお越しください</p>
      ) : null}
      {ticket.status === "skipped" ? (
        <p style={{ margin: 0 }}>過号となりました。スタッフまでお声がけください。</p>
      ) : null}
      {ticket.status === "seated" ? (
        <p style={{ margin: 0 }}>ご案内済みです。ごゆっくりどうぞ。</p>
      ) : null}
      {ticket.guestName ? <div className="muted">{ticket.guestName} 様</div> : null}
      <button className="btn ghost" type="button" onClick={refresh}>
        更新
      </button>
    </div>
  );
}
