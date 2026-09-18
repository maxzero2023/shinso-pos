import type { PrismaClient } from "@prisma/client";

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends" | "$use"
>;

/**
 * Mark payment succeeded and close Check + free table.
 * Idempotent. If payment already succeeded but Check still open, closes Check.
 * Fail/cancel MUST NOT call this.
 */
export async function settleSuccessfulPayment(
  db: PrismaClient | Tx,
  paymentId: string
): Promise<{ alreadySettled: boolean; checkId: string }> {
  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new Error(`Payment not found: ${paymentId}`);

  const check = await db.check.findUnique({ where: { id: payment.checkId } });
  if (!check) throw new Error(`Check not found: ${payment.checkId}`);

  // Payment already succeeded and check already paid → no-op
  if (payment.status === "succeeded" && check.status === "paid") {
    return { alreadySettled: true, checkId: payment.checkId };
  }

  if (check.status === "paid") {
    if (payment.status !== "succeeded") {
      await db.payment.update({
        where: { id: paymentId },
        data: {
          status: "succeeded",
          paidAt: payment.paidAt ?? new Date(),
          failureReason: null,
        },
      });
    }
    return { alreadySettled: true, checkId: payment.checkId };
  }

  if (check.status !== "open") {
    throw new Error(`Check ${check.id} is ${check.status}, cannot settle`);
  }

  // Close open check (even if payment row was pre-marked succeeded)
  if (payment.status !== "succeeded") {
    await db.payment.update({
      where: { id: paymentId },
      data: { status: "succeeded", paidAt: new Date(), failureReason: null },
    });
  } else if (!payment.paidAt) {
    await db.payment.update({
      where: { id: paymentId },
      data: { paidAt: new Date(), failureReason: null },
    });
  }

  await db.check.update({
    where: { id: check.id },
    data: { status: "paid", closedAt: new Date() },
  });
  await db.table.update({
    where: { id: check.tableId },
    data: { status: "free" },
  });

  return { alreadySettled: false, checkId: payment.checkId };
}

export async function markPaymentTerminalFailure(
  db: PrismaClient | Tx,
  paymentId: string,
  status: "failed" | "canceled",
  reason?: string | null
): Promise<{ checkId: string; checkStillOpen: boolean }> {
  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new Error(`Payment not found: ${paymentId}`);
  if (payment.status === "succeeded") {
    throw new Error("Cannot fail a succeeded payment");
  }

  await db.payment.update({
    where: { id: paymentId },
    data: { status, failureReason: reason ?? null, paidAt: null },
  });

  const check = await db.check.findUnique({ where: { id: payment.checkId } });
  return {
    checkId: payment.checkId,
    checkStillOpen: check?.status === "open",
  };
}
