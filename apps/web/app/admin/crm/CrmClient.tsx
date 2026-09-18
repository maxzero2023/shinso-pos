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

type OwnerBinding = {
  id: string;
  lineUserId: string;
  dailyEnabled: boolean;
  weeklyEnabled: boolean;
} | null;

type DeliveryLog = {
  id: string;
  kind: "daily" | "weekly";
  status: "sent" | "failed" | "skipped";
  periodFrom: string;
  periodTo: string;
  messageText: string;
  errorMessage: string | null;
  attemptCount: number;
  sentAt: string | null;
  createdAt: string;
  snapshot?: unknown;
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

  const [ownerBinding, setOwnerBinding] = useState<OwnerBinding>(null);
  const [ownerLineId, setOwnerLineId] = useState("sim_owner_line");
  const [deliveryLogs, setDeliveryLogs] = useState<DeliveryLog[]>([]);

  const refresh = useCallback(async () => {
    const [m, t, c, ob, logs] = await Promise.all([
      fetch("/api/crm/members").then((r) => r.json()),
      fetch("/api/crm/coupon-templates").then((r) => r.json()),
      fetch("/api/crm/config").then((r) => r.json()),
      fetch("/api/crm/owner-line").then((r) => r.json()),
      fetch("/api/crm/owner-line/delivery-logs?limit=20").then((r) => r.json()),
    ]);
    if (m.members) setMembers(m.members);
    if (t.templates) {
      setTemplates(t.templates);
      if (!issueTemplateId && t.templates[0]) setIssueTemplateId(t.templates[0].id);
    }
    if (c.mode) setMode(c.mode);
    if (m.members?.[0] && !issueMemberId) setIssueMemberId(m.members[0].id);
    if (ob && "binding" in ob) {
      setOwnerBinding(ob.binding);
      if (ob.binding?.lineUserId) setOwnerLineId(ob.binding.lineUserId);
    }
    if (logs.logs) setDeliveryLogs(logs.logs);
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

  async function bindOwnerLine() {
    setBusy(true);
    setMsg("");
    const body: Record<string, string> = {};
    if (ownerLineId.trim()) body.lineUserId = ownerLineId.trim();
    const res = await fetch("/api/crm/owner-line/bind", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) {
      setMsg(
        `オーナーLINE绑定OK: ${data.binding.lineUserId}（${data.created ? "新規" : "更新"}）`
      );
      setOwnerLineId(data.binding.lineUserId);
    } else {
      setMsg(data.error ?? "オーナーのみ操作できます");
    }
    await refresh();
  }

  async function patchOwnerSettings(patch: {
    dailyEnabled?: boolean;
    weeklyEnabled?: boolean;
  }) {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/crm/owner-line/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    setBusy(false);
    setMsg(res.ok ? "推送設定を更新しました" : data.error);
    await refresh();
  }

  async function triggerDigest(kind: "daily" | "weekly") {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/crm/owner-line/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok || data.result) {
      const r = data.result;
      setMsg(
        `トリガー ${kind}: ${r?.status}${r?.reason ? ` (${r.reason})` : ""}${
          r?.messageText ? ` — ${r.messageText.split("\n")[0]}` : ""
        }`
      );
    } else {
      setMsg(data.error ?? "トリガー失敗");
    }
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
        <h3 style={{ margin: 0 }}>オーナー LINE 日報/週報（AUT-34）</h3>
        <p className="muted" style={{ margin: 0 }}>
          绑定後に日報（昨日）・週報（月〜日）を stub 送信。レポート口径（AUT-32）を再利用。
          操作は <strong>owner</strong> ロール。未绑定・スイッチOFF は送信しません。
        </p>
        <div className="row">
          <input
            className="input"
            placeholder="オーナー lineUserId（空=自動）"
            value={ownerLineId}
            onChange={(e) => setOwnerLineId(e.target.value)}
          />
          <button className="btn" disabled={busy} onClick={bindOwnerLine}>
            オーナー绑定
          </button>
        </div>
        {ownerBinding ? (
          <div className="stack" style={{ gap: "0.5rem" }}>
            <div className="row" style={{ alignItems: "center" }}>
              <span>
                绑定中: <code>{ownerBinding.lineUserId}</code>
              </span>
              <label className="row" style={{ alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={ownerBinding.dailyEnabled}
                  disabled={busy}
                  onChange={(e) =>
                    void patchOwnerSettings({ dailyEnabled: e.target.checked })
                  }
                />
                日報
              </label>
              <label className="row" style={{ alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={ownerBinding.weeklyEnabled}
                  disabled={busy}
                  onChange={(e) =>
                    void patchOwnerSettings({ weeklyEnabled: e.target.checked })
                  }
                />
                週報
              </label>
              <button
                className="btn secondary"
                disabled={busy}
                onClick={() => void triggerDigest("daily")}
              >
                日報トリガー
              </button>
              <button
                className="btn secondary"
                disabled={busy}
                onClick={() => void triggerDigest("weekly")}
              >
                週報トリガー
              </button>
            </div>
          </div>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            未绑定 — 上でオーナー LINE を绑定してください（seed は sim_owner_line）
          </p>
        )}
        <h4 style={{ marginBottom: 0 }}>送信記録</h4>
        <table className="table">
          <thead>
            <tr>
              <th>日時</th>
              <th>種別</th>
              <th>状態</th>
              <th>期間</th>
              <th>摘要</th>
            </tr>
          </thead>
          <tbody>
            {deliveryLogs.map((l) => (
              <tr key={l.id}>
                <td style={{ fontSize: "0.8rem" }}>
                  {new Date(l.createdAt).toLocaleString("ja-JP", {
                    timeZone: "Asia/Tokyo",
                  })}
                </td>
                <td>{l.kind === "daily" ? "日報" : "週報"}</td>
                <td>
                  <span className="badge open">{l.status}</span>
                  {l.errorMessage ? (
                    <span className="muted"> {l.errorMessage}</span>
                  ) : null}
                </td>
                <td>
                  {l.periodFrom === l.periodTo
                    ? l.periodFrom
                    : `${l.periodFrom}〜${l.periodTo}`}
                </td>
                <td style={{ fontSize: "0.8rem", whiteSpace: "pre-wrap" }}>
                  {l.messageText || "—"}
                </td>
              </tr>
            ))}
            {deliveryLogs.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  送信記録なし — 日報/週報トリガーで作成
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

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
