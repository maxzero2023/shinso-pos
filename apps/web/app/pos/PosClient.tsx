"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { StripeCardForm } from "@/components/payments/StripeCardForm";

type TableRow = {
  id: string;
  code: string;
  seats: number;
  status: string;
  areaName: string;
  openCheck: null | {
    id: string;
    guestCount: number;
    itemCount: number;
    totalYen: number;
    openedAt: string;
  };
};

type MenuCategory = {
  id: string;
  name: string;
  items: Array<{
    id: string;
    name: string;
    priceYen: number;
    modifierGroups: Array<{
      id: string;
      name: string;
      modifiers: Array<{ id: string; name: string; priceYen: number }>;
    }>;
  }>;
};

type CheckDetail = {
  id: string;
  status: string;
  totalYen: number;
  exceptionStatus?: string;
  exceptionNote?: string | null;
  table: { id: string; code: string };
  items: Array<{
    id: string;
    name: string;
    qty: number;
    unitPriceYen: number;
    status: string;
    modifiers: Array<{ name: string; priceYen: number }>;
  }>;
};

type PayConfig = {
  mode: "mock" | "sandbox" | "live";
  stripe: { configured: boolean; publishableKey: string | null; simulator: boolean };
  paypay: { configured: boolean; simulator: boolean };
};

type PendingPayment = {
  id: string;
  method: string;
  status: string;
  clientSecret?: string | null;
  redirectUrl?: string | null;
  providerPayload?: Record<string, unknown>;
};

type CrmMember = {
  id: string;
  lineUserId: string;
  displayName: string | null;
  points: number;
};

export function PosClient({ deviceMode, role = "floor" }: { deviceMode?: "t1"; role?: string } = {}) {
  const [tables, setTables] = useState<TableRow[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [check, setCheck] = useState<CheckDetail | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [payMethod, setPayMethod] = useState("paypay");
  const [busy, setBusy] = useState(false);
  const [payConfig, setPayConfig] = useState<PayConfig | null>(null);
  const [pending, setPending] = useState<PendingPayment | null>(null);
  const [hwError, setHwError] = useState("");
  const [members, setMembers] = useState<CrmMember[]>([]);
  const [payMemberId, setPayMemberId] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [crmMsg, setCrmMsg] = useState("");

  const selectedTable = useMemo(
    () => tables.find((t) => t.id === selectedTableId) ?? null,
    [tables, selectedTableId]
  );

  const refreshTables = useCallback(async () => {
    const res = await fetch("/api/tables");
    const data = await res.json();
    if (res.ok) setTables(data.tables);
  }, []);

  const loadCheck = useCallback(async (checkId: string) => {
    const res = await fetch(`/api/checks/${checkId}`);
    const data = await res.json();
    if (res.ok) setCheck(data.check);
  }, []);

  useEffect(() => {
    refreshTables();
    fetch("/api/menu/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []));
    fetch("/api/payments/config")
      .then((r) => r.json())
      .then((d) => setPayConfig(d))
      .catch(() => null);
    fetch("/api/crm/members")
      .then((r) => r.json())
      .then((d) => setMembers(d.members ?? []))
      .catch(() => null);
    const t = setInterval(refreshTables, 4000);
    return () => clearInterval(t);
  }, [refreshTables]);

  useEffect(() => {
    if (selectedTable?.openCheck?.id) {
      loadCheck(selectedTable.openCheck.id);
    } else {
      setCheck(null);
    }
    setQrUrl(null);
    setPending(null);
  }, [selectedTable, loadCheck]);

  async function openTable() {
    if (!selectedTableId) return;
    setBusy(true);
    setMsg("");
    const res = await fetch(`/api/tables/${selectedTableId}/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guestCount: 2 }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "開台失敗");
      return;
    }
    await refreshTables();
    await loadCheck(data.check.id);
  }

  async function addItem(menuItemId: string, modifierIds: string[] = []) {
    if (!check) return;
    setBusy(true);
    const res = await fetch(`/api/checks/${check.id}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ menuItemId, qty: 1, modifierIds }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "追加失敗");
      return;
    }
    await loadCheck(check.id);
    await refreshTables();
  }

  async function fire() {
    if (!check) return;
    setBusy(true);
    const res = await fetch(`/api/checks/${check.id}/fire`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "送厨失敗");
      return;
    }
    setMsg("キッチンに送信しました");
    await loadCheck(check.id);
  }

  async function voidItem(checkItemId: string, itemStatus: string) {
    if (!check) return;
    const needsManager = itemStatus !== "draft";
    if (needsManager && role !== "owner") {
      setMsg("送厨済の取消は店長/オーナー権限が必要です");
      return;
    }
    setBusy(true);
    setMsg("");
    const res = await fetch(`/api/checks/${check.id}/void-item`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkItemId, reason: "POS取消" }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "取消失敗");
      return;
    }
    setMsg("明細を取消しました（監査ログに記録）");
    await loadCheck(check.id);
  }

  async function flagException() {
    if (!check) return;
    const note = window.prompt("異常内容を入力", "金額確認 / クレーム");
    if (!note) return;
    setBusy(true);
    setMsg("");
    const res = await fetch(`/api/checks/${check.id}/flag-exception`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "フラグ失敗");
      return;
    }
    setMsg("異常フラグを付けました → /ops で確認");
    await loadCheck(check.id);
  }


  async function pay() {
    if (!check) return;
    setBusy(true);
    setMsg("");
    const idempotencyKey =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `pos_${check.id}_${Date.now()}`;
    const res = await fetch(`/api/checks/${check.id}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method: payMethod,
        amountYen: check.totalYen,
        idempotencyKey,
        ...(payMemberId ? { memberId: payMemberId } : {}),
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "精算失敗");
      return;
    }

    const payment = data.payment as PendingPayment & { status: string };
    if (payment?.status === "succeeded") {
      setMsg(
        data.mode === "mock"
          ? "精算完了（mock）。テーブルが空席になりました。"
          : "精算完了。テーブルが空席になりました。"
      );
      setCheck(null);
      setPending(null);
      await refreshTables();
      return;
    }

    // Pending gateway flow
    setPending({
      id: payment.id,
      method: payMethod,
      status: payment.status,
      clientSecret: data.clientSecret ?? payment.clientSecret,
      redirectUrl: data.redirectUrl,
      providerPayload: data.providerPayload,
    });
    setMsg(
      payMethod === "card"
        ? "カード決済を確定してください（処理中は伝票 open）"
        : "PayPay 支払いを完了してください（処理中は伝票 open）"
    );
  }


  async function redeemCoupon() {
    if (!couponCode.trim()) return;
    setBusy(true);
    setCrmMsg("");
    const res = await fetch("/api/crm/coupons/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: couponCode.trim(),
        checkId: check?.id ?? null,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) {
      setCrmMsg(`核销OK: ${data.coupon.code}（${data.coupon.template.name}）`);
      setCouponCode("");
    } else {
      setCrmMsg(data.error ?? "核销失敗");
    }
  }

  async function makeQr() {
    if (!selectedTableId) return;
    const res = await fetch(`/api/tables/${selectedTableId}/qr-token`);
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error ?? "QR生成失敗");
      return;
    }
    setQrUrl(data.url);
  }

  async function simulatePayPay(outcome: "succeeded" | "failed" | "canceled") {
    if (!pending || !check) return;
    setBusy(true);
    const res = await fetch("/api/payments/paypay/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId: pending.id, outcome }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "シミュレート失敗");
      return;
    }
    if (outcome === "succeeded") {
      setMsg("PayPay 精算完了（シミュレータ）。テーブルが空席になりました。");
      setCheck(null);
      setPending(null);
      await refreshTables();
    } else {
      setMsg(
        outcome === "failed"
          ? "PayPay 失敗 — 伝票は open のまま。再試行できます。"
          : "PayPay 取消 — 伝票は open のまま。再試行できます。"
      );
      setPending(null);
      await loadCheck(check.id);
    }
  }

  const areas = [...new Set(tables.map((t) => t.areaName))];
  const modeLabel = payConfig?.mode ?? "mock";
  const payButtonLabel =
    modeLabel === "mock"
      ? "精算（mock）"
      : payMethod === "card"
        ? "カード決済を開始"
        : payMethod === "paypay"
          ? "PayPay 決済を開始"
          : "精算";

  return (
    <div className={deviceMode === "t1" ? "stack t1-pos" : "stack"}>
      {hwError ? (
        <div className="card" style={{ background: "#fdecea", color: "#c62828" }}>
          ハードウェア: {hwError}
        </div>
      ) : null}
      {msg ? (
        <div className="card" style={{ borderColor: "var(--brand)" }}>
          {msg}
        </div>
      ) : null}

      <div className="card muted" style={{ fontSize: "0.85rem" }}>
        支払いモード: <strong>{modeLabel}</strong>
        {payConfig?.stripe.simulator ? " · Stripe シミュレータ" : null}
        {payConfig?.paypay.simulator ? " · PayPay シミュレータ" : null}
        {payConfig?.stripe.configured ? " · Stripe 接続済" : null}
        {payConfig?.paypay.configured ? " · PayPay 接続済" : null}
      </div>

      <div className="row" style={{ alignItems: "stretch" }}>
        <div className="card stack" style={{ flex: 1.2, minWidth: 280 }}>
          <strong>テーブル</strong>
          {areas.map((area) => (
            <div key={area} className="stack">
              <div className="muted">{area}</div>
              <div className="grid tables">
                {tables
                  .filter((t) => t.areaName === area)
                  .map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="card table-tile"
                      style={{
                        borderColor: selectedTableId === t.id ? "var(--brand)" : undefined,
                        outline: selectedTableId === t.id ? "2px solid var(--brand)" : undefined,
                      }}
                      onClick={() => setSelectedTableId(t.id)}
                    >
                      <div style={{ fontWeight: 700 }}>{t.code}</div>
                      <div className="muted" style={{ fontSize: "0.75rem" }}>
                        {t.status}
                        {t.openCheck ? ` · ¥${t.openCheck.totalYen.toLocaleString()}` : ""}
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>

        <div className="card stack" style={{ flex: 1, minWidth: 280 }}>
          <strong>伝票</strong>
          {!selectedTable ? (
            <div className="muted">テーブルを選択</div>
          ) : !selectedTable.openCheck && !check ? (
            <button className="btn" disabled={busy} onClick={openTable}>
              開台（2名）
            </button>
          ) : !check ? (
            <div className="muted">読込中…</div>
          ) : (
            <div className="stack">
              <div>
                {check.table.code} · {check.status} · ¥{check.totalYen.toLocaleString()}
              </div>
              <table>
                <tbody>
                  {check.items
                    .filter((i) => i.status !== "void")
                    .map((i) => (
                      <tr key={i.id}>
                        <td>
                          {i.name} x{i.qty}
                          <div className="muted" style={{ fontSize: "0.75rem" }}>
                            {i.status}
                            {Array.isArray(i.modifiers) && i.modifiers.length
                              ? " / " + i.modifiers.map((m) => m.name).join(", ")
                              : ""}
                          </div>
                        </td>
                        <td>¥{(i.unitPriceYen * i.qty).toLocaleString()}</td>
                        <td>
                          <button
                            type="button"
                            className="btn ghost"
                            style={{ minHeight: 32, padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                            disabled={busy || !!pending}
                            onClick={() => voidItem(i.id, i.status)}
                          >
                            取消
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {check.exceptionStatus === "flagged" ? (
                <div className="muted" style={{ color: "var(--warn)" }}>
                  異常フラグ中: {check.exceptionNote}
                </div>
              ) : null}
              <div className="row">
                <button className="btn" disabled={busy || !!pending} onClick={fire}>
                  送厨
                </button>
                <button
                  className="btn ghost"
                  disabled={busy || check.exceptionStatus === "flagged"}
                  onClick={flagException}
                >
                  異常フラグ
                </button>
                <select
                  className="input"
                  style={{ width: "auto" }}
                  value={payMethod}
                  disabled={!!pending}
                  onChange={(e) => setPayMethod(e.target.value)}
                >
                  <option value="paypay">PayPay</option>
                  <option value="cash">現金</option>
                  <option value="card">カード</option>
                  {modeLabel === "mock" ? (
                    <>
                      <option value="wechat">WeChat (mock/Q2)</option>
                      <option value="alipay">Alipay (mock/Q2)</option>
                    </>
                  ) : null}
                </select>
                <button
                  className="btn secondary"
                  disabled={busy || check.totalYen <= 0 || !!pending}
                  onClick={pay}
                >
                  {payButtonLabel}
                </button>
                <button className="btn ghost" onClick={makeQr}>
                  QR発行
                </button>
              </div>
              <div className="card stack" style={{ borderColor: "var(--brand)" }}>
                <strong>CRM（会員・クーポン）</strong>
                <div className="row">
                  <select
                    className="input"
                    style={{ width: "auto", minWidth: 160 }}
                    value={payMemberId}
                    onChange={(e) => setPayMemberId(e.target.value)}
                  >
                    <option value="">会員なし（集点なし）</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {(m.displayName ?? m.lineUserId) + ` (${m.points}pt)`}
                      </option>
                    ))}
                  </select>
                  <span className="muted" style={{ fontSize: "0.8rem" }}>
                    精算時に集点（¥100=1pt）
                  </span>
                </div>
                <div className="row">
                  <input
                    className="input"
                    placeholder="クーポンコード"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value)}
                  />
                  <button className="btn secondary" disabled={busy} onClick={redeemCoupon}>
                    核销
                  </button>
                </div>
                {crmMsg ? <div className="muted">{crmMsg}</div> : null}
              </div>

              {qrUrl ? (
                <div className="card" style={{ background: "var(--brand-soft)" }}>
                  <div className="muted">ゲストQR</div>
                  <a href={qrUrl} target="_blank" rel="noreferrer">
                    {qrUrl}
                  </a>
                </div>
              ) : null}

              {pending?.method === "card" && pending.clientSecret ? (
                <StripeCardForm
                  clientSecret={pending.clientSecret}
                  publishableKey={payConfig?.stripe.publishableKey ?? null}
                  checkId={check.id}
                  paymentId={pending.id}
                  amountYen={check.totalYen}
                  simulator={
                    Boolean(payConfig?.stripe.simulator) ||
                    pending.clientSecret.includes("_secret_sim") || pending.clientSecret.includes("secret_sim")
                  }
                  onDone={async (m) => {
                    setMsg(m);
                    setPending(null);
                    setCheck(null);
                    await refreshTables();
                  }}
                  onCancel={async () => {
                    setMsg("カード取消 — 伝票は open のまま。再試行できます。");
                    setPending(null);
                    await loadCheck(check.id);
                  }}
                />
              ) : null}

              {pending?.method === "paypay" ? (
                <div className="card stack" style={{ borderColor: "var(--brand)" }}>
                  <strong>PayPay 支払い（処理中）</strong>
                  <div
                    className="muted"
                    style={{ fontSize: "0.85rem" }}
                  >
                    <span
                      style={{
                        background: "#f39c12",
                        color: "#000",
                        padding: "0.15rem 0.4rem",
                        borderRadius: 4,
                        fontWeight: 700,
                        marginRight: 6,
                      }}
                    >
                      PAYPAY SANDBOX SIMULATOR
                    </span>
                    商戶キー未設定時はシミュレータで API 形状を再現します。
                  </div>
                  {pending.redirectUrl ? (
                    <a href={pending.redirectUrl} target="_blank" rel="noreferrer">
                      シミュレータページを開く
                    </a>
                  ) : null}
                  <div className="row">
                    <button
                      className="btn"
                      disabled={busy}
                      onClick={() => simulatePayPay("succeeded")}
                    >
                      成功
                    </button>
                    <button
                      className="btn ghost"
                      disabled={busy}
                      onClick={() => simulatePayPay("failed")}
                    >
                      失敗（伝票は open のまま）
                    </button>
                    <button
                      className="btn ghost"
                      disabled={busy}
                      onClick={() => simulatePayPay("canceled")}
                    >
                      取消（伝票は open のまま）
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {check ? (
        <div className="card stack">
          <strong>メニュー追加</strong>
          {categories.map((c) => (
            <div key={c.id} className="stack">
              <div style={{ fontWeight: 700 }}>{c.name}</div>
              <div className="row">
                {c.items.map((item) => {
                  return (
                    <button
                      key={item.id}
                      className="btn ghost"
                      disabled={busy || !!pending}
                      onClick={() => addItem(item.id, [])}
                      type="button"
                    >
                      {item.name}
                      <span className="muted">¥{item.priceYen.toLocaleString()}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
