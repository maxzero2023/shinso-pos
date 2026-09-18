import { prisma } from "@shinso/db";
import {
  verifyWeChatWebhookSignature,
  settleSuccessfulPayment,
  markPaymentTerminalFailure,
} from "@shinso/api";
import { error, json } from "@/lib/http";
import { tryPrintAfterPay } from "@/lib/hardware";
import { recordWebhookEvent } from "@/lib/payments";

export const runtime = "nodejs";

/** WeChat-shaped webhook. Fail/cancel MUST NOT close Check. Bad signature → 401. */
export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-wechat-signature") ?? "";
  const timestamp = req.headers.get("x-wechat-timestamp") ?? "";

  if (!verifyWeChatWebhookSignature(rawBody, signature, timestamp)) {
    return error("Invalid signature", 401);
  }

  let body: {
    notificationId?: string;
    out_trade_no?: string;
    trade_state?: string;
    total_fee?: number;
  };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return error("Invalid JSON", 400);
  }

  const eventId =
    body.notificationId ?? `wx_${body.out_trade_no}_${body.trade_state}_${Date.now()}`;
  const { duplicate } = await recordWebhookEvent({
    provider: "wechat",
    eventId,
    eventType: body.trade_state ?? "unknown",
    payload: body,
  });
  if (duplicate) return json({ received: true, duplicate: true });

  const payment = body.out_trade_no
    ? await prisma.payment.findFirst({
        where: { providerPaymentId: body.out_trade_no, provider: "wechat" },
      })
    : null;

  if (payment) {
    await prisma.paymentWebhookEvent.updateMany({
      where: { provider: "wechat", eventId },
      data: { paymentId: payment.id },
    });
  }

  if (!payment) return json({ received: true, paymentId: null });

  const state = (body.trade_state ?? "").toUpperCase();
  if (state === "SUCCESS" || state === "SUCCEEDED") {
    await prisma.$transaction(async (tx) => settleSuccessfulPayment(tx, payment.id));
    const checkRow = await prisma.check.findUnique({
      where: { id: payment.checkId },
      include: { table: { include: { area: true } } },
    });
    if (checkRow) await tryPrintAfterPay(checkRow.table.area.storeId, payment.checkId);
  } else if (state === "PAYERROR" || state === "FAILED") {
    await markPaymentTerminalFailure(prisma, payment.id, "failed", "wechat PAYERROR");
  } else if (state === "CLOSED" || state === "CANCELED" || state === "CANCELLED" || state === "REVOKED") {
    await markPaymentTerminalFailure(prisma, payment.id, "canceled", "wechat CLOSED");
  }

  const check = await prisma.check.findUnique({ where: { id: payment.checkId } });
  return json({ received: true, paymentId: payment.id, checkStatus: check?.status });
}
