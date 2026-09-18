import { prisma } from "@shinso/db";
import {
  settleSuccessfulPayment,
  markPaymentTerminalFailure,
  signWeChatWebhook,
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
    where: { providerPaymentId: outTradeNo, provider: "wechat" },
    include: { check: { include: { table: true } } },
  });
  if (!payment) return error("Payment not found", 404);

  if (url.searchParams.get("format") === "json") {
    return json({
      label: "WECHAT SANDBOX SIMULATOR",
      payment,
      outcomes: ["succeeded", "failed", "canceled"],
    });
  }

  const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"/><title>WeChat Sandbox Simulator</title>
<style>
body{font-family:system-ui;max-width:480px;margin:2rem auto;padding:1rem}
.btn{display:block;width:100%;margin:.5rem 0;padding:1rem;font-size:1rem;border:0;border-radius:8px;cursor:pointer;color:#fff}
.ok{background:#07C160}.fail{background:#c0392b}.cancel{background:#7f8c8d}
.badge{background:#f39c12;color:#000;padding:.2rem .5rem;border-radius:4px;font-size:.75rem;font-weight:700}
</style></head><body>
<p class="badge">WECHAT SANDBOX SIMULATOR — no merchant keys</p>
<h1>WeChat Pay デモ決済（微信）</h1>
<p>金額: <strong>¥${payment.amountYen.toLocaleString()}</strong></p>
<p>outTradeNo: <code>${payment.providerPaymentId}</code></p>
<p>伝票: ${payment.checkId} / 卓 ${payment.check.table.code}</p>
<p>現状: <strong>${payment.status}</strong></p>
<button class="btn ok" onclick="go('succeeded')">支払い成功（SUCCESS）</button>
<button class="btn fail" onclick="go('failed')">失敗（FAIL）— 伝票は open のまま</button>
<button class="btn cancel" onclick="go('canceled')">取消（CLOSED）— 伝票は open のまま</button>
<pre id="out"></pre>
<script>
async function go(outcome){
  const res = await fetch('/api/payments/wechat/simulate', {
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
      ? { id: paymentId, provider: "wechat" }
      : { providerPaymentId: outTradeNo!, provider: "wechat" },
  });
  if (!payment) return error("Payment not found", 404);
  if (payment.status === "succeeded") {
    return json({ payment, message: "already succeeded" });
  }

  const notificationId = `wx_notif_${payment.id}_${outcome}_${Date.now()}`;
  const tradeState =
    outcome === "succeeded" ? "SUCCESS" : outcome === "failed" ? "PAYERROR" : "CLOSED";
  const payload = JSON.stringify({
    notificationId,
    out_trade_no: payment.providerPaymentId,
    trade_state: tradeState,
    total_fee: payment.amountYen,
    currency: "JPY",
    simulator: true,
    label: "WECHAT SANDBOX SIMULATOR",
  });
  const timestamp = String(Date.now());
  const secret =
    process.env.WECHAT_WEBHOOK_SECRET?.trim() || "wechat-sandbox-simulator-secret";
  const signature = signWeChatWebhook(payload, secret, timestamp);

  const webhookUrl = `${getAppUrl()}/api/webhooks/wechat`;
  const whRes = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-wechat-signature": signature,
      "x-wechat-timestamp": timestamp,
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
    label: "WECHAT SANDBOX SIMULATOR",
    payment: updated,
    check,
    webhook: { status: whRes.status, body: whData },
    checkStillOpen: check?.status === "open",
  });
}
