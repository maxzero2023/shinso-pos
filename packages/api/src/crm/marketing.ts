import type { PrismaClient, MarketingRule, Member, MarketingRuleType, Prisma } from "@prisma/client";
import { z } from "zod";
import { sendLineMessage, type LineMessageResult } from "./messaging";

export const MARKETING_RULE_TYPES = ["sleep_recall", "coupon_nudge", "welcome"] as const;
export type MarketingRuleTypeName = (typeof MARKETING_RULE_TYPES)[number];

export const marketingRuleTypeSchema = z.enum(MARKETING_RULE_TYPES);

export const marketingRuleUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  frequencyDays: z.number().int().min(0).max(365).optional(),
  params: z.record(z.unknown()).optional(),
});
export type MarketingRuleUpdateInput = z.infer<typeof marketingRuleUpdateSchema>;

export const marketingRunSchema = z.object({
  /** If omitted, run all enabled rules for the store. */
  ruleId: z.string().min(1).optional(),
});
export type MarketingRunInput = z.infer<typeof marketingRunSchema>;

export type SleepRecallParams = {
  inactiveDays?: number;
  message?: string;
};

export type CouponNudgeParams = {
  /** Match if points <= this (default 20). */
  lowPointsThreshold?: number;
  /** Also match members with unused issued coupons (default true). */
  requireUnusedCoupon?: boolean;
  message?: string;
};

export type WelcomeParams = {
  /** Members created within this many days (default 3). */
  welcomeWithinDays?: number;
  message?: string;
};

export const DEFAULT_RULE_PARAMS: Record<
  MarketingRuleTypeName,
  Record<string, unknown>
> = {
  sleep_recall: { inactiveDays: 30, message: "" },
  coupon_nudge: { lowPointsThreshold: 20, requireUnusedCoupon: true, message: "" },
  welcome: { welcomeWithinDays: 3, message: "" },
};

export const DEFAULT_FREQUENCY_DAYS: Record<MarketingRuleTypeName, number> = {
  sleep_recall: 14,
  coupon_nudge: 7,
  welcome: 30,
};

export const RULE_TYPE_LABEL_JA: Record<MarketingRuleTypeName, string> = {
  sleep_recall: "休眠会員の再来店リコール",
  coupon_nudge: "クーポン／ポイント促し",
  welcome: "新規会員ウェルカム",
};

function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

function numParam(params: Record<string, unknown>, key: string, fallback: number): number {
  const v = params[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function strParam(params: Record<string, unknown>, key: string, fallback: string): string {
  const v = params[key];
  return typeof v === "string" ? v : fallback;
}

function boolParam(params: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const v = params[key];
  return typeof v === "boolean" ? v : fallback;
}

/** Last visit/order time for a member: max(closedAt of paid checks, PointAward.createdAt). */
export async function memberLastActivityAt(
  db: PrismaClient,
  memberId: string
): Promise<Date | null> {
  const [check, award] = await Promise.all([
    db.check.findFirst({
      where: { memberId, status: "paid" },
      orderBy: { closedAt: "desc" },
      select: { closedAt: true, openedAt: true },
    }),
    db.pointAward.findFirst({
      where: { memberId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);
  const times: Date[] = [];
  if (check?.closedAt) times.push(check.closedAt);
  else if (check?.openedAt) times.push(check.openedAt);
  if (award?.createdAt) times.push(award.createdAt);
  if (times.length === 0) return null;
  return new Date(Math.max(...times.map((t) => t.getTime())));
}

export function buildSleepRecallMessage(
  member: Pick<Member, "displayName">,
  inactiveDays: number,
  custom?: string
): string {
  if (custom && custom.trim()) return custom.trim();
  const name = member.displayName?.trim() || "会員様";
  return (
    `【SHINSO】${name}さま、お久しぶりです。` +
    `約${inactiveDays}日ご来店がございません。` +
    `ぜひまたお待ちしております。ご予約・クーポンは店舗まで。`
  );
}

export function buildCouponNudgeMessage(
  member: Pick<Member, "displayName" | "points">,
  unusedCount: number,
  custom?: string
): string {
  if (custom && custom.trim()) return custom.trim();
  const name = member.displayName?.trim() || "会員様";
  const parts: string[] = [`【SHINSO】${name}さま、`];
  if (unusedCount > 0) {
    parts.push(`未使用クーポンが${unusedCount}枚あります。`);
  }
  parts.push(`ポイント残高は${member.points}ptです。次回のご来店をお待ちしています。`);
  return parts.join("");
}

export function buildWelcomeMessage(
  member: Pick<Member, "displayName">,
  custom?: string
): string {
  if (custom && custom.trim()) return custom.trim();
  const name = member.displayName?.trim() || "会員様";
  return (
    `【SHINSO】${name}さま、ご登録ありがとうございます！` +
    `LINE会員特典・クーポンをご利用ください。またのご来店をお待ちしております。`
  );
}

export type MemberMatch = {
  member: Member;
  reason: string;
  message: string;
};

async function matchSleepRecall(
  db: PrismaClient,
  storeId: string,
  rule: MarketingRule,
  asOf: Date
): Promise<MemberMatch[]> {
  const params = asRecord(rule.params);
  const inactiveDays = numParam(params, "inactiveDays", 30);
  const customMsg = strParam(params, "message", "");
  const cutoff = new Date(asOf.getTime() - inactiveDays * 24 * 60 * 60 * 1000);

  const members = await db.member.findMany({
    where: { storeId, marketingOptIn: true },
  });

  const matches: MemberMatch[] = [];
  for (const m of members) {
    const last = await memberLastActivityAt(db, m.id);
    if (last !== null && last >= cutoff) continue;
    matches.push({
      member: m,
      reason: last
        ? `inactive_since_${last.toISOString().slice(0, 10)}`
        : "never_visited",
      message: buildSleepRecallMessage(m, inactiveDays, customMsg),
    });
  }
  return matches;
}

async function matchCouponNudge(
  db: PrismaClient,
  storeId: string,
  rule: MarketingRule
): Promise<MemberMatch[]> {
  const params = asRecord(rule.params);
  const lowPoints = numParam(params, "lowPointsThreshold", 20);
  const useCoupon = boolParam(params, "requireUnusedCoupon", true);
  const customMsg = strParam(params, "message", "");

  const members = await db.member.findMany({
    where: { storeId, marketingOptIn: true },
    include: {
      coupons: { where: { status: "issued" }, select: { id: true } },
    },
  });

  const matches: MemberMatch[] = [];
  for (const m of members) {
    const unused = m.coupons.length;
    const lowPts = m.points <= lowPoints;
    const hasCoupon = useCoupon && unused > 0;
    if (!lowPts && !hasCoupon) continue;
    const reasons: string[] = [];
    if (hasCoupon) reasons.push(`unused_coupons_${unused}`);
    if (lowPts) reasons.push(`points_${m.points}_lte_${lowPoints}`);
    matches.push({
      member: m,
      reason: reasons.join("|"),
      message: buildCouponNudgeMessage(m, unused, customMsg),
    });
  }
  return matches;
}

async function matchWelcome(
  db: PrismaClient,
  storeId: string,
  rule: MarketingRule,
  asOf: Date
): Promise<MemberMatch[]> {
  const params = asRecord(rule.params);
  const withinDays = numParam(params, "welcomeWithinDays", 3);
  const customMsg = strParam(params, "message", "");
  const cutoff = new Date(asOf.getTime() - withinDays * 24 * 60 * 60 * 1000);

  const members = await db.member.findMany({
    where: {
      storeId,
      marketingOptIn: true,
      createdAt: { gte: cutoff },
    },
  });

  return members.map((m) => ({
    member: m,
    reason: `created_within_${withinDays}d`,
    message: buildWelcomeMessage(m, customMsg),
  }));
}

export async function findMatchingMembers(
  db: PrismaClient,
  storeId: string,
  rule: MarketingRule,
  asOf: Date = new Date()
): Promise<MemberMatch[]> {
  switch (rule.type as MarketingRuleType) {
    case "sleep_recall":
      return matchSleepRecall(db, storeId, rule, asOf);
    case "coupon_nudge":
      return matchCouponNudge(db, storeId, rule);
    case "welcome":
      return matchWelcome(db, storeId, rule, asOf);
    default:
      return [];
  }
}

/** True if a successful send exists for rule+member within frequencyDays. */
export async function wasSentWithinFrequency(
  db: PrismaClient,
  ruleId: string,
  memberId: string,
  frequencyDays: number,
  asOf: Date = new Date()
): Promise<boolean> {
  if (frequencyDays <= 0) return false;
  const since = new Date(asOf.getTime() - frequencyDays * 24 * 60 * 60 * 1000);
  const prev = await db.marketingSendLog.findFirst({
    where: {
      ruleId,
      memberId,
      status: "sent",
      createdAt: { gte: since },
    },
    select: { id: true },
  });
  return !!prev;
}

export type MarketingMemberResult = {
  memberId: string;
  lineUserId: string;
  displayName: string | null;
  status: "sent" | "skipped_freq" | "skipped_opt_out" | "failed";
  logId: string;
  reason?: string;
};

export type MarketingRuleRunResult = {
  ruleId: string;
  type: MarketingRuleTypeName;
  enabled: boolean;
  status: "ran" | "skipped_disabled";
  sent: number;
  skippedFreq: number;
  skippedOptOut: number;
  failed: number;
  matched: number;
  results: MarketingMemberResult[];
  logId?: string;
};

export type MarketingRunSummary = {
  storeId: string;
  rules: MarketingRuleRunResult[];
  totals: {
    sent: number;
    skippedFreq: number;
    skippedOptOut: number;
    failed: number;
    matched: number;
  };
};

/**
 * Run one or all marketing rules for a store.
 * Only LINE-bound members (all Member rows) with marketingOptIn; disabled rule → skip.
 * Frequency cap: same rule+member within frequencyDays → skipped_freq.
 */
export async function runMarketingRules(
  db: PrismaClient,
  storeId: string,
  opts?: {
    ruleId?: string;
    asOf?: Date;
    sendFn?: typeof sendLineMessage;
  }
): Promise<MarketingRunSummary> {
  const asOf = opts?.asOf ?? new Date();
  const sendFn = opts?.sendFn ?? sendLineMessage;

  const where = opts?.ruleId
    ? { id: opts.ruleId, storeId }
    : { storeId };

  const rules = await db.marketingRule.findMany({
    where,
    orderBy: { type: "asc" },
  });

  const ruleResults: MarketingRuleRunResult[] = [];

  for (const rule of rules) {
    if (!rule.enabled) {
      const log = await db.marketingSendLog.create({
        data: {
          storeId,
          ruleId: rule.id,
          status: "skipped_disabled",
          messageText: "",
          errorMessage: "disabled",
          meta: { type: rule.type },
        },
      });
      ruleResults.push({
        ruleId: rule.id,
        type: rule.type as MarketingRuleTypeName,
        enabled: false,
        status: "skipped_disabled",
        sent: 0,
        skippedFreq: 0,
        skippedOptOut: 0,
        failed: 0,
        matched: 0,
        results: [],
        logId: log.id,
      });
      continue;
    }

    const matches = await findMatchingMembers(db, storeId, rule, asOf);
    const memberResults: MarketingMemberResult[] = [];
    let sent = 0;
    let skippedFreq = 0;
    let skippedOptOut = 0;
    let failed = 0;

    for (const match of matches) {
      const m = match.member;
      if (!m.marketingOptIn) {
        const log = await db.marketingSendLog.create({
          data: {
            storeId,
            ruleId: rule.id,
            memberId: m.id,
            status: "skipped_opt_out",
            messageText: "",
            errorMessage: "opt_out",
            meta: { reason: match.reason },
          },
        });
        skippedOptOut += 1;
        memberResults.push({
          memberId: m.id,
          lineUserId: m.lineUserId,
          displayName: m.displayName,
          status: "skipped_opt_out",
          logId: log.id,
          reason: "opt_out",
        });
        continue;
      }

      const freqHit = await wasSentWithinFrequency(
        db,
        rule.id,
        m.id,
        rule.frequencyDays,
        asOf
      );
      if (freqHit) {
        const log = await db.marketingSendLog.create({
          data: {
            storeId,
            ruleId: rule.id,
            memberId: m.id,
            status: "skipped_freq",
            messageText: match.message,
            errorMessage: "skipped_freq",
            meta: { reason: match.reason, frequencyDays: rule.frequencyDays },
          },
        });
        skippedFreq += 1;
        memberResults.push({
          memberId: m.id,
          lineUserId: m.lineUserId,
          displayName: m.displayName,
          status: "skipped_freq",
          logId: log.id,
          reason: "skipped_freq",
        });
        continue;
      }

      let lineResult: LineMessageResult | null = null;
      try {
        lineResult = await sendFn({
          to: m.lineUserId,
          message: match.message,
          event: `marketing:${rule.type}`,
          meta: {
            storeId,
            ruleId: rule.id,
            memberId: m.id,
            reason: match.reason,
          },
        });
        const log = await db.marketingSendLog.create({
          data: {
            storeId,
            ruleId: rule.id,
            memberId: m.id,
            status: "sent",
            messageText: match.message,
            sentAt: new Date(),
            meta: {
              reason: match.reason,
              line: { mode: lineResult.mode, stub: lineResult.stub },
            },
          },
        });
        sent += 1;
        memberResults.push({
          memberId: m.id,
          lineUserId: m.lineUserId,
          displayName: m.displayName,
          status: "sent",
          logId: log.id,
          reason: match.reason,
        });
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        const log = await db.marketingSendLog.create({
          data: {
            storeId,
            ruleId: rule.id,
            memberId: m.id,
            status: "failed",
            messageText: match.message,
            errorMessage: errMsg,
            meta: { reason: match.reason },
          },
        });
        failed += 1;
        memberResults.push({
          memberId: m.id,
          lineUserId: m.lineUserId,
          displayName: m.displayName,
          status: "failed",
          logId: log.id,
          reason: errMsg,
        });
      }
    }

    ruleResults.push({
      ruleId: rule.id,
      type: rule.type as MarketingRuleTypeName,
      enabled: true,
      status: "ran",
      sent,
      skippedFreq,
      skippedOptOut,
      failed,
      matched: matches.length,
      results: memberResults,
    });
  }

  const totals = ruleResults.reduce(
    (acc, r) => ({
      sent: acc.sent + r.sent,
      skippedFreq: acc.skippedFreq + r.skippedFreq,
      skippedOptOut: acc.skippedOptOut + r.skippedOptOut,
      failed: acc.failed + r.failed,
      matched: acc.matched + r.matched,
    }),
    { sent: 0, skippedFreq: 0, skippedOptOut: 0, failed: 0, matched: 0 }
  );

  return { storeId, rules: ruleResults, totals };
}

/** Ensure the 3 preset rules exist for a store (idempotent). */
export async function ensureDefaultMarketingRules(
  db: PrismaClient,
  storeId: string
): Promise<MarketingRule[]> {
  const out: MarketingRule[] = [];
  for (const type of MARKETING_RULE_TYPES) {
    const existing = await db.marketingRule.findUnique({
      where: { storeId_type: { storeId, type } },
    });
    if (existing) {
      out.push(existing);
      continue;
    }
    const created = await db.marketingRule.create({
      data: {
        storeId,
        type,
        enabled: type === "sleep_recall" || type === "coupon_nudge",
        params: DEFAULT_RULE_PARAMS[type] as Prisma.InputJsonValue,
        frequencyDays: DEFAULT_FREQUENCY_DAYS[type],
      },
    });
    out.push(created);
  }
  return out;
}

export async function updateMarketingRule(
  db: PrismaClient,
  storeId: string,
  ruleId: string,
  input: MarketingRuleUpdateInput
): Promise<MarketingRule | null> {
  const existing = await db.marketingRule.findFirst({
    where: { id: ruleId, storeId },
  });
  if (!existing) return null;
  const data: Prisma.MarketingRuleUpdateInput = {};
  if (input.enabled !== undefined) data.enabled = input.enabled;
  if (input.frequencyDays !== undefined) data.frequencyDays = input.frequencyDays;
  if (input.params !== undefined) {
    data.params = {
      ...asRecord(existing.params),
      ...input.params,
    } as Prisma.InputJsonValue;
  }
  return db.marketingRule.update({
    where: { id: ruleId },
    data,
  });
}
