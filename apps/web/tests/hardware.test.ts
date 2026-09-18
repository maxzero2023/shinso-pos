import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@shinso/db";
import {
  formatReceiptText,
  formatKitchenTicketText,
  getHardwareMode,
  isDeviceEffectivelyOffline,
  devicePrintError,
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

describe("hardware unit (AUT-68/71)", () => {
  it("defaults HARDWARE_MODE to simulator", () => {
    expect(getHardwareMode({} as unknown as NodeJS.ProcessEnv)).toBe("simulator");
    expect(getHardwareMode({ HARDWARE_MODE: "live" } as unknown as NodeJS.ProcessEnv)).toBe("live");
  });

  it("formats Japan 80mm receipt in Japanese", () => {
    const text = formatReceiptText({
      storeName: "シンソウデモ店",
      tableCode: "T1",
      areaName: "テーブル",
      checkId: "chk_demo_001",
      guestCount: 2,
      items: [{ name: "焼き鳥", qty: 2, unitPriceYen: 500 }],
      totalYen: 1000,
      paymentMethod: "paypay",
      paidAt: new Date("2026-09-18T12:00:00+09:00"),
    });
    expect(text).toMatch(/領\s*収\s*書/);
    expect(text).toContain("シンソウデモ店");
    expect(text).toContain("焼き鳥");
    expect(text).toMatch(/PayPay|paypay/);
  });

  it("formats kitchen ticket text", () => {
    const text = formatKitchenTicketText({
      storeName: "シンソウデモ店",
      tableCode: "T2",
      ticketId: "kt_1",
      checkId: "chk_1",
      firedAt: new Date(),
      lines: [{ name: "ビール", qty: 1 }],
    });
    expect(text).toMatch(/厨/);
    expect(text).toContain("ビール");
  });

  it("detects offline / out_of_paper", () => {
    expect(
      isDeviceEffectivelyOffline({
        status: "offline",
        lastHeartbeatAt: new Date(),
      })
    ).toBe(true);
    expect(
      devicePrintError({
        status: "out_of_paper",
        name: "PRT-01",
        lastHeartbeatAt: new Date(),
      })
    ).toMatch(/用紙切れ/);
  });
});

describe("hardware integration (AUT-68/69/71)", () => {
  let cookie = "";

  beforeAll(async () => {
    const store = await prisma.store.findFirst();
    expect(store).toBeTruthy();
    const devices = await prisma.device.findMany({ where: { storeId: store!.id } });
    expect(devices.length).toBeGreaterThanOrEqual(3);
    cookie = await login("floor@shinso.demo");
  });

  it("lists seeded devices", async () => {
    const res = await fetch(`${BASE}/api/devices`, { headers: { cookie } });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.mode).toBe("simulator");
    const types = data.devices.map((d: { type: string }) => d.type).sort();
    expect(types).toEqual(["kitchen_display", "printer", "t1_pos"].sort());
  });

  it("fire creates kitchen print job; pay creates receipt; out_of_paper fails visibly", async () => {
    const tablesRes = await fetch(`${BASE}/api/tables`, { headers: { cookie } });
    const tablesData = await tablesRes.json();
    const free = (tablesData.tables as Array<{ id: string; status: string }>).find(
      (t) => t.status === "free"
    );
    expect(free).toBeTruthy();

    const openRes = await fetch(`${BASE}/api/tables/${free!.id}/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ guestCount: 2 }),
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
      body: JSON.stringify({ menuItemId: item.id, qty: 1, modifierIds: [] }),
    });

    const fireRes = await fetch(`${BASE}/api/checks/${checkId}/fire`, {
      method: "POST",
      headers: { cookie },
    });
    const fireData = await fireRes.json();
    expect(fireRes.status).toBe(201);
    expect(fireData.ticket).toBeTruthy();
    expect(fireData.printJob).toBeTruthy();
    expect(fireData.printJob.checkId).toBe(checkId);
    expect(fireData.printJob.kitchenTicketId).toBe(fireData.ticket.id);
    expect(["printed", "failed"]).toContain(fireData.printJob.status);

    const checkRes = await fetch(`${BASE}/api/checks/${checkId}`, { headers: { cookie } });
    const checkData = await checkRes.json();
    const total = (checkData.check.totalYen ?? checkData.totalYen) as number;

    const payRes = await fetch(`${BASE}/api/checks/${checkId}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ method: "paypay", amountYen: total }),
    });
    const payData = await payRes.json();
    expect(payRes.status).toBe(200);
    expect(payData.printJob).toBeTruthy();
    expect(payData.printJob.type).toBe("receipt");
    expect(payData.printJob.contentText).toMatch(/領|合計/);

    const devicesRes = await fetch(`${BASE}/api/devices`, { headers: { cookie } });
    const devicesData = await devicesRes.json();
    const printer = devicesData.devices.find((d: { type: string }) => d.type === "printer");
    expect(printer).toBeTruthy();

    await fetch(`${BASE}/api/devices/${printer.id}/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ status: "out_of_paper" }),
    });

    const reprint = await fetch(`${BASE}/api/print-jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ type: "receipt", checkId, reprint: true }),
    });
    const reprintData = await reprint.json();
    expect(reprint.status).toBe(201);
    const job = reprintData.job ?? reprintData.printJob;
    expect(job.status).toBe("failed");
    expect(job.errorMessage).toMatch(/用紙切れ/);

    await fetch(`${BASE}/api/devices/${printer.id}/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ status: "online" }),
    });
  });

  it("heartbeat updates lastHeartbeatAt", async () => {
    const list = await fetch(`${BASE}/api/devices`, { headers: { cookie } });
    const data = await list.json();
    const t1 = data.devices.find((d: { type: string }) => d.type === "t1_pos");
    const res = await fetch(`${BASE}/api/devices/${t1.id}/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({}),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.device.status).toBe("online");
    expect(body.device.lastHeartbeatAt).toBeTruthy();
  });
});
