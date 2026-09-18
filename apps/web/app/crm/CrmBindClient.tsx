"use client";

import { useState } from "react";

type Member = {
  id: string;
  lineUserId: string;
  displayName: string | null;
  points: number;
  coupons?: Array<{
    id: string;
    code: string;
    status: string;
    template: { name: string; discountYen: number };
  }>;
};

export function CrmBindClient() {
  const [name, setName] = useState("ゲスト");
  const [lineUserId, setLineUserId] = useState("");
  const [member, setMember] = useState<Member | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function bind() {
    setBusy(true);
    setMsg("");
    const body: Record<string, string> = { displayName: name };
    if (lineUserId.trim()) body.lineUserId = lineUserId.trim();
    const res = await fetch("/api/crm/line/bind", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "失敗");
      return;
    }
    setLineUserId(data.member.lineUserId);
    setMsg(data.created ? "会員登録完了（シミュレータ）" : "既存会員に再绑定");
    await loadMe(data.member.lineUserId);
  }

  async function loadMe(id?: string) {
    const lid = id ?? lineUserId;
    if (!lid) return;
    const res = await fetch(`/api/crm/members/me?lineUserId=${encodeURIComponent(lid)}`);
    const data = await res.json();
    if (res.ok) setMember(data.member);
    else setMsg(data.error);
  }

  return (
    <div className="stack" style={{ maxWidth: 520, margin: "2rem auto", padding: "0 1rem" }}>
      <h1 style={{ color: "var(--brand)" }}>LINE 会員（シミュレータ）</h1>
      <p className="muted">実LINE認証不要。LINE_MODE=simulator で fake lineUserId を発行します。</p>
      {msg ? <div className="card">{msg}</div> : null}
      <div className="card stack">
        <label>
          表示名
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          lineUserId（空で自動）
          <input
            className="input"
            value={lineUserId}
            onChange={(e) => setLineUserId(e.target.value)}
          />
        </label>
        <div className="row">
          <button className="btn" disabled={busy} onClick={bind}>
            绑定する
          </button>
          <button className="btn ghost" disabled={busy || !lineUserId} onClick={() => loadMe()}>
            マイページ
          </button>
        </div>
      </div>
      {member ? (
        <div className="card stack">
          <strong>{member.displayName}</strong>
          <div className="muted">{member.lineUserId}</div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{member.points} pt</div>
          <h3 style={{ margin: 0 }}>クーポン</h3>
          <ul>
            {(member.coupons ?? []).map((c) => (
              <li key={c.id}>
                <code>{c.code}</code> {c.template.name} ¥{c.template.discountYen} — {c.status}
              </li>
            ))}
            {(member.coupons ?? []).length === 0 ? <li className="muted">なし</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
