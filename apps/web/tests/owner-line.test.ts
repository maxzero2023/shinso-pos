import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@shinso/db";
import {
  addTokyoDays,
  buildDigestSnapshot,
  formatDigestMessage,
  resolveDigestPeriod,
  runOwnerLineDigest,
  tokyoWeekMonSun,
  tokyoYesterdayYmd,
  tokyoDayRange,
  tokyoYmd,
  type LineMessageResult,
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

describe("owner-line unit (AUT-34/82-85)", () => {
  it("tokyoYesterdayYmd is previous Tokyo calendar day", () => {
    const asOf = new Date("2026-09-19T03:00:00+09:00"); // Sep 19 Tokyo morning
    expect(tokyoYmd(asOf)).toBe("2026-09-19");
    expect(tokyoYesterdayYmd(asOf)).toBe("2026-09-18");
  });

  it("tokyoWeekMonSun: Monday–Sunday containing date", () => {
    // 2026-09-18 is Friday
    const w = tokyoWeekMonSun("2026-09-18");
    expect(w.from).toBe("2026-09-14"); // Mon
    expect(w.to).toBe("2026-09-20"); // Sun
    expect(addTokyoDays("2026-09-14", 6)).toBe("2026-09-20");
  });

  it("resolveDigestPeriod daily=yesterday; weekly=Mon–Sun of that day", () => {
    const asOf = new Date("2026-09-19T10:00:00+09:00");
    const d = resolveDigestPeriod("daily", { asOf });
    expect(d).toEqual({ kind: "daily", from: "2026-09-18", to: "2026-09-18" });
    const w = resolveDigestPeriod("weekly", { asOf });
    expect(w.from).toBe("2026-09-14");
    expect(w.to).toBe("2026-09-20");
  });

  it("tokyoDayRange boundaries stay Asia/Tokyo", () => {
    const { start, end } = tokyoDayRange("2026-09-18");
    expect(start.toISOString()).toBe("2026-09-17T15:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-18T15:00:00.000Z");
  });

  it("digest snapshot / message uses report口径", () => {
    const paidAt = new Date("2026-09-18T03:00:00Z"); // 12:00 Tokyo
    const checks = [
      {
        id: "1",
        status: "paid",
        closedAt: paidAt,
        items: [
          {
            menuItemId: "a",
            name: "枝豆",
            unitPriceYen: 480,
            qty: 2,
            status: "fired",
          },
        ],
        payments: [{ status: "succeeded", paidAt }],
      },
      {
        id: "void",
        status: "void",
        closedAt: paidAt,
        items: [
          {
            menuItemId: "b",
            name: "生ビール",
            unitPriceYen: 580,
            qty: 1,
            status: "fired",
          },
        ],
        payments: [],
      },
    ];
    const snap = buildDigestSnapshot("daily", "2026-09-18", "2026-09-18", checks);
    expect(snap.revenueYen).toBe(960);
    expect(snap.paidCheckCount).toBe(1);
    expect(snap.tableAvgYen).toBe(960);
    expect(snap.voidExcluded).toBe(true);
    const msg = formatDigestMessage(snap);
    expect(msg).toContain("【日報】2026-09-18");
    expect(msg).toContain("960");
    expect(msg).toContain("枝豆");
  });
});

describe("AUT-34 Owner LINE digest API", () => {
  let ownerCookie = "";
  let floorCookie = "";
  let storeId = "";

  beforeAll(async () => {
    ownerCookie = await login("owner@shinso.demo");
    floorCookie = await login("floor@shinso.demo");
    const store = await prisma.store.findFirst();
    expect(store).toBeTruthy();
    storeId = store!.id;
  });

  it("seed has owner binding sim_owner_line", async () => {
    const b = await prisma.ownerLineBinding.findUnique({ where: { storeId } });
    expect(b).toBeTruthy();
    expect(b!.lineUserId).toBe("sim_owner_line");
    expect(b!.dailyEnabled).toBe(true);
    expect(b!.weeklyEnabled).toBe(true);
  });

  it("GET /api/crm/owner-line returns binding", async () => {
    const res = await fetch(`${BASE}/api/crm/owner-line`, {
      headers: { cookie: ownerCookie },
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.binding.lineUserId).toBe("sim_owner_line");
  });

  it("floor cannot bind; owner can rebind", async () => {
    const denied = await fetch(`${BASE}/api/crm/owner-line/bind`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: floorCookie },
      body: JSON.stringify({ lineUserId: "sim_should_fail" }),
    });
    expect(denied.status).toBe(403);

    const ok = await fetch(`${BASE}/api/crm/owner-line/bind`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ lineUserId: "sim_owner_line" }),
    });
    const data = await ok.json();
    expect([200, 201]).toContain(ok.status);
    expect(data.binding.lineUserId).toBe("sim_owner_line");
  });

  it("PATCH settings toggles daily/weekly", async () => {
    const off = await fetch(`${BASE}/api/crm/owner-line/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ dailyEnabled: false }),
    });
    expect(off.status).toBe(200);
    const d1 = await off.json();
    expect(d1.binding.dailyEnabled).toBe(false);

    const on = await fetch(`${BASE}/api/crm/owner-line/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ dailyEnabled: true, weeklyEnabled: true }),
    });
    expect(on.status).toBe(200);
    const d2 = await on.json();
    expect(d2.binding.dailyEnabled).toBe(true);
    expect(d2.binding.weeklyEnabled).toBe(true);
  });

  it("daily trigger sends with report snapshot numbers", async () => {
    const yesterday = tokyoYesterdayYmd();
    const res = await fetch(`${BASE}/api/crm/owner-line/trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ kind: "daily", date: yesterday }),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.result.status).toBe("sent");
    expect(data.result.snapshot.revenueYen).toBeGreaterThan(0);
    expect(data.result.snapshot.paidCheckCount).toBeGreaterThan(0);
    expect(data.result.messageText).toContain("【日報】");

    // Matches GET /api/reports/daily
    const reportRes = await fetch(
      `${BASE}/api/reports/daily?date=${encodeURIComponent(yesterday)}`,
      { headers: { cookie: ownerCookie } }
    );
    const report = await reportRes.json();
    expect(reportRes.status).toBe(200);
    expect(data.result.snapshot.revenueYen).toBe(report.revenueYen);
    expect(data.result.snapshot.paidCheckCount).toBe(report.paidCheckCount);
  });

  it("weekly trigger uses Mon–Sun and bestsellers口径", async () => {
    const yesterday = tokyoYesterdayYmd();
    const week = tokyoWeekMonSun(yesterday);
    const res = await fetch(`${BASE}/api/crm/owner-line/trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ kind: "weekly", date: yesterday }),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.result.status).toBe("sent");
    expect(data.result.period.from).toBe(week.from);
    expect(data.result.period.to).toBe(week.to);
    expect(data.result.messageText).toContain("【週報】");
  });

  it("disabled daily → skipped no send", async () => {
    await fetch(`${BASE}/api/crm/owner-line/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ dailyEnabled: false }),
    });
    const res = await fetch(`${BASE}/api/crm/owner-line/trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ kind: "daily" }),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.result.status).toBe("skipped");
    expect(data.result.reason).toBe("disabled");

    await fetch(`${BASE}/api/crm/owner-line/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ dailyEnabled: true }),
    });
  });

  it("unbound → skipped no send", async () => {
    await prisma.ownerLineBinding.delete({ where: { storeId } });
    const res = await fetch(`${BASE}/api/crm/owner-line/trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ kind: "daily" }),
    });
    const data = await res.json();
    expect(data.result.status).toBe("skipped");
    expect(data.result.reason).toBe("unbound");

    // restore binding for later tests / demo
    await prisma.ownerLineBinding.create({
      data: {
        storeId,
        lineUserId: "sim_owner_line",
        dailyEnabled: true,
        weeklyEnabled: true,
      },
    });
  });

  it("GET delivery-logs lists sent/skipped", async () => {
    const res = await fetch(`${BASE}/api/crm/owner-line/delivery-logs?limit=30`, {
      headers: { cookie: ownerCookie },
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(Array.isArray(data.logs)).toBe(true);
    expect(data.logs.length).toBeGreaterThan(0);
    const statuses = new Set(data.logs.map((l: { status: string }) => l.status));
    expect(statuses.has("sent") || statuses.has("skipped")).toBe(true);
  });

  it("retry once on send failure then log failed", async () => {
    let calls = 0;
    const failingSend = async (): Promise<LineMessageResult> => {
      calls += 1;
      throw new Error("simulated LINE outage");
    };
    const result = await runOwnerLineDigest(prisma, storeId, "daily", {
      date: tokyoYesterdayYmd(),
      sendFn: failingSend,
    });
    expect(result.status).toBe("failed");
    expect(result.attemptCount).toBe(2);
    expect(calls).toBe(2);
    const log = await prisma.ownerLineDeliveryLog.findUnique({
      where: { id: result.logId! },
    });
    expect(log?.status).toBe("failed");
    expect(log?.errorMessage).toMatch(/simulated/);
  });
});
