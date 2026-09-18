import { prisma } from "@shinso/db";
import {
  verifyAlipayWebhookSignature,
  settleSuccessfulPayment,
  markPaymentTerminalFailure,
} from "@shinso/api";
import { error, json } from "@/lib/http";
import { tryPrintAfterPay } from "@/lib/hardware";
import { recordWebhookEvent } from "@/lib/payments";

export const runtime = "nodejs";

/** Alipay-shaped webhook. Fail/cancel MUST NOT close Check. Bad signature → 401. */
export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-alipay-signature") ?? "";
  const timestamp = req.headers.get("x-alipay-timestamp") ?? "";

  if (!verifyAlipayWebhookSignature(rawBody, signature, timestamp)) {
    return error("Invalid signature", 401);
  }

  let body: {
    notificationId?: string;
    out_trade_no?: string;
    trade_status?: string;
    total_amount?: string;
  };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return error("Invalid JSON", 400);
  }

  const eventId =
    body.notificationId ?? `ali_${body.out_trade_no}_${body.trade_status}_${Date.now()}`;
  const { duplicate } = await recordWebhookEvent({
    provider: "alipay",
    eventId,
    eventType: body.trade_status ?? "unknown",
    payload: body,
  });
  if (duplicate) return json({ received: true, duplicate: true });

  const payment = body.out_trade_no
    ? await prisma.payment.findFirst({
        where: { providerPaymentId: body.out_trade_no, provider: "alipay" },
      })
    : null;

  if (payment) {
    await prisma.paymentWebhookEvent.updateMany({
      where: { provider: "alipay", eventId },
      data: { paymentId: payment.id },
    });
  }

  if (!payment) return json({ received: true, paymentId: null });

  const status = (body.trade_status ?? "").toUpperCase();
  if (status === "TRADE_SUCCESS" || status === "TRADE_FINISHED" || status === "SUCCESS") {
    await prisma.$transaction(async (tx) => settleSuccessfulPayment(tx, payment.id));
    const checkRow = await prisma.check.findUnique({
      where: { id: payment.checkId },
      include: { table: { include: { area: true } } },
    });
    if (checkRow) await tryPrintAfterPay(checkRow.table.area.storeId, payment.checkId);
  } else if (status === "TRADE_FAILED" || status === "FAILED") {
    await markPaymentTerminalFailure(prisma, payment.id, "failed", "alipay TRADE_FAILED");
  } else if (status === "TRADE_CLOSED" || status === "CANCELED" || status === "CANCELLED") {
    await markPaymentTerminalFailure(prisma, payment.id, "canceled", "alipay TRADE_CLOSED");
  }

  const check = await prisma.check.findUnique({ where: { id: payment.checkId } });
  return json({ received: true, paymentId: payment.id, checkStatus: check?.status });
}
