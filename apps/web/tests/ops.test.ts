import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@shinso/db";
import {
  canVoidCheckItem,
  canEditCheckItem,
  tokyoBusinessDateString,
  isManagerRole,
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

describe("ops unit (AUT-31/72/73)", () => {
  it("Tokyo business date is YYYY-MM-DD", () => {
    const s = tokyoBusinessDateString(new Date("2026-09-18T15:00:00Z"));
    // 15:00 UTC = 00:00+1 next day in Tokyo → 2026-09-19
    expect(s).toBe("2026-09-19");
  });

  it("owner is manager; floor is not", () => {
    expect(isManagerRole("owner")).toBe(true);
    expect(isManagerRole("floor")).toBe(false);
  });

  it("floor can void draft only; owner can void fired", () => {
    expect(
      canVoidCheckItem({ role: "floor", itemStatus: "draft", checkStatus: "open" }).ok
    ).toBe(true);
    expect(
      canVoidCheckItem({ role: "floor", itemStatus: "fired", checkStatus: "open" }).ok
    ).toBe(false);
    expect(
      canVoidCheckItem({ role: "owner", itemStatus: "fired", checkStatus: "open" }).ok
    ).toBe(true);
    expect(
      canVoidCheckItem({ role: "owner", itemStatus: "fired", checkStatus: "paid" }).ok
    ).toBe(true);
  });

  it("floor cannot edit fired; owner can", () => {
    expect(
      canEditCheckItem({ role: "floor", itemStatus: "fired", checkStatus: "open" }).ok
    ).toBe(false);
    expect(
      canEditCheckItem({ role: "owner", itemStatus: "fired", checkStatus: "open" }).ok
    ).toBe(true);
  });
});

describe("ops integration (AUT-31/72/73/74/75)", () => {
  let floorCookie = "";
  let ownerCookie = "";
  let storeId = "";
  let freeTableId = "";
  let menuItemId = "";

  beforeAll(async () => {
    const store = await prisma.store.findFirst();
    expect(store).toBeTruthy();
    storeId = store!.id;
    const table = await prisma.table.findFirst({
      where: { area: { storeId }, status: "free", code: "T5" },
    });
    expect(table).toBeTruthy();
    freeTableId = table!.id;
    const item = await prisma.menuItem.findFirst({
      where: { category: { storeId }, active: true },
    });
    expect(item).toBeTruthy();
    menuItemId = item!.id;
    floorCookie = await login("floor@shinso.demo");
    ownerCookie = await login("owner@shinso.demo");
  });

  it("seed has open BusinessDay/Shift for Tokyo today", async () => {
    const today = tokyoBusinessDateString();
    const day = await prisma.businessDay.findFirst({
      where: { storeId, status: "open" },
    });
    expect(day).toBeTruthy();
    const stored = day!.businessDate.toISOString().slice(0, 10);
    expect(stored).toBe(today);
    const shift = await prisma.shift.findFirst({
      where: { storeId, status: "open" },
    });
    expect(shift).toBeTruthy();
  });

  it("GET /api/shifts returns current state", async () => {
    const res = await fetch(`${BASE}/api/shifts`, {
      headers: { cookie: floorCookie },
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.timezone).toBe("Asia/Tokyo");
    expect(data.todayBusinessDate).toBe(tokyoBusinessDateString());
    expect(data.currentShift?.status).toBe("open");
  });

  it("floor cannot void fired item; owner can with audit", async () => {
    // Ensure open shift
    await fetch(`${BASE}/api/shifts/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: floorCookie },
      body: "{}",
    });

    const openRes = await fetch(`${BASE}/api/tables/${freeTableId}/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: floorCookie },
      body: JSON.stringify({ guestCount: 2 }),
    });
    const openData = await openRes.json();
    expect(openRes.status).toBe(201);
    const checkId = openData.check.id as string;
    expect(openData.check.shiftId).toBeTruthy();

    const addRes = await fetch(`${BASE}/api/checks/${checkId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: floorCookie },
      body: JSON.stringify({ menuItemId, qty: 1, modifierIds: [] }),
    });
    expect(addRes.status).toBe(201);
    const addData = await addRes.json();
    const itemId = addData.item.id as string;

    const fireRes = await fetch(`${BASE}/api/checks/${checkId}/fire`, {
      method: "POST",
      headers: { cookie: floorCookie },
    });
    expect(fireRes.status).toBe(201);

    const floorVoid = await fetch(`${BASE}/api/checks/${checkId}/void-item`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: floorCookie },
      body: JSON.stringify({ checkItemId: itemId, reason: "誤注文" }),
    });
    expect(floorVoid.status).toBe(403);

    const ownerVoid = await fetch(`${BASE}/api/checks/${checkId}/void-item`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ checkItemId: itemId, reason: "店長承認取消" }),
    });
    const voidData = await ownerVoid.json();
    expect(ownerVoid.status).toBe(200);
    expect(voidData.item.status).toBe("void");
    expect(voidData.audit.action).toBe("void_item");

    const audits = await prisma.checkAuditLog.findMany({
      where: { checkId, action: "void_item" },
    });
    expect(audits.length).toBeGreaterThanOrEqual(1);

    // Flag + resolve exception
    const flagRes = await fetch(`${BASE}/api/checks/${checkId}/flag-exception`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: floorCookie },
      body: JSON.stringify({ note: "テスト異常" }),
    });
    expect(flagRes.status).toBe(200);

    const floorResolve = await fetch(
      `${BASE}/api/checks/${checkId}/resolve-exception`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: floorCookie },
        body: JSON.stringify({ note: "不可" }),
      }
    );
    expect(floorResolve.status).toBe(403);

    const resolveRes = await fetch(
      `${BASE}/api/checks/${checkId}/resolve-exception`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: ownerCookie },
        body: JSON.stringify({ note: "確認済" }),
      }
    );
    expect(resolveRes.status).toBe(200);

    // Close check so we can test close-shift block separately — pay remaining = 0
    // Add another item, fire, pay
    const add2 = await fetch(`${BASE}/api/checks/${checkId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: floorCookie },
      body: JSON.stringify({ menuItemId, qty: 1, modifierIds: [] }),
    });
    expect(add2.status).toBe(201);
    await fetch(`${BASE}/api/checks/${checkId}/fire`, {
      method: "POST",
      headers: { cookie: floorCookie },
    });
    const checkGet = await fetch(`${BASE}/api/checks/${checkId}`, {
      headers: { cookie: floorCookie },
    });
    const checkBody = await checkGet.json();
    const payRes = await fetch(`${BASE}/api/checks/${checkId}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: floorCookie },
      body: JSON.stringify({
        method: "cash",
        amountYen: checkBody.check.totalYen,
        idempotencyKey: `ops-test-${checkId}`,
      }),
    });
    expect(payRes.status).toBe(200);
  });

  it("close shift forbidden while open Check exists", async () => {
    // Open another table briefly
    const table = await prisma.table.findFirst({
      where: { area: { storeId }, status: "free", code: "T3" },
    });
    expect(table).toBeTruthy();

    await fetch(`${BASE}/api/shifts/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: floorCookie },
      body: "{}",
    });

    const openRes = await fetch(`${BASE}/api/tables/${table!.id}/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: floorCookie },
      body: JSON.stringify({ guestCount: 1 }),
    });
    expect(openRes.status).toBe(201);
    const { check } = await openRes.json();

    const closeRes = await fetch(`${BASE}/api/shifts/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: floorCookie },
      body: "{}",
    });
    const closeData = await closeRes.json();
    expect(closeRes.status).toBe(409);
    expect(closeData.openCheckCount).toBeGreaterThanOrEqual(1);

    // Cleanup: void by paying after adding item OR delete via prisma for test isolation
    await prisma.checkItem.deleteMany({ where: { checkId: check.id } });
    await prisma.check.update({
      where: { id: check.id },
      data: { status: "paid", closedAt: new Date() },
    });
    await prisma.table.update({
      where: { id: table!.id },
      data: { status: "free" },
    });

    // Now close should work if no other open checks
    const openLeft = await prisma.check.count({
      where: { status: "open", table: { area: { storeId } } },
    });
    if (openLeft === 0) {
      const okClose = await fetch(`${BASE}/api/shifts/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: ownerCookie },
        body: "{}",
      });
      expect(okClose.status).toBe(200);
      // reopen for other demos
      await fetch(`${BASE}/api/shifts/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: ownerCookie },
        body: "{}",
      });
    }
  });

  it("ops exceptions and audits endpoints work", async () => {
    const eRes = await fetch(`${BASE}/api/ops/exceptions?status=all`, {
      headers: { cookie: ownerCookie },
    });
    expect(eRes.status).toBe(200);
    const aRes = await fetch(`${BASE}/api/ops/audits?limit=20`, {
      headers: { cookie: ownerCookie },
    });
    const aData = await aRes.json();
    expect(aRes.status).toBe(200);
    expect(Array.isArray(aData.audits)).toBe(true);
    expect(aData.audits.length).toBeGreaterThanOrEqual(1);
  });
});
