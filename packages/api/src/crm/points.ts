import type { PrismaClient } from "@prisma/client";
import { POINTS_YEN_PER_POINT } from "./types";
import { sendLineMessage } from "./messaging";

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends" | "$use"
>;

export function calcPointsFromAmountYen(amountYen: number): number {
  if (!Number.isFinite(amountYen) || amountYen <= 0) return 0;
  return Math.floor(amountYen / POINTS_YEN_PER_POINT);
}

/**
 * Award points for a paid Check. Idempotent via PointAward.checkId unique.
 * No-op if Check has no memberId, is not paid, or already awarded.
 */
export async function tryAwardPointsForPaidCheck(
  db: PrismaClient | Tx,
  checkId: string
): Promise<{
  awarded: boolean;
  skipped: boolean;
  reason?: string;
  points?: number;
  memberId?: string;
}> {
  const check = await db.check.findUnique({
    where: { id: checkId },
    include: {
      payments: { where: { status: "succeeded" }, orderBy: { paidAt: "desc" } },
      table: { include: { area: true } },
    },
  });
  if (!check) return { awarded: false, skipped: true, reason: "check_not_found" };
  if (check.status !== "paid") {
    return { awarded: false, skipped: true, reason: "check_not_paid" };
  }
  if (!check.memberId) {
    return { awarded: false, skipped: true, reason: "no_member" };
  }

  const existing = await db.pointAward.findUnique({ where: { checkId } });
  if (existing) {
    return {
      awarded: false,
      skipped: true,
      reason: "already_awarded",
      points: existing.points,
      memberId: existing.memberId,
    };
  }

  const amountYen =
    check.payments.reduce((s, p) => s + p.amountYen, 0) ||
    // fallback: sum would be 0 if payments missing — use 0 points
    0;
  const points = calcPointsFromAmountYen(amountYen);
  if (points <= 0) {
    return { awarded: false, skipped: true, reason: "zero_points", memberId: check.memberId };
  }

  const storeId = check.table.area.storeId;

  try {
    await db.pointAward.create({
      data: {
        storeId,
        memberId: check.memberId,
        checkId,
        points,
        amountYen,
      },
    });
  } catch (e: unknown) {
    // Concurrent settle — unique on checkId
    if ((e as { code?: string })?.code === "P2002") {
      const again = await db.pointAward.findUnique({ where: { checkId } });
      return {
        awarded: false,
        skipped: true,
        reason: "already_awarded",
        points: again?.points,
        memberId: again?.memberId,
      };
    }
    throw e;
  }

  const member = await db.member.update({
    where: { id: check.memberId },
    data: { points: { increment: points } },
  });

  void sendLineMessage({
    to: member.lineUserId,
    event: "crm.points.awarded",
    message: `${points}ポイント付与されました（残高 ${member.points}pt）`,
    meta: { checkId, points, balance: member.points },
  });

  return { awarded: true, skipped: false, points, memberId: check.memberId };
}
