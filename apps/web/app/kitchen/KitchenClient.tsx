"use client";

import { useCallback, useEffect, useState } from "react";

type Ticket = {
  id: string;
  status: "queued" | "preparing" | "ready" | "served";
  firedAt: string;
  lines: Array<{ id: string; name: string; qty: number; modifiers: unknown }>;
  check: { table: { code: string; area: { name: string } } };
};

const COLS: Array<Ticket["status"]> = ["queued", "preparing", "ready", "served"];
const LABELS: Record<Ticket["status"], string> = {
  queued: "待ち",
  preparing: "調理中",
  ready: "提供可",
  served: "提供済",
};

const NEXT: Partial<Record<Ticket["status"], Ticket["status"]>> = {
  queued: "preparing",
  preparing: "ready",
  ready: "served",
};

export function KitchenClient() {
  const [tickets, setTickets] = useState<Ticket[]>([]);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/kitchen/tickets");
    const data = await res.json();
    if (res.ok) setTickets(data.tickets);
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [refresh]);

  async function advance(ticket: Ticket) {
    const next = NEXT[ticket.status];
    if (!next) return;
    await fetch(`/api/kitchen/tickets/${ticket.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    await refresh();
  }

  return (
    <div className="kitchen-board">
      {COLS.map((status) => (
        <div key={status} className="card stack">
          <strong>
            {LABELS[status]} ({tickets.filter((t) => t.status === status).length})
          </strong>
          {tickets
            .filter((t) => t.status === status)
            .map((t) => (
              <div key={t.id} className="card stack" style={{ background: "var(--brand-soft)" }}>
                <div style={{ fontWeight: 800 }}>
                  {t.check.table.area.name} {t.check.table.code}
                </div>
                <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                  {t.lines.map((l) => (
                    <li key={l.id}>
                      {l.name} x{l.qty}
                    </li>
                  ))}
                </ul>
                {NEXT[t.status] ? (
                  <button className="btn" type="button" onClick={() => advance(t)}>
                    → {LABELS[NEXT[t.status]!]}
                  </button>
                ) : null}
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}
