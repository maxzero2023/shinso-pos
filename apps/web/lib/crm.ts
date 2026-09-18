import { prisma } from "@shinso/db";
import {
  bindLineMember,
  issueCoupon,
  redeemCoupon,
  getLineMode,
  type LineBindInput,
  type CouponIssueInput,
  type CouponRedeemInput,
  type CouponTemplateCreateInput,
  type CouponTemplateUpdateInput,
} from "@shinso/api";

export async function getDefaultStoreId(): Promise<string | null> {
  const store = await prisma.store.findFirst({ orderBy: { createdAt: "asc" } });
  return store?.id ?? null;
}

export async function doLineBind(storeId: string, input: LineBindInput) {
  return bindLineMember(prisma, storeId, input);
}

export async function getMemberMe(storeId: string, lineUserId: string) {
  const member = await prisma.member.findUnique({
    where: { storeId_lineUserId: { storeId, lineUserId } },
    include: {
      coupons: {
        orderBy: { issuedAt: "desc" },
        take: 20,
        include: { template: true },
      },
      pointAwards: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!member) return null;
  return member;
}

export async function listMembers(storeId: string) {
  return prisma.member.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { coupons: true, pointAwards: true } },
    },
  });
}

export async function listCouponTemplates(storeId: string) {
  return prisma.couponTemplate.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { issues: true } } },
  });
}

export async function createCouponTemplate(storeId: string, input: CouponTemplateCreateInput) {
  return prisma.couponTemplate.create({
    data: {
      storeId,
      name: input.name,
      description: input.description ?? null,
      discountYen: input.discountYen,
      pointsCost: input.pointsCost,
      active: input.active ?? true,
    },
  });
}

export async function updateCouponTemplate(
  storeId: string,
  id: string,
  input: CouponTemplateUpdateInput
) {
  const existing = await prisma.couponTemplate.findFirst({ where: { id, storeId } });
  if (!existing) return null;
  return prisma.couponTemplate.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.discountYen !== undefined ? { discountYen: input.discountYen } : {}),
      ...(input.pointsCost !== undefined ? { pointsCost: input.pointsCost } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
  });
}

export async function doIssueCoupon(storeId: string, input: CouponIssueInput) {
  return issueCoupon(prisma, storeId, input);
}

export async function doRedeemCoupon(
  storeId: string,
  input: CouponRedeemInput,
  staffId?: string | null
) {
  return redeemCoupon(prisma, storeId, input, staffId);
}

export function lineConfig() {
  const mode = getLineMode();
  return {
    mode,
    simulator: mode === "simulator",
    messagingStub: true,
    pointsYenPerPoint: 100,
  };
}
