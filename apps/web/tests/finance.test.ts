import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@shinso/db";
import {
  buildMarginsBreakdown,
  computeGrossMarginYen,
  estimateCogsFromBom,
  soldMenuFromPaidChecks,
  FINANCE_DISCLAIMER_JA,
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

describe("AUT-40 finance unit math", () => {
  it("COGS = soldQty × qtyPerItem × costYenPerUnit; missing BOM → 0 + note", () => {
    const sold = [
      { menuItemId: "m1", name: "枝豆", soldQty: 2, revenueYen: 960 },
      { menuItemId: "m2", name: "生ビール", soldQty: 3, revenueYen: 1740 },
    ];
    const bom = [
      { menuItemId: "m1", ingredientId: "i1", qtyPerItem: 150, costYenPerUnit: 1 },
    ];
    const r = estimateCogsFromBom(sold, bom);
    // edamame: 2 * 150 * 1 = 300
    expect(r.cogsYen).toBe(300);
    expect(r.byMenuItem.find((x) => x.menuItemId === "m1")?.cogsYen).toBe(300);
    expect(r.byMenuItem.find((x) => x.menuItemId === "m2")?.cogsYen).toBe(0);
    expect(r.byMenuItem.find((x) => x.menuItemId === "m2")?.hasBom).toBe(false);
    expect(r.missingBomMenuItemIds).toContain("m2");
    expect(r.missingBomNotes.some((n) => n.includes("生ビール"))).toBe(true);
  });

  it("gross margin = revenue − COGS − expenses (expenses never add to revenue)", () => {
    expect(computeGrossMarginYen(10000, 3000, 2000)).toBe(5000);
    expect(computeGrossMarginYen(10000, 0, 0)).toBe(10000);
    // expenses reduce margin, never inflate revenue path
    expect(computeGrossMarginYen(10000, 1000, 500)).toBe(8500);
  });

  it("soldMenuFromPaidChecks respects Tokyo day + voids", () => {
    const date = "2026-09-18";
    const inDay = new Date("2026-09-18T03:00:00Z"); // 12:00 Tokyo
    const outDay = new Date("2026-09-17T03:00:00Z");
    const sold = soldMenuFromPaidChecks(date, [
      {
        id: "1",
        status: "paid",
        closedAt: inDay,
        items: [
          { menuItemId: "a", name: "枝豆", unitPriceYen: 480, qty: 2, status: "fired" },
          { menuItemId: "b", name: "ビール", unitPriceYen: 580, qty: 1, status: "void" },
        ],
        payments: [{ status: "succeeded", paidAt: inDay }],
      },
      {
        id: "2",
        status: "paid",
        closedAt: outDay,
        items: [
          { menuItemId: "a", name: "枝豆", unitPriceYen: 480, qty: 99, status: "fired" },
        ],
        payments: [{ status: "succeeded", paidAt: outDay }],
      },
    ]);
    expect(sold).toHaveLength(1);
    expect(sold[0].soldQty).toBe(2);
    expect(sold[0].revenueYen).toBe(960);
  });

  it("buildMarginsBreakdown wires revenue/cogs/expenses", () => {
    const paidAt = new Date("2026-09-18T03:00:00Z");
    const m = buildMarginsBreakdown({
      dateYmd: "2026-09-18",
      checks: [
        {
          id: "1",
          status: "paid",
          closedAt: paidAt,
          items: [
            { menuItemId: "a", name: "枝豆", unitPriceYen: 480, qty: 2, status: "fired" },
          ],
          payments: [{ status: "succeeded", paidAt }],
        },
      ],
      bomLines: [
        { menuItemId: "a", ingredientId: "i1", qtyPerItem: 150, costYenPerUnit: 1 },
      ],
      expensesYen: 100,
      disclaimer: FINANCE_DISCLAIMER_JA,
    });
    expect(m.revenueYen).toBe(960);
    expect(m.cogsYen).toBe(300);
    expect(m.expensesYen).toBe(100);
    expect(m.grossMarginYen).toBe(560);
    expect(m.statutoryAccounting).toBe(false);
    expect(m.disclaimer).toContain("経営分析用");
  });
});

describe("AUT-40 finance API", () => {
  let storeAId = "";
  let storeBId = "";
  const today = tokyoYmd(new Date());

  beforeAll(async () => {
    const brand = await prisma.brand.findFirst({ where: { name: "SHINSO Demo" } });
    expect(brand).toBeTruthy();
    const stores = await prisma.store.findMany({
      where: { brandId: brand!.id },
      orderBy: { createdAt: "asc" },
    });
    storeAId = stores.find((s) => s.name === "シンソウデモ店")?.id ?? stores[0].id;
    storeBId = stores.find((s) => s.name === "シンソウデモ店 B")?.id ?? stores[1].id;
  });

  it("GET /api/finance/margins returns estimate for active store", async () => {
    const cookie = await login("owner@shinso.demo");
    const res = await fetch(`${BASE}/api/finance/margins?date=${encodeURIComponent(today)}`, {
      headers: { cookie },
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.timezone).toBe("Asia/Tokyo");
    expect(data.statutoryAccounting).toBe(false);
    expect(typeof data.revenueYen).toBe("number");
    expect(typeof data.cogsYen).toBe("number");
    expect(typeof data.expensesYen).toBe("number");
    expect(data.grossMarginYen).toBe(data.revenueYen - data.cogsYen - data.expensesYen);
    expect(data.disclaimer).toContain("経営分析用");
  });

  it("POST expense then margins expensesYen increases; expenses not in revenue", async () => {
    const cookie = await login("manager@shinso.demo");
    const before = await fetch(
      `${BASE}/api/finance/margins?date=${encodeURIComponent(today)}`,
      { headers: { cookie } }
    ).then((r) => r.json());

    const uniqueLabel = `test-expense-${Date.now()}`;
    const post = await fetch(`${BASE}/api/finance/expenses`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        date: today,
        amountYen: 777,
        category: "その他",
        label: uniqueLabel,
        note: "vitest",
      }),
    });
    const created = await post.json();
    expect(post.status).toBe(201);
    expect(created.expense.amountYen).toBe(777);
    expect(created.statutoryAccounting).toBe(false);

    const after = await fetch(
      `${BASE}/api/finance/margins?date=${encodeURIComponent(today)}`,
      { headers: { cookie } }
    ).then((r) => r.json());

    expect(after.expensesYen).toBe(before.expensesYen + 777);
    expect(after.revenueYen).toBe(before.revenueYen);
    expect(after.grossMarginYen).toBe(before.grossMarginYen - 777);

    const list = await fetch(
      `${BASE}/api/finance/expenses?date=${encodeURIComponent(today)}`,
      { headers: { cookie } }
    ).then((r) => r.json());
    expect(list.expenses.some((e: { label: string }) => e.label === uniqueLabel)).toBe(true);
  });

  it("store isolation: Store A expenses not visible on Store B", async () => {
    const brandAdmin = await login("brandadmin@shinso.demo");

    // Ensure we start on store A
    await fetch(`${BASE}/api/session/switch-store`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: brandAdmin },
      body: JSON.stringify({ storeId: storeAId }),
    });

    const label = `iso-a-${Date.now()}`;
    await fetch(`${BASE}/api/finance/expenses`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: brandAdmin },
      body: JSON.stringify({
        date: today,
        amountYen: 111,
        category: "その他",
        label,
      }),
    });

    const onA = await fetch(
      `${BASE}/api/finance/expenses?date=${encodeURIComponent(today)}`,
      { headers: { cookie: brandAdmin } }
    ).then((r) => r.json());
    expect(onA.expenses.some((e: { label: string }) => e.label === label)).toBe(true);

    const sw = await fetch(`${BASE}/api/session/switch-store`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: brandAdmin },
      body: JSON.stringify({ storeId: storeBId }),
    });
    expect(sw.status).toBe(200);
    const setCookie = sw.headers.getSetCookie?.() ?? [];
    const cookieB =
      setCookie.map((c) => c.split(";")[0]).join("; ") || brandAdmin;

    const onB = await fetch(
      `${BASE}/api/finance/expenses?date=${encodeURIComponent(today)}`,
      { headers: { cookie: cookieB } }
    ).then((r) => r.json());
    expect(onB.expenses.some((e: { label: string }) => e.label === label)).toBe(false);

    // Seed Store B expense may exist but A label must not
    const marginsB = await fetch(
      `${BASE}/api/finance/margins?date=${encodeURIComponent(today)}`,
      { headers: { cookie: cookieB } }
    ).then((r) => r.json());
    expect(marginsB.statutoryAccounting).toBe(false);
  });

  it("kitchen cannot read finance", async () => {
    const cookie = await login("kitchen@shinso.demo");
    const res = await fetch(`${BASE}/api/finance/margins?date=${encodeURIComponent(today)}`, {
      headers: { cookie },
    });
    expect(res.status).toBe(403);
  });

  it("floor can read but not POST expenses", async () => {
    const cookie = await login("floor@shinso.demo");
    const get = await fetch(
      `${BASE}/api/finance/margins?date=${encodeURIComponent(today)}`,
      { headers: { cookie } }
    );
    expect(get.status).toBe(200);

    const post = await fetch(`${BASE}/api/finance/expenses`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        date: today,
        amountYen: 100,
        category: "その他",
      }),
    });
    expect(post.status).toBe(403);
  });
});
