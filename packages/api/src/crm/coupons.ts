import { randomBytes } from "crypto";
import type { PrismaClient } from "@prisma/client";
import { sendLineMessage } from "./messaging";
import type { CouponIssueInput, CouponRedeemInput } from "./types";

function genCouponCode(): string {
  return `CP${randomBytes(4).toString("hex").toUpperCase()}`;
}

export async function issueCoupon(
  db: PrismaClient,
  storeId: string,
  input: CouponIssueInput
) {
  const template = await db.couponTemplate.findFirst({
    where: { id: input.templateId, storeId, active: true },
  });
  if (!template) {
    return { ok: false as const, status: 404, error: "券テンプレートが見つかりません" };
  }

  const member = await db.member.findFirst({
    where: { id: input.memberId, storeId },
  });
  if (!member) {
    return { ok: false as const, status: 404, error: "会員が見つかりません" };
  }

  if (template.pointsCost > 0 && member.points < template.pointsCost) {
    return {
      ok: false as const,
      status: 400,
      error: `ポイント不足（必要 ${template.pointsCost} / 残高 ${member.points}）`,
    };
  }

  const code = genCouponCode();

  const issue = await db.$transaction(async (tx) => {
    if (template.pointsCost > 0) {
      await tx.member.update({
        where: { id: member.id },
        data: { points: { decrement: template.pointsCost } },
      });
    }
    return tx.couponIssue.create({
      data: {
        storeId,
        templateId: template.id,
        memberId: member.id,
        code,
        status: "issued",
      },
      include: { template: true, member: true },
    });
  });

  await sendLineMessage({
    to: member.lineUserId,
    event: "crm.coupon.issued",
    message: `クーポン「${template.name}」を発行しました。コード: ${code}`,
    meta: { couponIssueId: issue.id, code, discountYen: template.discountYen },
  });

  return { ok: true as const, status: 201, data: { coupon: issue } };
}

/**
 * Redeem coupon by code. Already-redeemed → 409 (不可再核销).
 * Concurrent double-redeem: one wins via conditional update.
 */
export async function redeemCoupon(
  db: PrismaClient,
  storeId: string,
  input: CouponRedeemInput,
  staffId?: string | null
) {
  const code = input.code.trim().toUpperCase();
  const coupon = await db.couponIssue.findFirst({
    where: { storeId, code },
    include: { template: true, member: true },
  });
  if (!coupon) {
    return { ok: false as const, status: 404, error: "クーポンが見つかりません" };
  }
  if (coupon.status === "redeemed") {
    return {
      ok: false as const,
      status: 409,
      error: "すでに核销済みです",
      extra: {
        coupon: {
          id: coupon.id,
          code: coupon.code,
          status: coupon.status,
          redeemedAt: coupon.redeemedAt,
        },
      },
    };
  }

  if (input.checkId) {
    const check = await db.check.findFirst({
      where: { id: input.checkId, table: { area: { storeId } } },
    });
    if (!check) {
      return { ok: false as const, status: 404, error: "伝票が見つかりません" };
    }
  }

  const updated = await db.couponIssue.updateMany({
    where: { id: coupon.id, status: "issued" },
    data: {
      status: "redeemed",
      redeemedAt: new Date(),
      redeemedByStaffId: staffId ?? null,
      checkId: input.checkId ?? null,
    },
  });

  if (updated.count === 0) {
    const again = await db.couponIssue.findUnique({ where: { id: coupon.id } });
    return {
      ok: false as const,
      status: 409,
      error: "すでに核销済みです",
      extra: { coupon: again },
    };
  }

  const redeemed = await db.couponIssue.findUnique({
    where: { id: coupon.id },
    include: { template: true, member: true },
  });

  if (redeemed?.member) {
    await sendLineMessage({
      to: redeemed.member.lineUserId,
      event: "crm.coupon.redeemed",
      message: `クーポン「${redeemed.template.name}」を核销しました`,
      meta: { couponIssueId: redeemed.id, code: redeemed.code },
    });
  }

  return { ok: true as const, status: 200, data: { coupon: redeemed } };
}
