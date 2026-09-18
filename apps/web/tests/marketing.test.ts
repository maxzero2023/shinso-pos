import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@shinso/db";
import {
  runMarketingRules,
  findMatchingMembers,
  ensureDefaultMarketingRules,
  RULE_TYPE_LABEL_JA,
} from "@shinso/api";

const BASE = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000";

async function login(email: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "demo1234" }),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const cookie =
    setCookie.map((c) => c.split(";")[0]).join("; ") ||
    (res.headers.get("set-cookie") ?? "")
      .split(",")
      .map((c) => c.split(";")[0].trim())
      .join("; ");
  expect(res.status).toBe(200);
  return cookie;
}

describe("AUT-44 marketing unit", () => {
  it("exposes JP labels for 3 rule types", () => {
    expect(RULE_TYPE_LABEL_JA.sleep_recall).toMatch(/休眠|リコール/);
    expect(RULE_TYPE_LABEL_JA.coupon_nudge).toMatch(/クーポン|ポイント/);
    expect(RULE_TYPE_LABEL_JA.welcome).toMatch(/ウェルカム|新規/);
  });
});

describe("AUT-44 marketing automation", () => {
  let cookie = "";
  let storeId = "";
  let sleepRuleId = "";
  let sleepingId = "";
  let optOutId = "";

  beforeAll(async () => {
    cookie = await login("owner@shinso.demo");
    const store = await prisma.store.findFirst({ orderBy: { createdAt: "asc" } });
    expect(store).toBeTruthy();
    storeId = store!.id;

    await ensureDefaultMarketingRules(prisma, storeId);

    const sleepRule = await prisma.marketingRule.findUnique({
      where: { storeId_type: { storeId, type: "sleep_recall" } },
    });
    expect(sleepRule).toBeTruthy();
    sleepRuleId = sleepRule!.id;

    // Ensure rule enabled with known params
    await prisma.marketingRule.update({
      where: { id: sleepRuleId },
      data: {
        enabled: true,
        frequencyDays: 14,
        params: { inactiveDays: 30, message: "" },
      },
    });

    const sleeping = await prisma.member.findFirst({
      where: { storeId, lineUserId: "sim_demo_sleeping" },
    });
    const optOut = await prisma.member.findFirst({
      where: { storeId, lineUserId: "sim_demo_optout" },
    });
    expect(sleeping).toBeTruthy();
    expect(optOut).toBeTruthy();
    expect(optOut!.marketingOptIn).toBe(false);
    sleepingId = sleeping!.id;
    optOutId = optOut!.id;

    // Clear prior send logs for this rule so tests are deterministic
    await prisma.marketingSendLog.deleteMany({ where: { ruleId: sleepRuleId } });
  });

  it("sleep_recall matches sleeping member, not recent / opt-out", async () => {
    const rule = await prisma.marketingRule.findUniqueOrThrow({
      where: { id: sleepRuleId },
    });
    const matches = await findMatchingMembers(prisma, storeId, rule);
    const ids = matches.map((m) => m.member.id);
    expect(ids).toContain(sleepingId);
    expect(ids).not.toContain(optOutId);

    const taro = await prisma.member.findFirst({
      where: { storeId, lineUserId: "sim_demo_taro" },
    });
    // taro may or may not match depending on seed paid check age; if they have recent activity, exclude
    if (taro) {
      const lastCheck = await prisma.check.findFirst({
        where: { memberId: taro.id, status: "paid" },
        orderBy: { closedAt: "desc" },
      });
      if (lastCheck?.closedAt && lastCheck.closedAt > new Date(Date.now() - 30 * 86400000)) {
        expect(ids).not.toContain(taro.id);
      }
    }
  });

  it("POST /api/crm/marketing/run sends sleep recall via stub + logs", async () => {
    const res = await fetch(`${BASE}/api/crm/marketing/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ ruleId: sleepRuleId }),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.summary.totals.sent).toBeGreaterThanOrEqual(1);
    const sleepResult = data.summary.rules.find(
      (r: { ruleId: string }) => r.ruleId === sleepRuleId
    );
    expect(sleepResult.sent).toBeGreaterThanOrEqual(1);
    expect(
      sleepResult.results.some(
        (r: { memberId: string; status: string }) =>
          r.memberId === sleepingId && r.status === "sent"
      )
    ).toBe(true);

    const log = await prisma.marketingSendLog.findFirst({
      where: { ruleId: sleepRuleId, memberId: sleepingId, status: "sent" },
      orderBy: { createdAt: "desc" },
    });
    expect(log).toBeTruthy();
    expect(log!.messageText.length).toBeGreaterThan(0);
  });

  it("frequency cap: second run logs skipped_freq for same member", async () => {
    const res = await fetch(`${BASE}/api/crm/marketing/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ ruleId: sleepRuleId }),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    const sleepResult = data.summary.rules.find(
      (r: { ruleId: string }) => r.ruleId === sleepRuleId
    );
    expect(
      sleepResult.results.some(
        (r: { memberId: string; status: string }) =>
          r.memberId === sleepingId && r.status === "skipped_freq"
      )
    ).toBe(true);
    expect(sleepResult.skippedFreq).toBeGreaterThanOrEqual(1);

    const skipLog = await prisma.marketingSendLog.findFirst({
      where: { ruleId: sleepRuleId, memberId: sleepingId, status: "skipped_freq" },
      orderBy: { createdAt: "desc" },
    });
    expect(skipLog).toBeTruthy();
  });

  it("disabled rule → skipped_disabled, no sends", async () => {
    await prisma.marketingRule.update({
      where: { id: sleepRuleId },
      data: { enabled: false },
    });
    const before = await prisma.marketingSendLog.count({
      where: { ruleId: sleepRuleId, status: "sent" },
    });

    const summary = await runMarketingRules(prisma, storeId, { ruleId: sleepRuleId });
    expect(summary.rules[0].status).toBe("skipped_disabled");
    expect(summary.rules[0].sent).toBe(0);

    const after = await prisma.marketingSendLog.count({
      where: { ruleId: sleepRuleId, status: "sent" },
    });
    expect(after).toBe(before);

    const disabledLog = await prisma.marketingSendLog.findFirst({
      where: { ruleId: sleepRuleId, status: "skipped_disabled" },
      orderBy: { createdAt: "desc" },
    });
    expect(disabledLog).toBeTruthy();

    // restore
    await prisma.marketingRule.update({
      where: { id: sleepRuleId },
      data: { enabled: true },
    });
  });

  it("opt-out member never matched / never sent", async () => {
    // Clear freq logs for a clean unit check via findMatchingMembers
    const rule = await prisma.marketingRule.findUniqueOrThrow({
      where: { id: sleepRuleId },
    });
    const matches = await findMatchingMembers(prisma, storeId, rule);
    expect(matches.map((m) => m.member.id)).not.toContain(optOutId);

    const sentToOptOut = await prisma.marketingSendLog.count({
      where: { memberId: optOutId, status: "sent" },
    });
    expect(sentToOptOut).toBe(0);
  });

  it("GET rules / logs APIs work", async () => {
    const rulesRes = await fetch(`${BASE}/api/crm/marketing/rules`, {
      headers: { cookie },
    });
    const rulesData = await rulesRes.json();
    expect(rulesRes.status).toBe(200);
    expect(rulesData.rules.length).toBeGreaterThanOrEqual(3);
    expect(rulesData.note).toMatch(/CDP/);

    const logsRes = await fetch(`${BASE}/api/crm/marketing/logs?limit=10`, {
      headers: { cookie },
    });
    const logsData = await logsRes.json();
    expect(logsRes.status).toBe(200);
    expect(Array.isArray(logsData.logs)).toBe(true);
  });

  it("PATCH rule updates enabled + frequencyDays", async () => {
    const res = await fetch(`${BASE}/api/crm/marketing/rules/${sleepRuleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ frequencyDays: 10, params: { inactiveDays: 28 } }),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.rule.frequencyDays).toBe(10);
    expect((data.rule.params as { inactiveDays: number }).inactiveDays).toBe(28);

    // restore defaults for other consumers
    await prisma.marketingRule.update({
      where: { id: sleepRuleId },
      data: {
        frequencyDays: 14,
        params: { inactiveDays: 30, message: "" },
        enabled: true,
      },
    });
  });
});
