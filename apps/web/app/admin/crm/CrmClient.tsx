"use client";

import { useCallback, useEffect, useState } from "react";

type Member = {
  id: string;
  lineUserId: string;
  displayName: string | null;
  points: number;
  _count?: { coupons: number; pointAwards: number };
};

type Template = {
  id: string;
  name: string;
  description: string | null;
  discountYen: number;
  pointsCost: number;
  active: boolean;
  _count?: { issues: number };
};

export function CrmClient() {
  const [members, setMembers] = useState<Member[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [mode, setMode] = useState("simulator");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const [tplName, setTplName] = useState("ドリンク1杯無料");
  const [tplDiscount, setTplDiscount] = useState(500);
  const [tplCost, setTplCost] = useState(0);

  const [issueMemberId, setIssueMemberId] = useState("");
  const [issueTemplateId, setIssueTemplateId] = useState("");

  const [bindName, setBindName] = useState("デモ太郎");
  const [bindLineId, setBindLineId] = useState("");

  const refresh = useCallback(async () => {
    const [m, t, c] = await Promise.all([
      fetch("/api/crm/members").then((r) => r.json()),
      fetch("/api/crm/coupon-templates").then((r) => r.json()),
      fetch("/api/crm/config").then((r) => r.json()),
    ]);
    if (m.members) setMembers(m.members);
    if (t.templates) {
      setTemplates(t.templates);
      if (!issueTemplateId && t.templates[0]) setIssueTemplateId(t.templates[0].id);
    }
    if (c.mode) setMode(c.mode);
    if (m.members?.[0] && !issueMemberId) setIssueMemberId(m.members[0].id);
  }, [issueMemberId, issueTemplateId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function createTemplate() {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/crm/coupon-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: tplName,
        discountYen: tplDiscount,
        pointsCost: tplCost,
        description: "Admin CRM デモ券",
      }),
    });
    const data = await res.json();
    setBusy(false);
    setMsg(res.ok ? `テンプレート作成: ${data.template.name}` : data.error);
    await refresh();
  }

  async function bindSimulator() {
    setBusy(true);
    setMsg("");
    const body: Record<string, string> = { displayName: bindName };
    if (bindLineId.trim()) body.lineUserId = bindLineId.trim();
    const res = await fetch("/api/crm/line/bind", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) {
      setMsg(
        `绑定OK: ${data.member.displayName} / ${data.member.lineUserId} (${data.created ? "新規" : "既存"})`
      );
      setBindLineId(data.member.lineUserId);
    } else {
      setMsg(data.error);
    }
    await refresh();
  }

  async function issueCoupon() {
    if (!issueMemberId || !issueTemplateId) return;
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/crm/coupons/issue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: issueMemberId, templateId: issueTemplateId }),
    });
    const data = await res.json();
    setBusy(false);
    setMsg(
      res.ok
        ? `券発行: ${data.coupon.code}（${data.coupon.template.name}）`
        : data.error
    );
    await refresh();
  }

  return (
    <div className="stack">
      <div className="card row" style={{ alignItems: "center" }}>
        <strong>LINE_MODE</strong>
        <span className="badge open">{mode}</span>
        <span className="muted">Messaging は stub（console.log）</span>
      </div>
      {msg ? <div className="card">{msg}</div> : null}

      <div className="card stack">
        <h3 style={{ margin: 0 }}>シミュレータ绑定</h3>
        <div className="row">
          <input
            className="input"
            placeholder="表示名"
            value={bindName}
            onChange={(e) => setBindName(e.target.value)}
          />
          <input
            className="input"
            placeholder="lineUserId（空=自動生成）"
            value={bindLineId}
            onChange={(e) => setBindLineId(e.target.value)}
          />
          <button className="btn" disabled={busy} onClick={bindSimulator}>
            绑定
          </button>
        </div>
      </div>

      <div className="card stack">
        <h3 style={{ margin: 0 }}>会員</h3>
        <table className="table">
          <thead>
            <tr>
              <th>名前</th>
              <th>LINE ID</th>
              <th>ポイント</th>
              <th>券/集点</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>{m.displayName ?? "—"}</td>
                <td>
                  <code style={{ fontSize: "0.8rem" }}>{m.lineUserId}</code>
                </td>
                <td>{m.points}</td>
                <td>
                  {m._count?.coupons ?? 0} / {m._count?.pointAwards ?? 0}
                </td>
              </tr>
            ))}
            {members.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted">
                  会員なし — 上でシミュレータ绑定
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="card stack">
        <h3 style={{ margin: 0 }}>クーポンテンプレート</h3>
        <div className="row">
          <input
            className="input"
            value={tplName}
            onChange={(e) => setTplName(e.target.value)}
            placeholder="名前"
          />
          <input
            className="input"
            type="number"
            style={{ width: 120 }}
            value={tplDiscount}
            onChange={(e) => setTplDiscount(Number(e.target.value))}
            placeholder="割引円"
          />
          <input
            className="input"
            type="number"
            style={{ width: 120 }}
            value={tplCost}
            onChange={(e) => setTplCost(Number(e.target.value))}
            placeholder="必要pt"
          />
          <button className="btn secondary" disabled={busy} onClick={createTemplate}>
            作成
          </button>
        </div>
        <ul>
          {templates.map((t) => (
            <li key={t.id}>
              {t.name} — ¥{t.discountYen} / {t.pointsCost}pt{" "}
              {t.active ? "" : "(停止)"} · 発行 {t._count?.issues ?? 0}
            </li>
          ))}
        </ul>
      </div>

      <div className="card stack">
        <h3 style={{ margin: 0 }}>券を発行</h3>
        <div className="row">
          <select
            className="input"
            style={{ width: "auto", minWidth: 180 }}
            value={issueMemberId}
            onChange={(e) => setIssueMemberId(e.target.value)}
          >
            <option value="">会員…</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName ?? m.lineUserId} ({m.points}pt)
              </option>
            ))}
          </select>
          <select
            className="input"
            style={{ width: "auto", minWidth: 180 }}
            value={issueTemplateId}
            onChange={(e) => setIssueTemplateId(e.target.value)}
          >
            <option value="">テンプレート…</option>
            {templates
              .filter((t) => t.active)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
          <button className="btn" disabled={busy} onClick={issueCoupon}>
            発行
          </button>
        </div>
      </div>
    </div>
  );
}
