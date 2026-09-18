import { prisma } from "@shinso/db";
import {
  settleSuccessfulPayment,
  markPaymentTerminalFailure,
  signAlipayWebhook,
  getPaymentMode,
} from "@shinso/api";
import { error, json } from "@/lib/http";
import { tryPrintAfterPay } from "@/lib/hardware";
import { getAppUrl } from "@/lib/env";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const outTradeNo = url.searchParams.get("outTradeNo");
  if (!outTradeNo) return error("outTradeNo required", 400);

  const payment = await prisma.payment.findFirst({
    where: { providerPaymentId: outTradeNo, provider: "alipay" },
    include: { check: { include: { table: true } } },
  });
  if (!payment) return error("Payment not found", 404);

  if (url.searchParams.get("format") === "json") {
    return json({
      label: "ALIPAY SANDBOX SIMULATOR",
      payment,
      outcomes: ["succeeded", "failed", "canceled"],
    });
  }

  const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"/><title>Alipay Sandbox Simulator</title>
<style>
body{font-family:system-ui;max-width:480px;margin:2rem auto;padding:1rem}
.btn{display:block;width:100%;margin:.5rem 0;padding:1rem;font-size:1rem;border:0;border-radius:8px;cursor:pointer;color:#fff}
.ok{background:#1677FF}.fail{background:#c0392b}.cancel{background:#7f8c8d}
.badge{background:#f39c12;color:#000;padding:.2rem .5rem;border-radius:4px;font-size:.75rem;font-weight:700}
</style></head><body>
<p class="badge">ALIPAY SANDBOX SIMULATOR — no merchant keys</p>
<h1>Alipay デモ決済（支付宝）</h1>
<p>金額: <strong>¥${payment.amountYen.toLocaleString()}</strong></p>
<p>outTradeNo: <code>${payment.providerPaymentId}</code></p>
<p>伝票: ${payment.checkId} / 卓 ${payment.check.table.code}</p>
<p>現状: <strong>${payment.status}</strong></p>
<button class="btn ok" onclick="go('succeeded')">支払い成功（TRADE_SUCCESS）</button>
<button class="btn fail" onclick="go('failed')">失敗 — 伝票は open のまま</button>
<button class="btn cancel" onclick="go('canceled')">取消（TRADE_CLOSED）— 伝票は open のまま</button>
<pre id="out"></pre>
<script>
async function go(outcome){
  const res = await fetch('/api/payments/alipay/simulate', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ outTradeNo: ${JSON.stringify(outTradeNo)}, outcome })
  });
  const data = await res.json();
  document.getElementById('out').textContent = JSON.stringify(data,null,2);
}
</script>
</body></html>`;

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function POST(req: Request) {
  const mode = getPaymentMode();
  if (mode === "live") return error("simulate は live では使えません", 403);

  const body = await req.json().catch(() => null);
  const outTradeNo = body?.outTradeNo as string | undefined;
  const paymentId = body?.paymentId as string | undefined;
  const outcome = body?.outcome as "succeeded" | "failed" | "canceled" | undefined;
  if (!outcome || (!outTradeNo && !paymentId)) {
    return error("outTradeNo/paymentId と outcome が必要です", 400);
  }

  const payment = await prisma.payment.findFirst({
    where: paymentId
      ? { id: paymentId, provider: "alipay" }
      : { providerPaymentId: outTradeNo!, provider: "alipay" },
  });
  if (!payment) return error("Payment not found", 404);
  if (payment.status === "succeeded") {
    return json({ payment, message: "already succeeded" });
  }

  const notificationId = `ali_notif_${payment.id}_${outcome}_${Date.now()}`;
  const tradeStatus =
    outcome === "succeeded"
      ? "TRADE_SUCCESS"
      : outcome === "failed"
        ? "TRADE_FAILED"
        : "TRADE_CLOSED";
  const payload = JSON.stringify({
    notificationId,
    out_trade_no: payment.providerPaymentId,
    trade_status: tradeStatus,
    total_amount: String(payment.amountYen),
    currency: "JPY",
    simulator: true,
    label: "ALIPAY SANDBOX SIMULATOR",
  });
  const timestamp = String(Date.now());
  const secret =
    process.env.ALIPAY_WEBHOOK_SECRET?.trim() || "alipay-sandbox-simulator-secret";
  const signature = signAlipayWebhook(payload, secret, timestamp);

  const webhookUrl = `${getAppUrl()}/api/webhooks/alipay`;
  const whRes = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-alipay-signature": signature,
      "x-alipay-timestamp": timestamp,
    },
    body: payload,
  });
  const whData = await whRes.json().catch(() => ({}));

  if (!whRes.ok) {
    if (outcome === "succeeded") {
      await prisma.$transaction(async (tx) => settleSuccessfulPayment(tx, payment.id));
      const checkRow = await prisma.check.findUnique({
        where: { id: payment.checkId },
        include: { table: { include: { area: true } } },
      });
      if (checkRow) await tryPrintAfterPay(checkRow.table.area.storeId, payment.checkId);
    } else {
      await markPaymentTerminalFailure(prisma, payment.id, outcome, `simulate:${outcome}`);
    }
  }

  const updated = await prisma.payment.findUnique({ where: { id: payment.id } });
  const check = await prisma.check.findUnique({ where: { id: payment.checkId } });
  return json({
    label: "ALIPAY SANDBOX SIMULATOR",
    payment: updated,
    check,
    webhook: { status: whRes.status, body: whData },
    checkStillOpen: check?.status === "open",
  });
}
