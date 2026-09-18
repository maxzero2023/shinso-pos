import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@shinso/db";
import { suggestMenuItemId, findUnmappedLines, EXTERNAL_ORDER_STATUS_JA } from "@shinso/api";

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

describe("AUT-43 delivery mapping unit", () => {
  it("suggestMenuItemId exact / partial", () => {
    const items = [
      { id: "1", name: "生ビール", nameZh: "生啤", nameEn: "Draft beer", active: true },
      { id: "2", name: "唐揚げ定食", nameZh: null, nameEn: null, active: true },
      { id: "3", name: "閉店品", nameZh: null, nameEn: null, active: false },
    ];
    expect(suggestMenuItemId("生ビール", items)).toBe("1");
    expect(suggestMenuItemId("Draft beer", items)).toBe("1");
    expect(suggestMenuItemId("唐揚げ", items)).toBe("2");
    expect(suggestMenuItemId("閉店品", items)).toBeNull();
    expect(suggestMenuItemId("謎メニュー", items)).toBeNull();
  });

  it("findUnmappedLines + status labels", () => {
    expect(
      findUnmappedLines([
        { id: "a", externalItemName: "A", menuItemId: "1" },
        { id: "b", externalItemName: "B", menuItemId: null },
      ])
    ).toEqual([{ id: "b", externalItemName: "B" }]);
    expect(EXTERNAL_ORDER_STATUS_JA.pending).toBe("確認待ち");
  });
});

describe("AUT-43 semi-auto delivery intake", () => {
  let cookie = "";
  let storeId = "";

  beforeAll(async () => {
    cookie = await login("floor@shinso.demo");
    const store = await prisma.store.findFirst({ orderBy: { createdAt: "asc" } });
    expect(store).toBeTruthy();
    storeId = store!.id;
  });

  it("seed pending order has no Check / KitchenTicket", async () => {
    const pending = await prisma.externalOrder.findFirst({
      where: { storeId, externalId: "SEED-DEMAE-001", status: "pending" },
      include: { check: { include: { kitchenTickets: true } } },
    });
    expect(pending).toBeTruthy();
    expect(pending!.checkId).toBeNull();
    expect(pending!.check).toBeNull();

    const listRes = await fetch(`${BASE}/api/delivery/orders?status=pending`, {
      headers: { cookie },
    });
    const listData = await listRes.json();
    expect(listRes.status).toBe(200);
    const seed = listData.orders.find((o: { externalId: string }) => o.externalId === "SEED-DEMAE-001");
    expect(seed).toBeTruthy();
    expect(seed.checkId).toBeNull();
  });

  it("simulate webhook creates pending only (no KDS)", async () => {
    const externalId = `TEST-SIM-${Date.now()}`;
    const beer = await prisma.menuItem.findFirst({
      where: { name: "生ビール", category: { storeId } },
    });
    expect(beer).toBeTruthy();

    const res = await fetch(`${BASE}/api/delivery/simulate/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        channel: "uber_eats_jp",
        externalId,
        customerName: "テスト客",
        lines: [{ externalItemName: "生ビール", qty: 1, unitPriceYen: 580 }],
      }),
    });
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.order.status).toBe("pending");
    expect(data.order.checkId).toBeFalsy();

    const ticketsBefore = await prisma.kitchenTicket.count({
      where: { check: { table: { area: { storeId } }, note: { contains: externalId } } },
    });
    expect(ticketsBefore).toBe(0);
  });

  it("confirm creates check channel=delivery + kitchen tickets", async () => {
    const beer = await prisma.menuItem.findFirst({
      where: { name: "生ビール", category: { storeId } },
    });
    const edamame = await prisma.menuItem.findFirst({
      where: { name: "枝豆", category: { storeId } },
    });
    const externalId = `TEST-OK-${Date.now()}`;
    const sim = await fetch(`${BASE}/api/delivery/simulate/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        channel: "demaecan",
        externalId,
        lines: [
          { externalItemName: "生ビール", qty: 2, unitPriceYen: 580, menuItemId: beer!.id },
          { externalItemName: "枝豆", qty: 1, unitPriceYen: 480, menuItemId: edamame!.id },
        ],
      }),
    });
    const simData = await sim.json();
    expect(sim.status).toBe(201);
    const orderId = simData.order.id as string;

    const confirm = await fetch(`${BASE}/api/delivery/orders/${orderId}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({}),
    });
    const confData = await confirm.json();
    expect(confirm.status).toBe(201);
    expect(confData.check.channel).toBe("delivery");
    expect(confData.ticket.status).toBe("queued");
    expect(confData.ticket.lines.length).toBe(2);

    const check = await prisma.check.findUnique({
      where: { id: confData.check.id },
      include: { kitchenTickets: true, items: true },
    });
    expect(check!.channel).toBe("delivery");
    expect(check!.kitchenTickets.length).toBe(1);
    expect(check!.items.every((i) => i.status === "fired")).toBe(true);

    const kds = await fetch(`${BASE}/api/kitchen/tickets`, { headers: { cookie } });
    const kdsData = await kds.json();
    expect(kds.status).toBe(200);
    const found = kdsData.tickets.find((t: { id: string }) => t.id === confData.ticket.id);
    expect(found).toBeTruthy();
  });

  it("bad map fails cleanly; fix then succeed", async () => {
    const beer = await prisma.menuItem.findFirst({
      where: { name: "生ビール", category: { storeId } },
    });
    const externalId = `TEST-BAD-${Date.now()}`;
    const sim = await fetch(`${BASE}/api/delivery/simulate/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        channel: "demaecan",
        externalId,
        lines: [
          { externalItemName: "完全に未知の品", qty: 1, unitPriceYen: 1000 },
          { externalItemName: "生ビール", qty: 1, unitPriceYen: 580, menuItemId: beer!.id },
        ],
      }),
    });
    const simData = await sim.json();
    expect(sim.status).toBe(201);
    const orderId = simData.order.id as string;
    const badLine = simData.order.lines.find(
      (l: { externalItemName: string }) => l.externalItemName === "完全に未知の品"
    );
    expect(badLine.menuItemId).toBeNull();

    const checksBefore = await prisma.check.count({
      where: { channel: "delivery", note: { contains: externalId } },
    });

    // Clear any auto-hint and confirm → fail
    await fetch(`${BASE}/api/delivery/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        lines: [
          { id: badLine.id, menuItemId: null },
          {
            id: simData.order.lines.find((l: { externalItemName: string }) => l.externalItemName === "生ビール")
              .id,
            menuItemId: beer!.id,
          },
        ],
      }),
    });

    const fail = await fetch(`${BASE}/api/delivery/orders/${orderId}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({}),
    });
    const failData = await fail.json();
    expect(fail.status).toBe(400);
    expect(failData.error).toMatch(/マッピング未完了/);

    const checksAfterFail = await prisma.check.count({
      where: { channel: "delivery", note: { contains: externalId } },
    });
    expect(checksAfterFail).toBe(checksBefore);

    const orderAfterFail = await prisma.externalOrder.findUnique({ where: { id: orderId } });
    expect(orderAfterFail!.status).toBe("pending");
    expect(orderAfterFail!.checkId).toBeNull();
    expect(orderAfterFail!.mappingError).toBeTruthy();

    // Fix mapping → succeed
    const patch = await fetch(`${BASE}/api/delivery/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        lines: [{ id: badLine.id, menuItemId: beer!.id }],
      }),
    });
    expect(patch.status).toBe(200);

    const ok = await fetch(`${BASE}/api/delivery/orders/${orderId}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({}),
    });
    const okData = await ok.json();
    expect(ok.status).toBe(201);
    expect(okData.check.channel).toBe("delivery");
    expect(okData.ticket.lines.length).toBe(2);

    const final = await prisma.externalOrder.findUnique({ where: { id: orderId } });
    expect(final!.status).toBe("confirmed");
    expect(final!.checkId).toBe(okData.check.id);
    expect(final!.mappingError).toBeNull();
  });

  it("store-scoped: Store B cannot see Store A pending", async () => {
    const cookieB = await login("floor-b@shinso.demo");
    const res = await fetch(`${BASE}/api/delivery/orders?status=pending`, {
      headers: { cookie: cookieB },
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    const leaked = (data.orders as Array<{ externalId: string }>).find(
      (o) => o.externalId === "SEED-DEMAE-001"
    );
    expect(leaked).toBeUndefined();
  });
});
