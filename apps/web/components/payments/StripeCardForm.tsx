"use client";

import { useMemo, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";

type Props = {
  clientSecret: string;
  publishableKey: string | null;
  checkId: string;
  paymentId: string;
  amountYen: number;
  simulator: boolean;
  onDone: (msg: string) => void;
  onCancel: () => void;
};

function CardInner({
  checkId,
  paymentId,
  amountYen,
  simulator,
  onDone,
  onCancel,
}: Omit<Props, "clientSecret" | "publishableKey">) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function confirm() {
    setBusy(true);
    setErr("");

    if (simulator || !stripe || !elements) {
      const res = await fetch(`/api/checks/${checkId}/payments/${paymentId}/confirm`, {
        method: "POST",
      });
      const data = await res.json();
      setBusy(false);
      if (!res.ok) {
        setErr(data.error ?? "確認失敗");
        return;
      }
      onDone(
        data.simulator
          ? "カード精算完了（Stripe シミュレータ）。テーブルが空席になりました。"
          : "カード精算完了。テーブルが空席になりました。"
      );
      return;
    }

    const result = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: { return_url: `${window.location.origin}/pos` },
    });

    if (result.error) {
      setBusy(false);
      setErr(result.error.message ?? "カード決済に失敗しました");
      await fetch(`/api/checks/${checkId}/payments/${paymentId}/cancel`, {
        method: "POST",
      }).catch(() => null);
      return;
    }

    const res = await fetch(`/api/checks/${checkId}/payments/${paymentId}/confirm`, {
      method: "POST",
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setErr(data.error ?? "確認失敗");
      return;
    }
    onDone("カード精算完了。テーブルが空席になりました。");
  }

  async function cancel() {
    setBusy(true);
    await fetch(`/api/checks/${checkId}/payments/${paymentId}/cancel`, { method: "POST" });
    setBusy(false);
    onCancel();
  }

  return (
    <div className="stack card" style={{ borderColor: "var(--brand)" }}>
      <strong>クレジットカード（¥{amountYen.toLocaleString()}）</strong>
      {simulator ? (
        <div className="muted" style={{ fontSize: "0.85rem" }}>
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
            STRIPE SANDBOX SIMULATOR
          </span>
          STRIPE_SECRET_KEY 未設定 — 「確定」で成功をシミュレート。実キーがあれば Elements +
          テストカード 4242… を使用。
        </div>
      ) : (
        <PaymentElement options={{ layout: "tabs" }} />
      )}
      {err ? <div style={{ color: "#c0392b" }}>{err}</div> : null}
      <div className="row">
        <button className="btn" type="button" disabled={busy} onClick={confirm}>
          {busy ? "処理中…" : "カード支払いを確定"}
        </button>
        <button className="btn ghost" type="button" disabled={busy} onClick={cancel}>
          取消（伝票は open のまま）
        </button>
      </div>
    </div>
  );
}

export function StripeCardForm(props: Props) {
  const stripePromise = useMemo<Promise<Stripe | null> | null>(() => {
    if (!props.publishableKey || props.simulator) return null;
    return loadStripe(props.publishableKey);
  }, [props.publishableKey, props.simulator]);

  if (props.simulator || !stripePromise) {
    return (
      <CardInner
        checkId={props.checkId}
        paymentId={props.paymentId}
        amountYen={props.amountYen}
        simulator
        onDone={props.onDone}
        onCancel={props.onCancel}
      />
    );
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{ clientSecret: props.clientSecret, locale: "ja" }}
    >
      <CardInner
        checkId={props.checkId}
        paymentId={props.paymentId}
        amountYen={props.amountYen}
        simulator={false}
        onDone={props.onDone}
        onCancel={props.onCancel}
      />
    </Elements>
  );
}
