"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Rule = {
  id: string;
  type: "sleep_recall" | "coupon_nudge" | "welcome";
  enabled: boolean;
  params: Record<string, unknown>;
  frequencyDays: number;
  updatedAt: string;
};

type SendLog = {
  id: string;
  status: string;
  messageText: string;
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
  rule?: { id: string; type: string };
  member?: { id: string; displayName: string | null; lineUserId: string } | null;
};

const TYPE_JA: Record<string, string> = {
  sleep_recall: "休眠会員の再来店リコール",
  coupon_nudge: "クーポン／ポイント促し",
  welcome: "新規会員ウェルカム",
};

const STATUS_JA: Record<string, string> = {
  sent: "送信済",
  skipped_freq: "頻度スキップ",
  skipped_opt_out: "オプトアウト",
  skipped_disabled: "ルール無効",
  skipped_no_match: "対象なし",
  failed: "失敗",
};

export function MarketingClient() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [logs, setLogs] = useState<SendLog[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [editParams, setEditParams] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    const [r, l] = await Promise.all([
      fetch("/api/crm/marketing/rules").then((x) => x.json()),
      fetch("/api/crm/marketing/logs?limit=40").then((x) => x.json()),
    ]);
    if (r.rules) {
      setRules(r.rules);
      const next: Record<string, string> = {};
      for (const rule of r.rules as Rule[]) {
        next[rule.id] = JSON.stringify(rule.params ?? {}, null, 2);
      }
      setEditParams(next);
    }
    if (l.logs) setLogs(l.logs);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function toggleEnabled(rule: Rule) {
    setBusy(true);
    setMsg("");
    const res = await fetch(`/api/crm/marketing/rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !rule.enabled }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "更新に失敗しました");
      return;
    }
    setMsg(`${TYPE_JA[rule.type] ?? rule.type} を ${!rule.enabled ? "有効" : "無効"} にしました`);
    await refresh();
  }

  async function saveRule(rule: Rule, frequencyDays: number) {
    setBusy(true);
    setMsg("");
    let params: Record<string, unknown> = {};
    try {
      params = JSON.parse(editParams[rule.id] || "{}") as Record<string, unknown>;
    } catch {
      setBusy(false);
      setMsg("params JSON が不正です");
      return;
    }
    const res = await fetch(`/api/crm/marketing/rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ params, frequencyDays }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "保存に失敗しました");
      return;
    }
    setMsg("ルールを保存しました");
    await refresh();
  }

  async function runRule(ruleId?: string) {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/crm/marketing/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ruleId ? { ruleId } : {}),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "実行に失敗しました");
      return;
    }
    const t = data.summary?.totals;
    setMsg(
      `実行完了: 送信 ${t?.sent ?? 0} / 頻度スキップ ${t?.skippedFreq ?? 0} / マッチ ${t?.matched ?? 0}`
    );
    await refresh();
  }

  return (
    <div className="stack">
      <div className="card stack">
        <p className="muted" style={{ margin: 0 }}>
          LINE 会員向けの<strong>プリセット 2〜3 ルール</strong>
          （休眠リコール・クーポン促し・ウェルカム）。完全 CDP / 無限ルールビルダー / クロスチャネル归因ではありません。
          {" "}
          <Link href="/admin/crm">CRM 会員へ戻る</Link>
        </p>
        {msg ? <div className="banner">{msg}</div> : null}
        <div className="row">
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => void runRule()}
          >
            全有効ルールを実行
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={busy}
            onClick={() => void refresh()}
          >
            再読込
          </button>
        </div>
      </div>

      {rules.map((rule) => (
        <div key={rule.id} className="card stack">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong>{TYPE_JA[rule.type] ?? rule.type}</strong>
              <div className="muted" style={{ fontSize: "0.85rem" }}>
                type=<code>{rule.type}</code> · 頻度 {rule.frequencyDays} 日
              </div>
            </div>
            <label className="row" style={{ gap: "0.5rem", alignItems: "center" }}>
              <span className="muted">{rule.enabled ? "有効" : "無効"}</span>
              <input
                type="checkbox"
                checked={rule.enabled}
                disabled={busy}
                onChange={() => void toggleEnabled(rule)}
              />
            </label>
          </div>

          <label className="stack" style={{ gap: "0.25rem" }}>
            <span className="muted">params (JSON)</span>
            <textarea
              rows={5}
              value={editParams[rule.id] ?? "{}"}
              onChange={(e) =>
                setEditParams((prev) => ({ ...prev, [rule.id]: e.target.value }))
              }
              style={{ fontFamily: "monospace", fontSize: "0.85rem" }}
            />
          </label>

          <label className="row" style={{ gap: "0.5rem", alignItems: "center" }}>
            <span className="muted">frequencyDays</span>
            <input
              type="number"
              min={0}
              max={365}
              defaultValue={rule.frequencyDays}
              id={`freq-${rule.id}`}
              style={{ width: "5rem" }}
            />
          </label>

          <div className="row">
            <button
              type="button"
              className="btn secondary"
              disabled={busy}
              onClick={() => {
                const el = document.getElementById(`freq-${rule.id}`) as HTMLInputElement | null;
                const freq = el ? Number(el.value) : rule.frequencyDays;
                void saveRule(rule, freq);
              }}
            >
              保存
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy || !rule.enabled}
              onClick={() => void runRule(rule.id)}
            >
              このルールを実行
            </button>
          </div>
        </div>
      ))}

      <div className="card stack">
        <h3 style={{ margin: 0 }}>送信ログ</h3>
        <p className="muted" style={{ margin: 0 }}>
          LINE stub 送信・頻度スキップ等の記録（最新 40 件）
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>時刻</th>
              <th>ルール</th>
              <th>会員</th>
              <th>状態</th>
              <th>メッセージ</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  まだログがありません。ルールを実行してください。
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id}>
                  <td style={{ whiteSpace: "nowrap", fontSize: "0.8rem" }}>
                    {new Date(log.createdAt).toLocaleString("ja-JP", {
                      timeZone: "Asia/Tokyo",
                    })}
                  </td>
                  <td>{TYPE_JA[log.rule?.type ?? ""] ?? log.rule?.type ?? "—"}</td>
                  <td>
                    {log.member?.displayName ?? log.member?.lineUserId ?? "—"}
                  </td>
                  <td>{STATUS_JA[log.status] ?? log.status}</td>
                  <td style={{ maxWidth: "18rem", fontSize: "0.8rem" }}>
                    {log.messageText
                      ? log.messageText.slice(0, 80) + (log.messageText.length > 80 ? "…" : "")
                      : log.errorMessage ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
