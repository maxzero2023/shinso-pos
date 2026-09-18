import { prisma } from "@shinso/db";
import {
  createStripeClient,
  settleSuccessfulPayment,
  markPaymentTerminalFailure,
} from "@shinso/api";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import { tryPrintAfterPay } from "@/lib/hardware";

type Ctx = { params: Promise<{ id: string; paymentId: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;
  const { id, paymentId } = await ctx.params;

  const payment = await prisma.payment.findFirst({
    where: {
      id: paymentId,
      checkId: id,
      check: { table: { area: { storeId: session.storeId } } },
    },
  });
  if (!payment) return error("支払いが見つかりません", 404);

  if (payment.status === "succeeded") {
    const check = await prisma.check.findUnique({ where: { id } });
    return json({ payment, check, alreadySettled: true });
  }

  if (payment.provider === "stripe" && payment.providerPaymentId) {
    if (payment.providerPaymentId.startsWith("pi_sim_")) {
      await prisma.$transaction(async (tx) => settleSuccessfulPayment(tx, payment.id));
      const print = await tryPrintAfterPay(session.storeId, id);
      return json({
        payment: await prisma.payment.findUnique({ where: { id: payment.id } }),
        check: await prisma.check.findUnique({ where: { id } }),
        simulator: true,
        printJob: print?.ok ? print.data.job : null,
        printError:
          print?.ok && print.data.job.status === "failed"
            ? print.data.job.errorMessage
            : null,
      });
    }

    const stripe = createStripeClient();
    if (!stripe) return error("Stripe が未設定です", 500);
    const intent = await stripe.paymentIntents.retrieve(payment.providerPaymentId);

    if (intent.status === "succeeded") {
      await prisma.$transaction(async (tx) => settleSuccessfulPayment(tx, payment.id));
      const print = await tryPrintAfterPay(session.storeId, id);
      return json({
        payment: await prisma.payment.findUnique({ where: { id: payment.id } }),
        check: await prisma.check.findUnique({ where: { id } }),
        printJob: print?.ok ? print.data.job : null,
        printError:
          print?.ok && print.data.job.status === "failed"
            ? print.data.job.errorMessage
            : null,
      });
    } else if (intent.status === "canceled") {
      await markPaymentTerminalFailure(prisma, payment.id, "canceled", "stripe canceled");
    } else {
      return json({
        payment: await prisma.payment.findUnique({ where: { id: payment.id } }),
        check: await prisma.check.findUnique({ where: { id } }),
        stripeStatus: intent.status,
        message: "まだ完了していません",
      });
    }
  }

  if (payment.provider === "paypay") {
    return error("PayPay は webhook / simulate で確定してください", 400);
  }
  if (payment.provider === "wechat") {
    return error("WeChat は webhook / simulate で確定してください", 400);
  }
  if (payment.provider === "alipay") {
    return error("Alipay は webhook / simulate で確定してください", 400);
  }

  return json({
    payment: await prisma.payment.findUnique({ where: { id: payment.id } }),
    check: await prisma.check.findUnique({ where: { id } }),
  });
}
