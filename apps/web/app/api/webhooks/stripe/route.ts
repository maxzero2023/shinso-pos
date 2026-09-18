import { prisma } from "@shinso/db";
import {
  constructStripeEvent,
  settleSuccessfulPayment,
  markPaymentTerminalFailure,
  createStripeClient,
} from "@shinso/api";
import { error, json } from "@/lib/http";
import { tryPrintAfterPay } from "@/lib/hardware";
import { recordWebhookEvent } from "@/lib/payments";

export const runtime = "nodejs";

/** Stripe webhook. Fail/cancel MUST NOT close Check. */
export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");

  let event: { id: string; type: string; data: { object: Record<string, unknown> } };

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (webhookSecret && signature) {
    try {
      event = constructStripeEvent(rawBody, signature) as unknown as typeof event;
    } catch (e) {
      console.error("[stripe webhook] signature failed", e);
      return error("Invalid signature", 400);
    }
  } else if (process.env.PAYMENT_MODE === "sandbox" || process.env.PAYMENT_MODE === "mock") {
    try {
      event = JSON.parse(rawBody);
    } catch {
      return error("Invalid JSON", 400);
    }
    if (!event?.id || !event?.type) return error("Invalid event", 400);
    console.warn("[stripe webhook] accepting UNSIGNED sandbox event", event.id, event.type);
  } else {
    return error("Missing stripe-signature", 400);
  }

  const { duplicate } = await recordWebhookEvent({
    provider: "stripe",
    eventId: event.id,
    eventType: event.type,
    payload: event,
  });
  if (duplicate) return json({ received: true, duplicate: true });

  const obj = event.data?.object ?? {};
  const piId = typeof obj.id === "string" ? obj.id : null;
  const payment = piId
    ? await prisma.payment.findFirst({ where: { providerPaymentId: piId, provider: "stripe" } })
    : null;

  if (payment) {
    await prisma.paymentWebhookEvent.updateMany({
      where: { provider: "stripe", eventId: event.id },
      data: { paymentId: payment.id },
    });
  }

  if (event.type === "payment_intent.succeeded" && payment) {
    await prisma.$transaction(async (tx) => settleSuccessfulPayment(tx, payment.id));
    const checkRow = await prisma.check.findUnique({
      where: { id: payment.checkId },
      include: { table: { include: { area: true } } },
    });
    if (checkRow) await tryPrintAfterPay(checkRow.table.area.storeId, payment.checkId);
  } else if (
    (event.type === "payment_intent.payment_failed" ||
      event.type === "payment_intent.canceled") &&
    payment
  ) {
    const status = event.type === "payment_intent.canceled" ? "canceled" : "failed";
    const reason =
      (obj.last_payment_error as { message?: string } | undefined)?.message ?? event.type;
    await markPaymentTerminalFailure(prisma, payment.id, status, reason);
  } else if (!payment && piId && createStripeClient()) {
    console.warn("[stripe webhook] no local payment for", piId, event.type);
  }

  return json({ received: true, paymentId: payment?.id ?? null });
}
