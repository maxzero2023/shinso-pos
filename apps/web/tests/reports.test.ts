import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@shinso/db";
import {
  buildDailyReport,
  buildHourlyReport,
  buildTableAvgReport,
  buildBestsellersReport,
  canReadReports,
  checkRevenueYen,
  effectivePaidAt,
  tokyoDayRange,
  tokyoHour,
  tokyoYmd,
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

describe("reports unit (AUT-32/76)", () => {
  it("owner and floor can read; kitchen cannot", () => {
    expect(canReadReports("owner")).toBe(true);
    expect(canReadReports("floor")).toBe(true);
    expect(canReadReports("kitchen")).toBe(false);
  });

  it("tokyoDayRange is [start, end) in Tokyo", () => {
    const { start, end } = tokyoDayRange("2026-09-18");
    expect(start.toISOString()).toBe("2026-09-17T15:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-18T15:00:00.000Z");
  });

  it("effectivePaidAt prefers payment paidAt", () => {
    const paidAt = new Date("2026-09-18T10:00:00Z");
    const closedAt = new Date("2026-09-18T11:00:00Z");
    expect(
      effectivePaidAt({
        closedAt,
        payments: [{ status: "succeeded", paidAt }],
      })?.getTime()
    ).toBe(paidAt.getTime());
  });

  it("void checks and void items excluded; empty day is zero", () => {
    const date = "2026-09-18";
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
          {
            menuItemId: "b",
            name: "生ビール",
            unitPriceYen: 580,
            qty: 1,
            status: "void",
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
            menuItemId: "a",
            name: "枝豆",
            unitPriceYen: 480,
            qty: 99,
            status: "fired",
          },
        ],
        payments: [],
      },
    ];
    expect(checkRevenueYen(checks[0].items)).toBe(960);
    const daily = buildDailyReport(date, checks);
    expect(daily.revenueYen).toBe(960);
    expect(daily.paidCheckCount).toBe(1);
    const avg = buildTableAvgReport(date, checks);
    expect(avg.tableAvgYen).toBe(960);
    const empty = buildDailyReport("2026-09-19", checks);
    expect(empty.revenueYen).toBe(0);
    expect(empty.paidCheckCount).toBe(0);
    expect(buildTableAvgReport("2026-09-19", checks).tableAvgYen).toBe(0);
  });

  it("hourly buckets by paidAt Tokyo hour", () => {
    const date = "2026-09-18";
    const at12 = new Date("2026-09-18T03:00:00Z"); // 12:00+09
    const at20 = new Date("2026-09-18T11:00:00Z"); // 20:00+09
    expect(tokyoHour(at12)).toBe(12);
    expect(tokyoHour(at20)).toBe(20);
    const checks = [
      {
        id: "1",
        status: "paid",
        closedAt: at12,
        items: [
          {
            menuItemId: "a",
            name: "A",
            unitPriceYen: 1000,
            qty: 1,
            status: "fired",
          },
        ],
        payments: [{ status: "succeeded", paidAt: at12 }],
      },
      {
        id: "2",
        status: "paid",
        closedAt: at20,
        items: [
          {
            menuItemId: "a",
            name: "A",
            unitPriceYen: 500,
            qty: 2,
            status: "fired",
          },
        ],
        payments: [{ status: "succeeded", paidAt: at20 }],
      },
    ];
    const hourly = buildHourlyReport(date, checks);
    expect(hourly.hours[12].revenueYen).toBe(1000);
    expect(hourly.hours[12].paidCheckCount).toBe(1);
    expect(hourly.hours[20].revenueYen).toBe(1000);
    expect(hourly.hours[20].paidCheckCount).toBe(1);
    expect(hourly.hours[15].revenueYen).toBe(0);
  });

  it("bestsellers aggregate qty by menuItem", () => {
    const paidAt = new Date("2026-09-18T03:00:00Z");
    const checks = [
      {
        id: "1",
        status: "paid",
        closedAt: paidAt,
        items: [
          {
            menuItemId: "momo",
            name: "もも",
            unitPriceYen: 180,
            qty: 3,
            status: "fired",
          },
          {
            menuItemId: "beer",
            name: "生ビール",
            unitPriceYen: 580,
            qty: 1,
            status: "fired",
          },
        ],
        payments: [{ status: "succeeded", paidAt }],
      },
      {
        id: "2",
        status: "paid",
        closedAt: paidAt,
        items: [
          {
            menuItemId: "momo",
            name: "もも",
            unitPriceYen: 180,
            qty: 2,
            status: "fired",
          },
        ],
        payments: [{ status: "succeeded", paidAt }],
      },
    ];
    const report = buildBestsellersReport("2026-09-18", "2026-09-18", checks);
    expect(report.items[0].menuItemId).toBe("momo");
    expect(report.items[0].qty).toBe(5);
    expect(report.items[0].revenueYen).toBe(900);
  });
});

describe("reports integration (AUT-32/76/77/78)", () => {
  let ownerCookie = "";
  let floorCookie = "";
  let kitchenCookie = "";
  let storeId = "";
  let today = "";

  beforeAll(async () => {
    const store = await prisma.store.findFirst();
    expect(store).toBeTruthy();
    storeId = store!.id;
    today = tokyoYmd(new Date());
    ownerCookie = await login("owner@shinso.demo");
    floorCookie = await login("floor@shinso.demo");
    kitchenCookie = await login("kitchen@shinso.demo");
  });

  it("seed has multi-hour paid checks for Tokyo today", async () => {
    const paid = await prisma.check.findMany({
      where: { status: "paid", table: { area: { storeId } } },
      include: { payments: { where: { status: "succeeded" } } },
    });
    expect(paid.length).toBeGreaterThanOrEqual(5);
    const hours = new Set<number>();
    for (const c of paid) {
      const paidAt = effectivePaidAt(c);
      expect(paidAt).toBeTruthy();
      if (tokyoYmd(paidAt!) === today) hours.add(tokyoHour(paidAt!));
    }
    expect(hours.size).toBeGreaterThanOrEqual(3);
    const voids = await prisma.check.count({
      where: { status: "void", table: { area: { storeId } } },
    });
    expect(voids).toBeGreaterThanOrEqual(1);
  });

  it("GET /api/reports/daily matches paid check sum", async () => {
    const res = await fetch(`${BASE}/api/reports/daily?date=${today}`, {
      headers: { cookie: ownerCookie },
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.timezone).toBe("Asia/Tokyo");
    expect(data.date).toBe(today);
    expect(data.paidCheckCount).toBeGreaterThanOrEqual(5);
    expect(data.revenueYen).toBeGreaterThan(0);

    const { start, end } = tokyoDayRange(today);
    const checks = await prisma.check.findMany({
      where: { status: "paid", table: { area: { storeId } } },
      include: {
        items: true,
        payments: { where: { status: "succeeded" } },
      },
    });
    let expected = 0;
    let count = 0;
    for (const c of checks) {
      const paidAt = effectivePaidAt(c);
      if (!paidAt) continue;
      const t = paidAt.getTime();
      if (t < start.getTime() || t >= end.getTime()) continue;
      expected += checkRevenueYen(c.items);
      count += 1;
    }
    expect(data.revenueYen).toBe(expected);
    expect(data.paidCheckCount).toBe(count);
  });

  it("GET table-avg / hourly / bestsellers", async () => {
    const [tRes, hRes, bRes] = await Promise.all([
      fetch(`${BASE}/api/reports/table-avg?date=${today}`, {
        headers: { cookie: floorCookie },
      }),
      fetch(`${BASE}/api/reports/hourly?date=${today}`, {
        headers: { cookie: floorCookie },
      }),
      fetch(`${BASE}/api/reports/bestsellers?from=${today}&to=${today}`, {
        headers: { cookie: floorCookie },
      }),
    ]);
    const [t, h, b] = await Promise.all([tRes.json(), hRes.json(), bRes.json()]);
    expect(tRes.status).toBe(200);
    expect(hRes.status).toBe(200);
    expect(bRes.status).toBe(200);
    expect(t.tableAvgYen).toBe(Math.round(t.revenueYen / t.paidCheckCount));
    expect(h.bucketBy).toBe("paidAt");
    expect(h.hours).toHaveLength(24);
    expect(h.hours.some((x: { paidCheckCount: number }) => x.paidCheckCount > 0)).toBe(
      true
    );
    expect(b.items.length).toBeGreaterThan(0);
    expect(b.items[0].qty).toBeGreaterThan(0);
  });

  it("empty day returns zeros not error", async () => {
    const res = await fetch(`${BASE}/api/reports/daily?date=2099-01-01`, {
      headers: { cookie: ownerCookie },
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.revenueYen).toBe(0);
    expect(data.paidCheckCount).toBe(0);
  });

  it("kitchen cannot read reports (403)", async () => {
    const res = await fetch(`${BASE}/api/reports/daily?date=${today}`, {
      headers: { cookie: kitchenCookie },
    });
    expect(res.status).toBe(403);
  });

  it("unauthenticated gets 401", async () => {
    const res = await fetch(`${BASE}/api/reports/daily?date=${today}`);
    expect(res.status).toBe(401);
  });
});
