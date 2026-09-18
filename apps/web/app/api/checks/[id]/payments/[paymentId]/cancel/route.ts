import { prisma } from "@shinso/db";
import {
  createStripeGateway,
  createPayPayGateway,
  createWeChatGateway,
  createAlipayGateway,
  markPaymentTerminalFailure,
} from "@shinso/api";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";

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
  if (payment.status === "succeeded") return error("成功済みの支払いは取消できません", 409);
  if (payment.status === "canceled" || payment.status === "failed") {
    const check = await prisma.check.findUnique({ where: { id } });
    return json({ payment, check, checkStillOpen: check?.status === "open" });
  }

  if (payment.provider === "stripe" && payment.providerPaymentId) {
    await createStripeGateway().cancelPayment?.(payment.providerPaymentId);
  }
  if (payment.provider === "paypay" && payment.providerPaymentId) {
    await createPayPayGateway().cancelPayment?.(payment.providerPaymentId);
  }
  if (payment.provider === "wechat" && payment.providerPaymentId) {
    await createWeChatGateway().cancelPayment?.(payment.providerPaymentId);
  }
  if (payment.provider === "alipay" && payment.providerPaymentId) {
    await createAlipayGateway().cancelPayment?.(payment.providerPaymentId);
  }

  const result = await markPaymentTerminalFailure(
    prisma,
    payment.id,
    "canceled",
    "user canceled"
  );
  return json({
    payment: await prisma.payment.findUnique({ where: { id: payment.id } }),
    check: await prisma.check.findUnique({ where: { id } }),
    ...result,
  });
}
