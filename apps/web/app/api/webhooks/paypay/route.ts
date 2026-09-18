import { prisma } from "@shinso/db";
import {
  verifyPayPayWebhookSignature,
  settleSuccessfulPayment,
  markPaymentTerminalFailure,
} from "@shinso/api";
import { error, json } from "@/lib/http";
import { recordWebhookEvent } from "@/lib/payments";

export const runtime = "nodejs";

/** PayPay-shaped webhook. Fail/cancel MUST NOT close Check. */
export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-paypay-signature") ?? "";
  const timestamp = req.headers.get("x-paypay-auth-timestamp") ?? "";

  const mode = (process.env.PAYMENT_MODE ?? "mock").toLowerCase();
  const hasSecret = Boolean(process.env.PAYPAY_WEBHOOK_SECRET?.trim());

  if (hasSecret || mode === "live") {
    if (!verifyPayPayWebhookSignature(rawBody, signature, timestamp)) {
      return error("Invalid signature", 400);
    }
  } else {
    console.warn("[paypay webhook] sandbox unsigned/simulator accept");
  }

  let body: {
    notificationId?: string;
    merchantPaymentId?: string;
    state?: string;
    amount?: { amount?: number; currency?: string };
  };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return error("Invalid JSON", 400);
  }

  const eventId =
    body.notificationId ?? `pp_${body.merchantPaymentId}_${body.state}_${Date.now()}`;
  const { duplicate } = await recordWebhookEvent({
    provider: "paypay",
    eventId,
    eventType: body.state ?? "unknown",
    payload: body,
  });
  if (duplicate) return json({ received: true, duplicate: true });

  const payment = body.merchantPaymentId
    ? await prisma.payment.findFirst({
        where: { providerPaymentId: body.merchantPaymentId, provider: "paypay" },
      })
    : null;

  if (payment) {
    await prisma.paymentWebhookEvent.updateMany({
      where: { provider: "paypay", eventId },
      data: { paymentId: payment.id },
    });
  }

  if (!payment) return json({ received: true, paymentId: null });

  const state = (body.state ?? "").toUpperCase();
  if (state === "COMPLETED" || state === "SUCCEEDED") {
    await prisma.$transaction(async (tx) => settleSuccessfulPayment(tx, payment.id));
  } else if (state === "FAILED") {
    await markPaymentTerminalFailure(prisma, payment.id, "failed", "paypay FAILED");
  } else if (state === "CANCELED" || state === "CANCELLED") {
    await markPaymentTerminalFailure(prisma, payment.id, "canceled", "paypay CANCELED");
  }

  const check = await prisma.check.findUnique({ where: { id: payment.checkId } });
  return json({ received: true, paymentId: payment.id, checkStatus: check?.status });
}
