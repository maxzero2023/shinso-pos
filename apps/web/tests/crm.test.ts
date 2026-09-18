import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@shinso/db";
import {
  calcPointsFromAmountYen,
  getLineMode,
  tryAwardPointsForPaidCheck,
  POINTS_YEN_PER_POINT,
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

describe("CRM unit (AUT-79/80)", () => {
  it("defaults LINE_MODE to simulator", () => {
    expect(getLineMode({} as unknown as NodeJS.ProcessEnv)).toBe("simulator");
    expect(getLineMode({ LINE_MODE: "live" } as unknown as NodeJS.ProcessEnv)).toBe("live");
  });

  it("calcPointsFromAmountYen: ¥100 = 1pt floor", () => {
    expect(POINTS_YEN_PER_POINT).toBe(100);
    expect(calcPointsFromAmountYen(0)).toBe(0);
    expect(calcPointsFromAmountYen(99)).toBe(0);
    expect(calcPointsFromAmountYen(100)).toBe(1);
    expect(calcPointsFromAmountYen(1999)).toBe(19);
  });
});

describe("AUT-33 CRM LINE membership", () => {
  let cookie = "";
  let storeId = "";

  beforeAll(async () => {
    cookie = await login("floor@shinso.demo");
    const store = await prisma.store.findFirst();
    expect(store).toBeTruthy();
    storeId = store!.id;
  });

  it("GET /api/crm/config returns simulator mode", async () => {
    const res = await fetch(`${BASE}/api/crm/config`, { headers: { cookie } });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(["simulator", "live"]).toContain(data.mode);
    expect(data.messagingStub).toBe(true);
  });

  it("POST /api/crm/line/bind creates member (simulator auto id)", async () => {
    const res = await fetch(`${BASE}/api/crm/line/bind`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ displayName: "テスト会員" }),
    });
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.member.lineUserId).toMatch(/^sim_/);
    expect(data.created).toBe(true);

    const again = await fetch(`${BASE}/api/crm/line/bind`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        lineUserId: data.member.lineUserId,
        displayName: "テスト会員",
      }),
    });
    const d2 = await again.json();
    expect(again.status).toBe(200);
    expect(d2.replayed).toBe(true);
    expect(d2.member.id).toBe(data.member.id);
  });

  it("GET /api/crm/members/me returns member + coupons", async () => {
    const member = await prisma.member.findFirst({
      where: { storeId, lineUserId: "sim_demo_taro" },
    });
    expect(member).toBeTruthy();
    const res = await fetch(
      `${BASE}/api/crm/members/me?lineUserId=${encodeURIComponent(member!.lineUserId)}`
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.member.id).toBe(member!.id);
    expect(Array.isArray(data.member.coupons)).toBe(true);
  });

  it("coupon redeem succeeds once then fails (idempotent state)", async () => {
    const member = await prisma.member.findFirst({ where: { storeId } });
    const tpl = await prisma.couponTemplate.findFirst({
      where: { storeId, active: true },
    });
    expect(member && tpl).toBeTruthy();

    const issueRes = await fetch(`${BASE}/api/crm/coupons/issue`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ memberId: member!.id, templateId: tpl!.id }),
    });
    const issueData = await issueRes.json();
    expect(issueRes.status).toBe(201);
    const code = issueData.coupon.code as string;

    const r1 = await fetch(`${BASE}/api/crm/coupons/redeem`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ code }),
    });
    expect(r1.status).toBe(200);
    const d1 = await r1.json();
    expect(d1.coupon.status).toBe("redeemed");

    const r2 = await fetch(`${BASE}/api/crm/coupons/redeem`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ code }),
    });
    expect(r2.status).toBe(409);
    const d2 = await r2.json();
    expect(d2.error).toMatch(/核销/);
  });

  it("points award only on paid Check; idempotent", async () => {
    const member = await prisma.member.findFirst({
      where: { storeId, lineUserId: "sim_demo_hanako" },
    });
    expect(member).toBeTruthy();

    const tablesRes = await fetch(`${BASE}/api/tables`, { headers: { cookie } });
    const tablesData = await tablesRes.json();
    const free = tablesData.tables.find((t: { status: string }) => t.status === "free");
    expect(free).toBeTruthy();

    const openRes = await fetch(`${BASE}/api/tables/${free.id}/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ guestCount: 1 }),
    });
    const openData = await openRes.json();
    expect(openRes.status).toBe(201);
    const checkId = openData.check.id as string;

    const menuRes = await fetch(`${BASE}/api/menu/categories`, { headers: { cookie } });
    const menuData = await menuRes.json();
    const item = menuData.categories[0].items[0];
    await fetch(`${BASE}/api/checks/${checkId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ menuItemId: item.id, qty: 2, modifierIds: [] }),
    });

    const checkRes = await fetch(`${BASE}/api/checks/${checkId}`, { headers: { cookie } });
    const checkData = await checkRes.json();
    const total = checkData.check.totalYen as number;

    const before = await prisma.member.findUnique({ where: { id: member!.id } });

    const payRes = await fetch(`${BASE}/api/checks/${checkId}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        method: "cash",
        amountYen: total,
        memberId: member!.id,
        idempotencyKey: `crm_pts_${Date.now()}`,
      }),
    });
    expect(payRes.status).toBe(200);
    const payData = await payRes.json();
    expect(payData.check.status).toBe("paid");

    const expectedPts = Math.floor(total / 100);
    const award = await prisma.pointAward.findUnique({ where: { checkId } });
    expect(award).toBeTruthy();
    expect(award!.points).toBe(expectedPts);

    const after = await prisma.member.findUnique({ where: { id: member!.id } });
    expect(after!.points).toBe(before!.points + expectedPts);

    // Idempotent re-award
    const again = await tryAwardPointsForPaidCheck(prisma, checkId);
    expect(again.skipped).toBe(true);
    expect(again.reason).toBe("already_awarded");

    const after2 = await prisma.member.findUnique({ where: { id: member!.id } });
    expect(after2!.points).toBe(after!.points);
  });

  it("seed coupon CPDEMO01 exists issued", async () => {
    const c = await prisma.couponIssue.findFirst({
      where: { storeId, code: "CPDEMO01" },
    });
    expect(c).toBeTruthy();
    expect(c!.status).toBe("issued");
  });
});
