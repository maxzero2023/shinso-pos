import { prisma } from "@shinso/db";
import {
  ensureDefaultMarketingRules,
  updateMarketingRule,
  runMarketingRules,
  RULE_TYPE_LABEL_JA,
  type MarketingRuleUpdateInput,
  type MarketingRunInput,
  type SendLineFn,
} from "@shinso/api";

export { RULE_TYPE_LABEL_JA };

export async function listMarketingRules(storeId: string) {
  await ensureDefaultMarketingRules(prisma, storeId);
  return prisma.marketingRule.findMany({
    where: { storeId },
    orderBy: { type: "asc" },
  });
}

export async function patchMarketingRule(
  storeId: string,
  ruleId: string,
  input: MarketingRuleUpdateInput
) {
  return updateMarketingRule(prisma, storeId, ruleId, input);
}

export async function listMarketingSendLogs(storeId: string, limit = 50) {
  return prisma.marketingSendLog.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 200),
    include: {
      rule: { select: { id: true, type: true } },
      member: { select: { id: true, displayName: true, lineUserId: true } },
    },
  });
}

export async function doMarketingRun(
  storeId: string,
  input: MarketingRunInput,
  opts?: { asOf?: Date; sendFn?: SendLineFn }
) {
  await ensureDefaultMarketingRules(prisma, storeId);
  return runMarketingRules(prisma, storeId, {
    ruleId: input.ruleId,
    asOf: opts?.asOf,
    sendFn: opts?.sendFn,
  });
}
