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

const OVERDUE_MS = 10 * 60_000;

function ageMs(firedAt: string) {
  return Date.now() - new Date(firedAt).getTime();
}

function ageLabel(firedAt: string) {
  const m = Math.floor(ageMs(firedAt) / 60_000);
  return `${m}分`;
}

export function KitchenClient({ deviceMode }: { deviceMode?: "display" } = {}) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [now, setNow] = useState(Date.now());
  const display = deviceMode === "display";

  const refresh = useCallback(async () => {
    const res = await fetch("/api/kitchen/tickets");
    const data = await res.json();
    if (res.ok) setTickets(data.tickets);
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 2000);
    const clock = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      clearInterval(t);
      clearInterval(clock);
    };
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
    <div className={display ? "kitchen-board kds-board" : "kitchen-board"}>
      {display ? (
        <div className="kds-topbar">
          <strong>SHINSO 厨房ディスプレイ</strong>
          <span className="muted">{new Date(now).toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo" })}</span>
        </div>
      ) : null}
      {COLS.map((status) => (
        <div key={status} className="card stack">
          <strong style={{ fontSize: display ? "1.4rem" : undefined }}>
            {LABELS[status]} ({tickets.filter((t) => t.status === status).length})
          </strong>
          {tickets
            .filter((t) => t.status === status)
            .map((t) => {
              const overdue =
                (status === "queued" || status === "preparing") && ageMs(t.firedAt) > OVERDUE_MS;
              return (
                <div
                  key={t.id}
                  className={`card stack${overdue ? " kds-overdue" : ""}`}
                  style={{
                    background: overdue ? "#fdecea" : "var(--brand-soft)",
                    fontSize: display ? "1.25rem" : undefined,
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: display ? "1.6rem" : undefined }}>
                    {t.check.table.area.name} {t.check.table.code}
                    <span className="muted" style={{ marginLeft: 8, fontWeight: 600 }}>
                      {ageLabel(t.firedAt)}
                      {overdue ? " ⚠ 超過" : ""}
                    </span>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                    {t.lines.map((l) => (
                      <li key={l.id}>
                        {l.name} x{l.qty}
                      </li>
                    ))}
                  </ul>
                  {NEXT[t.status] ? (
                    <button
                      className="btn"
                      type="button"
                      style={{ minHeight: display ? 56 : undefined, fontSize: display ? "1.1rem" : undefined }}
                      onClick={() => advance(t)}
                    >
                      → {LABELS[NEXT[t.status]!]}
                    </button>
                  ) : null}
                </div>
              );
            })}
        </div>
      ))}
    </div>
  );
}
