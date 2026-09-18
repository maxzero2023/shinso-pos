import { randomUUID } from "crypto";
import { prisma } from "@shinso/db";
import {
  assertGatewayMethodAllowed,
  createProviderPayment,
  getPaymentMode,
  isImmediateMockMethod,
  markPaymentTerminalFailure,
  settleSuccessfulPayment,
  sumCheckItems,
  type PayInput,
} from "@shinso/api";
import { tryPrintAfterPay } from "@/lib/hardware";

async function resolveMemberIdForPay(opts: {
  storeId: string;
  memberId?: string;
  lineUserId?: string;
}): Promise<string | null> {
  if (opts.memberId) {
    const m = await prisma.member.findFirst({
      where: { id: opts.memberId, storeId: opts.storeId },
    });
    return m?.id ?? null;
  }
  if (opts.lineUserId) {
    const m = await prisma.member.findUnique({
      where: {
        storeId_lineUserId: { storeId: opts.storeId, lineUserId: opts.lineUserId },
      },
    });
    return m?.id ?? null;
  }
  return null;
}


export async function startCheckPayment(opts: {
  checkId: string;
  storeId: string;
  input: PayInput;
}) {
  const mode = getPaymentMode();
  const methodErr = assertGatewayMethodAllowed(opts.input.method, mode);
  if (methodErr) {
    return { ok: false as const, status: 400, error: methodErr };
  }

  const idempotencyKey =
    opts.input.idempotencyKey ??
    `auto_${opts.checkId}_${opts.input.method}_${randomUUID()}`;

  // Idempotent replay must win even if Check is already paid
  const existing = await prisma.payment.findUnique({ where: { idempotencyKey } });
  if (existing) {
    return {
      ok: true as const,
      status: 200,
      data: {
        payment: existing,
        check: await prisma.check.findUnique({ where: { id: existing.checkId } }),
        mode,
        replayed: true,
      },
    };
  }

  const check = await prisma.check.findFirst({
    where: { id: opts.checkId, table: { area: { storeId: opts.storeId } } },
    include: { items: true, payments: { where: { status: "pending" } } },
  });
  if (!check) return { ok: false as const, status: 404, error: "伝票が見つかりません" };
  if (check.status !== "open") {
    return { ok: false as const, status: 409, error: "すでに精算済みです" };
  }

  const total = sumCheckItems(check.items);
  if (opts.input.amountYen !== total) {
    return {
      ok: false as const,
      status: 400,
      error: `金額が一致しません（合計 ${total} 円）`,
      extra: { totalYen: total },
    };
  }

  if (!isImmediateMockMethod(opts.input.method, mode) && check.payments.length > 0) {
    return {
      ok: true as const,
      status: 200,
      data: {
        payment: check.payments[0],
        check,
        mode,
        replayed: true,
        message: "進行中の支払いがあります",
      },
    };
  }

  const memberId = await resolveMemberIdForPay({
    storeId: opts.storeId,
    memberId: opts.input.memberId,
    lineUserId: opts.input.lineUserId,
  });
  if (opts.input.memberId || opts.input.lineUserId) {
    if (!memberId) {
      return { ok: false as const, status: 404, error: "会員が見つかりません" };
    }
    if (check.memberId !== memberId) {
      await prisma.check.update({
        where: { id: check.id },
        data: { memberId },
      });
      // refresh local copy for settle path
      (check as { memberId: string | null }).memberId = memberId;
    }
  }

  const created = await createProviderPayment({
    checkId: check.id,
    method: opts.input.method,
    amountYen: opts.input.amountYen,
    idempotencyKey,
    mode,
    metadata: { storeId: opts.storeId },
  });

  if (created.status === "succeeded") {
    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          checkId: check.id,
          method: opts.input.method,
          amountYen: opts.input.amountYen,
          mock: created.mock,
          status: "succeeded",
          provider: created.provider,
          providerPaymentId: created.providerPaymentId,
          clientSecret: created.clientSecret ?? null,
          idempotencyKey,
          metadata: (created.providerPayload as object | undefined) ?? undefined,
          paidAt: new Date(),
        },
      });
      await settleSuccessfulPayment(tx, payment.id);
      const paid = await tx.check.findUnique({ where: { id: check.id } });
      return { payment, check: paid };
    });
    const print = await tryPrintAfterPay(opts.storeId, check.id);
    return {
      ok: true as const,
      status: 200,
      data: {
        ...result,
        mode,
        clientSecret: null,
        printJob: print?.ok ? print.data.job : null,
        printError:
          print?.ok && print.data.job.status === "failed"
            ? print.data.job.errorMessage
            : null,
      },
    };
  }

  const payment = await prisma.payment.create({
    data: {
      checkId: check.id,
      method: opts.input.method,
      amountYen: opts.input.amountYen,
      mock: created.mock,
      status: "pending",
      provider: created.provider,
      providerPaymentId: created.providerPaymentId,
      clientSecret: created.clientSecret ?? null,
      idempotencyKey,
      metadata: (created.providerPayload as object | undefined) ?? undefined,
      paidAt: null,
    },
  });

  if (
    (opts.input.method === "paypay" ||
      opts.input.method === "wechat" ||
      opts.input.method === "alipay") &&
    opts.input.simulateOutcome &&
    opts.input.simulateOutcome !== "succeeded"
  ) {
    await markPaymentTerminalFailure(
      prisma,
      payment.id,
      opts.input.simulateOutcome,
      `simulate:${opts.input.simulateOutcome}`
    );
    return {
      ok: true as const,
      status: 200,
      data: {
        payment: await prisma.payment.findUnique({ where: { id: payment.id } }),
        check: await prisma.check.findUnique({ where: { id: check.id } }),
        mode,
        redirectUrl: created.redirectUrl,
        message: "失敗/取消シミュレート — 伝票は open のままです",
      },
    };
  }

  return {
    ok: true as const,
    status: 200,
    data: {
      payment,
      check,
      mode,
      clientSecret: created.clientSecret,
      redirectUrl: created.redirectUrl,
      publishableKey:
        created.provider === "stripe"
          ? process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ??
            process.env.STRIPE_PUBLISHABLE_KEY ??
            null
          : null,
      providerPayload: created.providerPayload,
    },
  };
}

export async function recordWebhookEvent(opts: {
  provider: string;
  eventId: string;
  eventType: string;
  paymentId?: string | null;
  payload?: unknown;
}): Promise<{ duplicate: boolean }> {
  try {
    await prisma.paymentWebhookEvent.create({
      data: {
        provider: opts.provider,
        eventId: opts.eventId,
        eventType: opts.eventType,
        paymentId: opts.paymentId ?? null,
        payload: opts.payload as object | undefined,
      },
    });
    return { duplicate: false };
  } catch (e: unknown) {
    if ((e as { code?: string })?.code === "P2002") return { duplicate: true };
    throw e;
  }
}
